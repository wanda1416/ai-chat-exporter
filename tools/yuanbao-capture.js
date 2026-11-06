/* 腾讯元宝 API 抓取器（控制台粘贴，一次性开发工具）
 *
 * 用途：在已登录的 https://yuanbao.tencent.com 页面里被动录制它自己发出的
 *       /api/ 请求与响应，最后导出成一个 JSON 文件，用于编写 adapter-yuanbao
 *       的 fixtures 与解析逻辑。
 *
 * 使用：
 *   1. 打开元宝并用你要导出的账号登录好；
 *   2. F12 → Console，把本文件全部内容粘贴进去回车（粘贴后不要刷新页面）；
 *   3. 左侧栏上下滚动几次（触发分页），再点开 3~5 个不同形态的会话
 *      （至少含一个带"深度思考/联网搜索/上传文件"的）；
 *   4. 控制台执行  __YB.dump()  → 浏览器下载 yuanbao-capture-<时间>.json
 *   5. 把该文件放到本仓库 .capture/ 目录并告知文件名。
 *
 * 说明：脚本不主动发请求（不触碰风控），只旁路记录页面自身的调用；
 *       鉴权仍完全依赖你现有 Cookie。
 */
(function () {
  "use strict";

  if (window.__YB && window.__YB.version) {
    console.log("[YB] 抓取器已在运行，直接执行 __YB.dump() 导出。");
    return;
  }

  var MAX_BODY = 400 * 1000; // 单条响应最大记录字符数
  var records = [];
  var seen = Object.create(null);

  function isApi(url) {
    return /yuanbao\.tencent\.com\/api\//.test(url) || /^\/api\//.test(url);
  }

  function toAbsolute(url) {
    try {
      return new URL(url, location.href).href;
    } catch (e) {
      return String(url);
    }
  }

  function push(rec) {
    // 同一接口只留最新一份；POST 必须带上请求体，否则不同会话会被误判为同一请求
    var key =
      rec.method +
      " " +
      rec.url.replace(/[?&]cacheBust=[^&]*/g, "") +
      " " +
      (rec.reqBody || "");
    // 同一接口只留最新一份，避免轮询/重试把 body 撑爆
    if (seen[key] !== undefined) {
      var old = records[seen[key]];
      if (old && (old.status !== 200 || rec.status !== 200)) records[seen[key]] = rec;
      return;
    }
    seen[key] = records.length;
    records.push(rec);
    console.log("[YB] captured", rec.status, rec.method, rec.url.slice(0, 160));
  }

  function record(method, url, reqBody, status, text) {
    if (!text) return;
    var clipped = text.length > MAX_BODY ? text.slice(0, MAX_BODY) + "…[truncated]" : text;
    var json = null;
    if (/^\s*[[{]/.test(clipped) && clipped.indexOf("[truncated]") === -1) {
      try {
        json = JSON.parse(clipped);
      } catch (e) {
        json = null;
      }
    }
    push({
      method: method,
      url: toAbsolute(url),
      status: status,
      at: new Date().toISOString(),
      reqBody: typeof reqBody === "string" ? reqBody.slice(0, 8000) : null,
      contentType: null,
      raw: json ? null : clipped,
      json: json,
    });
  }

  /* ---------- fetch ---------- */
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || String(input);
      var method = (init && init.method) || (input && input.method) || "GET";
      var reqBody = null;
      try {
        if (init && init.body) reqBody = typeof init.body === "string" ? init.body : "[non-string body]";
      } catch (e) {}
      var result = origFetch.apply(this, arguments);
      if (isApi(url)) {
        result
          .then(function (res) {
            var ct = "";
            try {
              ct = res.headers.get("content-type") || "";
            } catch (e) {}
            if (/event-stream|octet-stream|image\//.test(ct)) return;
            res
              .clone()
              .text()
              .then(function (txt) {
                record(method.toUpperCase(), url, reqBody, res.status, txt);
              })
              .catch(function () {});
          })
          .catch(function () {});
      }
      return result;
    };
  }

  /* ---------- XMLHttpRequest ---------- */
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__yb = { method: String(method || "GET").toUpperCase(), url: String(url) };
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    var info = this.__yb;
    if (info && isApi(info.url)) {
      var xhr = this;
      xhr.addEventListener("load", function () {
        var txt = "";
        try {
          if (xhr.responseType === "" || xhr.responseType === "text") txt = xhr.responseText;
          else if (xhr.responseType === "json") txt = JSON.stringify(xhr.response);
        } catch (e) {}
        record(info.method, info.url, typeof body === "string" ? body : null, xhr.status, txt);
      });
    }
    return origSend.apply(this, arguments);
  };

  /* ---------- WebSocket（部分会话详情走 ws，仅记录帧数不做解析） ---------- */
  try {
    var OrigWS = window.WebSocket;
    if (OrigWS) {
      window.WebSocket = function (url, protocols) {
        var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);
        if (isApi(String(url))) {
          var frames = 0;
          ws.addEventListener("message", function () {
            frames++;
          });
          console.log("[YB] WebSocket opened:", String(url));
        }
        return ws;
      };
      window.WebSocket.prototype = OrigWS.prototype;
    }
  } catch (e) {}

  /* ---------- 侧栏 DOM 兜底（会话 id + 标题） ---------- */
  function sidebar() {
    var out = [];
    var nodes = document.querySelectorAll('a[href], [data-conv-id], [data-conversation-id]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var href = el.getAttribute && el.getAttribute("href");
      var id = el.getAttribute("data-conv-id") || el.getAttribute("data-conversation-id");
      if (!href && !id) continue;
      if (href && !/\/chat\//.test(href)) continue;
      out.push({
        href: href || null,
        id: id || null,
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
      });
    }
    // 去重
    var uniq = [];
    var keys = Object.create(null);
    for (var j = 0; j < out.length; j++) {
      var k = out[j].href || out[j].id;
      if (keys[k]) continue;
      keys[k] = 1;
      uniq.push(out[j]);
    }
    return uniq;
  }

  function dump() {
    var payload = {
      capturedAt: new Date().toISOString(),
      pageUrl: location.href,
      userAgent: navigator.userAgent,
      apiRequests: records,
      sidebar: sidebar(),
    };
    var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      "yuanbao-capture-" +
      new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) +
      ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 5000);
    console.log(
      "[YB] 已记录 " + records.length + " 条 API、侧栏 " + payload.sidebar.length + " 项，文件已下载。"
    );
    return payload;
  }

  window.__YB = {
    version: "1",
    dump: dump,
    records: function () {
      return records;
    },
    sidebar: sidebar,
    /* 手动探测一个端点（默认不调用，避免风控）：__YB.probe("/api/xxx", {body}) */
    probe: function (path, body) {
      return fetch(path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
        .then(function (r) {
          return r.text().then(function (t) {
            console.log("[YB] probe", r.status, path, t.slice(0, 2000));
            return t;
          });
        })
        .catch(function (e) {
          console.warn("[YB] probe failed", path, e);
        });
    },
  };

  console.log("[YB] 抓取器已就绪：滚动侧栏 + 点开几个会话，然后执行 __YB.dump()");
})();

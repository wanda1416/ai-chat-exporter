// ==UserScript==
// @name               AI Chat Exporter (Kimi & Gemini)
// @name:zh-CN         AI 对话导出（Kimi & Gemini）
// @namespace          https://github.com/wanda1416/ai-chat-exporter
// @version            0.1.0
// @author             wanda1416
// @description        Batch-export your Kimi & Gemini conversations to Markdown + JSON, zipped. Pick a range, one click — runs entirely in your browser, no data sent anywhere.
// @description:zh-CN  一键批量导出 Kimi / Gemini 全部对话为 Markdown + JSON 并打包 zip。支持导出区间选择，纯本地运行，数据不离开浏览器。
// @license            MIT
// @homepageURL        https://github.com/wanda1416/ai-chat-exporter
// @supportURL         https://github.com/wanda1416/ai-chat-exporter/issues
// @downloadURL        https://raw.githubusercontent.com/wanda1416/ai-chat-exporter/master/apps/userscript/dist/ai-chat-exporter.user.js
// @updateURL          https://raw.githubusercontent.com/wanda1416/ai-chat-exporter/master/apps/userscript/dist/ai-chat-exporter.user.js
// @match              https://www.kimi.com/*
// @match              https://gemini.google.com/*
// @grant              none
// @run-at             document-idle
// ==/UserScript==

/* eslint-disable */

(function () {
  'use strict';

  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  const PLATFORM$1 = "gemini";
  const asArray = (v) => Array.isArray(v) ? v : [];
  const asString = (v) => typeof v === "string" && v.length > 0 ? v : void 0;
  const at = (v, i) => Array.isArray(v) ? v[i] : void 0;
  function isoFromTuple(tuple) {
    const seconds = at(tuple, 0);
    if (typeof seconds !== "number") return void 0;
    return new Date(seconds * 1e3).toISOString();
  }
  function bareId(id) {
    return id.startsWith("c_") ? id.slice(2) : id;
  }
  function findModel(candidatesBlock) {
    const arr = asArray(candidatesBlock);
    for (let i = arr.length - 1; i >= 0; i--) {
      const s = asString(arr[i]);
      if (s && !/^(rc_|r_|c_|m_)/.test(s)) return s;
    }
    return void 0;
  }
  function extractRpcPayload(rawBody, rpcid) {
    const body = rawBody.replace(/^\)\]\}'\s*/, "");
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("[")) continue;
      let chunk;
      try {
        chunk = JSON.parse(trimmed);
      } catch {
        continue;
      }
      for (const entry of asArray(chunk)) {
        if (Array.isArray(entry) && entry[0] === "wrb.fr" && entry[1] === rpcid && typeof entry[2] === "string") {
          return JSON.parse(entry[2]);
        }
      }
    }
    throw new Error(`Gemini batchexecute response had no "${rpcid}" payload.`);
  }
  function parseConversationList(payload) {
    const items = asArray(at(payload, 2));
    const metas = [];
    for (const item of items) {
      const id = asString(at(item, 0));
      if (!id) continue;
      const meta = {
        id,
        platform: PLATFORM$1,
        title: asString(at(item, 1)) ?? ""
      };
      const createdAt = isoFromTuple(at(item, 5));
      if (createdAt) meta.createdAt = createdAt;
      metas.push(meta);
    }
    return metas;
  }
  function nextPageToken(payload) {
    return asString(at(payload, 1));
  }
  function detailTurns(payload) {
    return asArray(at(payload, 0));
  }
  function detailNextPageToken(payload) {
    return asString(at(payload, 1));
  }
  function turnResponseId(turn) {
    return asString(at(at(turn, 0), 1));
  }
  function turnTime(turn) {
    const seconds = at(at(turn, 4), 0);
    if (typeof seconds !== "number") return void 0;
    const nanos = at(at(turn, 4), 1);
    return seconds + (typeof nanos === "number" ? nanos / 1e9 : 0);
  }
  function selectedMarkdown(candidatesBlock) {
    const candidates = asArray(at(candidatesBlock, 0));
    const selectedId = asString(at(candidatesBlock, 3));
    const chosen = candidates.find((c) => asString(at(c, 0)) === selectedId) ?? candidates[0];
    return asString(at(at(chosen, 1), 0)) ?? "";
  }
  function parseTurn(turn) {
    const messages = [];
    const userText = asString(at(at(at(turn, 2), 0), 0));
    const userId = asString(at(at(turn, 2), 4));
    if (userText) {
      const content = [{ type: "text", text: userText }];
      messages.push({ id: userId ?? `${asString(at(at(turn, 0), 1)) ?? "turn"}-user`, role: "user", content });
    }
    const candidatesBlock = at(turn, 3);
    const markdown = selectedMarkdown(candidatesBlock);
    const assistantId = asString(at(candidatesBlock, 3));
    if (markdown || assistantId) {
      const content = markdown ? [{ type: "text", text: markdown }] : [];
      const message = {
        id: assistantId ?? `${asString(at(at(turn, 0), 1)) ?? "turn"}-assistant`,
        role: "assistant",
        content
      };
      const timestamp = isoFromTuple(at(turn, 4));
      if (timestamp) message.timestamp = timestamp;
      const model = findModel(candidatesBlock);
      if (model) message.model = model;
      messages.push(message);
    }
    return messages;
  }
  function toConversation$1(conversationId, payload, title) {
    var _a2, _b2, _c;
    const turns = [...detailTurns(payload)].sort((a, b) => {
      const ta = turnTime(a);
      const tb = turnTime(b);
      return ta !== void 0 && tb !== void 0 ? ta - tb : 0;
    });
    const messages = turns.flatMap(parseTurn);
    const firstUserText = (_b2 = (_a2 = messages.find((m) => m.role === "user")) == null ? void 0 : _a2.content.find(
      (part) => part.type === "text"
    )) == null ? void 0 : _b2.text;
    const derivedTitle = firstUserText ? firstUserText.slice(0, 40) + (firstUserText.length > 40 ? "…" : "") : "Gemini conversation";
    const conversation = {
      schemaVersion: "1",
      id: conversationId,
      platform: PLATFORM$1,
      title: title ?? derivedTitle,
      messages
    };
    const model = (_c = messages.find((m) => m.model)) == null ? void 0 : _c.model;
    if (model) conversation.model = model;
    const timestamps = messages.map((m) => m.timestamp).filter((t) => Boolean(t));
    if (timestamps.length) {
      conversation.createdAt = timestamps[0];
      conversation.updatedAt = timestamps[timestamps.length - 1];
    }
    conversation.sourceUrl = `https://gemini.google.com/app/${bareId(conversationId)}`;
    return conversation;
  }
  const RPC_LIST = "MaZiqc";
  const RPC_DETAIL = "hNvQHb";
  const BATCHEXECUTE_URL = "https://gemini.google.com/_/BardChatUi/data/batchexecute";
  const LIST_PAGE_SIZE = 20;
  const DETAIL_PAGE_SIZE = 100;
  class GeminiClient {
    constructor(options = {}) {
      __publicField(this, "fetchImpl");
      __publicField(this, "language");
      __publicField(this, "explicitAt");
      __publicField(this, "explicitBl");
      __publicField(this, "explicitSid");
      __publicField(this, "reqId");
      this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
      this.language = options.language ?? "en";
      this.explicitAt = options.atToken;
      this.explicitBl = options.blVersion;
      this.explicitSid = options.fSid;
      this.reqId = Math.floor(Math.random() * 9e4) + 1e4;
    }
    get wiz() {
      return globalThis.WIZ_global_data ?? {};
    }
    resolveAt() {
      const at2 = this.explicitAt ?? this.wiz.SNlM0e;
      if (!at2) {
        throw new Error(
          "Gemini `at` token not found. Provide `atToken` or run where window.WIZ_global_data is set."
        );
      }
      return at2;
    }
    async call(rpcid, innerPayload) {
      const url = new URL(BATCHEXECUTE_URL);
      url.searchParams.set("rpcids", rpcid);
      url.searchParams.set("source-path", "/app");
      const bl = this.explicitBl ?? this.wiz.cfb2h;
      const sid = this.explicitSid ?? this.wiz.FdrFJe;
      if (bl) url.searchParams.set("bl", bl);
      if (sid) url.searchParams.set("f.sid", sid);
      url.searchParams.set("hl", this.language);
      url.searchParams.set("_reqid", String(this.reqId += 1e5));
      url.searchParams.set("rt", "c");
      const envelope = [[[rpcid, JSON.stringify(innerPayload), null, "generic"]]];
      const body = `f.req=${encodeURIComponent(JSON.stringify(envelope))}&at=${encodeURIComponent(this.resolveAt())}&`;
      const response = await this.fetchImpl(url.toString(), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body
      });
      if (!response.ok) {
        throw new Error(`Gemini ${rpcid} failed: ${response.status} ${response.statusText}`);
      }
      return extractRpcPayload(await response.text(), rpcid);
    }
    /** One page of the sidebar history. `pageToken` continues a previous page. */
    listConversations(pageToken) {
      return this.call(RPC_LIST, [LIST_PAGE_SIZE, pageToken ?? null, [0, null, 1]]);
    }
    /**
     * One page of a conversation's turns, newest-first. Accepts ids with or
     * without `c_`. `pageToken` continues into older turns (same continuation
     * mechanism as the list RPC; token surfaces at payload[1]).
     */
    getConversation(conversationId, pageToken) {
      const cid = conversationId.startsWith("c_") ? conversationId : `c_${conversationId}`;
      return this.call(RPC_DETAIL, [cid, DETAIL_PAGE_SIZE, pageToken ?? null, 1, [0], [4], null, 1]);
    }
  }
  const MAX_PAGES$1 = 1e3;
  class GeminiAdapter {
    constructor(options = {}) {
      __publicField(this, "platform", PLATFORM$1);
      __publicField(this, "client");
      __publicField(this, "titles", /* @__PURE__ */ new Map());
      this.client = new GeminiClient(options);
    }
    detect() {
      if (typeof location === "undefined") return false;
      return /(^|\.)gemini\.google\.com$/.test(location.hostname);
    }
    async *listConversations() {
      let pageToken;
      for (let page = 0; page < MAX_PAGES$1; page++) {
        const payload = await this.client.listConversations(pageToken);
        const metas = parseConversationList(payload);
        for (const meta of metas) {
          this.titles.set(meta.id, meta.title);
          yield meta;
        }
        pageToken = nextPageToken(payload);
        if (!pageToken || metas.length === 0) break;
      }
    }
    async fetchConversation(id) {
      const allTurns = [];
      const seen = /* @__PURE__ */ new Set();
      let pageToken;
      for (let page = 0; page < MAX_PAGES$1; page++) {
        const payload = await this.client.getConversation(id, pageToken);
        const turns = detailTurns(payload);
        for (const turn of turns) {
          const key = turnResponseId(turn);
          if (key && seen.has(key)) continue;
          if (key) seen.add(key);
          allTurns.push(turn);
        }
        pageToken = detailNextPageToken(payload);
        if (!pageToken || turns.length === 0) break;
      }
      const combined = [allTurns, null, null, []];
      return toConversation$1(id, combined, this.titles.get(id));
    }
  }
  const BASE_URL = "https://www.kimi.com/apiv2/";
  const FEED_SERVICE = "kimi.gateway.feed.v1.FeedService";
  const CHAT_SERVICE = "kimi.gateway.chat.v1.ChatService";
  class KimiClient {
    constructor(options = {}) {
      __publicField(this, "fetchImpl");
      __publicField(this, "language");
      __publicField(this, "explicitToken");
      this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
      this.language = options.language ?? "zh-CN";
      this.explicitToken = options.token;
    }
    resolveToken() {
      var _a2;
      const token = this.explicitToken ?? ((_a2 = globalThis.localStorage) == null ? void 0 : _a2.getItem("access_token")) ?? void 0;
      if (!token) {
        throw new Error(
          "Kimi access token not found. Provide `token` or run where localStorage.access_token is set."
        );
      }
      return token;
    }
    async call(service, method, body) {
      const response = await this.fetchImpl(`${BASE_URL}${service}/${method}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.resolveToken()}`,
          "x-msh-platform": "web",
          "x-language": this.language
        },
        body: JSON.stringify(body ?? {})
      });
      if (!response.ok) {
        throw new Error(`Kimi ${service}/${method} failed: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    }
    listFeeds(request) {
      return this.call(FEED_SERVICE, "ListFeeds", request);
    }
    getChat(chatId) {
      return this.call(CHAT_SERVICE, "GetChat", { chat_id: chatId });
    }
    listMessages(chatId) {
      return this.call(CHAT_SERVICE, "ListMessages", { chat_id: chatId });
    }
  }
  const PLATFORM = "kimi";
  function toRole(raw) {
    const v = (raw ?? "").toLowerCase();
    if (v.includes("assistant")) return "assistant";
    if (v.includes("system")) return "system";
    return "user";
  }
  function parseBlocks(blocks) {
    var _a2;
    const content = [];
    const thoughts = [];
    const summaries = [];
    for (const block of blocks ?? []) {
      if ((_a2 = block.text) == null ? void 0 : _a2.content) {
        content.push({ type: "text", text: block.text.content });
      } else if (block.think) {
        if (block.think.content) thoughts.push(block.think.content);
        if (block.think.summary) summaries.push(block.think.summary);
      }
    }
    const reasoning = thoughts.length ? {
      content: thoughts.join("\n\n"),
      ...summaries.length ? { summary: summaries.join("\n\n") } : {}
    } : void 0;
    return { content, reasoning };
  }
  function parseReferences(references) {
    var _a2;
    const citations = [];
    const seen = /* @__PURE__ */ new Set();
    for (const ref of references ?? []) {
      for (const item of ref.items ?? []) {
        const base = (_a2 = item.search) == null ? void 0 : _a2.base;
        if (!base) continue;
        const key = base.url ?? base.title ?? "";
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const citation = {};
        if (base.title) citation.title = base.title;
        if (base.url) citation.url = base.url;
        if (base.snippet) citation.snippet = base.snippet;
        citations.push(citation);
      }
    }
    return citations;
  }
  function parseMessage(raw) {
    const { content, reasoning } = parseBlocks(raw.blocks);
    const citations = parseReferences(raw.references);
    const message = {
      id: raw.id ?? "",
      role: toRole(raw.role),
      content
    };
    if (raw.createTime) message.timestamp = raw.createTime;
    if (reasoning) message.reasoning = reasoning;
    if (citations.length) message.citations = citations;
    if (raw.parentId !== void 0) message.parentId = raw.parentId || null;
    return message;
  }
  function sortChronologically(messages) {
    const originalIndex = /* @__PURE__ */ new Map();
    messages.forEach((m, i) => originalIndex.set(m, i));
    messages.sort((a, b) => {
      const ta = a.timestamp ?? "";
      const tb = b.timestamp ?? "";
      if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
      return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
    });
  }
  function linkChildren(messages) {
    const childrenOf = /* @__PURE__ */ new Map();
    for (const m of messages) {
      if (m.parentId) {
        const list = childrenOf.get(m.parentId) ?? [];
        list.push(m.id);
        childrenOf.set(m.parentId, list);
      }
    }
    for (const m of messages) {
      const children = childrenOf.get(m.id);
      if (children == null ? void 0 : children.length) m.childrenIds = children;
    }
  }
  function parseAttachments(chat) {
    return (chat.files ?? []).map((file, index) => {
      var _a2;
      const meta = file.meta ?? {};
      const size = typeof meta.sizeBytes === "string" ? Number(meta.sizeBytes) : meta.sizeBytes;
      const attachment = { id: meta.checksum || meta.name || `file-${index}` };
      if (meta.name) attachment.name = meta.name;
      if (meta.contentType) attachment.mimeType = meta.contentType;
      if (typeof size === "number" && Number.isFinite(size)) attachment.sizeBytes = size;
      if ((_a2 = file.blob) == null ? void 0 : _a2.signUrl) attachment.url = file.blob.signUrl;
      if (meta.checksum) attachment.checksum = meta.checksum;
      return attachment;
    });
  }
  function parseFeeds(response) {
    const metas = [];
    for (const item of response.items ?? []) {
      const chat = item.chat;
      if (!(chat == null ? void 0 : chat.id)) continue;
      const meta = { id: chat.id, platform: PLATFORM, title: chat.name ?? "" };
      if (chat.createTime) meta.createdAt = chat.createTime;
      if (chat.updateTime) meta.updatedAt = chat.updateTime;
      metas.push(meta);
    }
    return metas;
  }
  function toConversation(chatId, chat, messages) {
    const summary = chat.chat ?? {};
    const attachments = parseAttachments(chat);
    const parsedMessages = (messages.messages ?? []).map(parseMessage);
    sortChronologically(parsedMessages);
    linkChildren(parsedMessages);
    const conversation = {
      schemaVersion: "1",
      id: summary.id ?? chatId,
      platform: PLATFORM,
      title: summary.name ?? "",
      messages: parsedMessages
    };
    if (summary.createTime) conversation.createdAt = summary.createTime;
    if (summary.updateTime) conversation.updatedAt = summary.updateTime;
    if (attachments.length) conversation.attachments = attachments;
    conversation.sourceUrl = `https://www.kimi.com/chat/${conversation.id}`;
    return conversation;
  }
  const DEFAULT_PAGE_SIZE = 30;
  const MAX_PAGES = 1e3;
  class KimiAdapter {
    constructor(options = {}) {
      __publicField(this, "platform", PLATFORM);
      __publicField(this, "client");
      this.client = new KimiClient(options);
    }
    detect() {
      if (typeof location === "undefined") return false;
      return /(^|\.)kimi\.com$/.test(location.hostname);
    }
    async *listConversations() {
      let pageToken;
      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await this.client.listFeeds({
          page_size: DEFAULT_PAGE_SIZE,
          filter_types: ["FEED_TYPE_CHAT", "FEED_TYPE_TASK"],
          include_pinned: true,
          ...pageToken ? { page_token: pageToken } : {}
        });
        const metas = parseFeeds(response);
        for (const meta of metas) yield meta;
        pageToken = response.nextPageToken;
        if (!pageToken || metas.length === 0) break;
      }
    }
    async fetchConversation(id) {
      const [chat, messages] = await Promise.all([
        this.client.getChat(id),
        this.client.listMessages(id)
      ]);
      return toConversation(id, chat, messages);
    }
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function throttled(fn, minMs) {
    let last = 0;
    return async (...args) => {
      const wait = last + minMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      return fn(...args);
    };
  }
  async function exportConversations(options) {
    const { adapter, exporters, ids, range, throttleMs = 500, onProgress, onError } = options;
    const metas = [];
    const wanted = ids ? new Set(ids) : null;
    const from = Math.max(1, Math.floor((range == null ? void 0 : range.from) ?? 1));
    const to = Math.floor((range == null ? void 0 : range.to) ?? Infinity);
    let position = 0;
    onProgress == null ? void 0 : onProgress({ phase: "list", completed: 0, total: 0 });
    for await (const meta of adapter.listConversations()) {
      if (wanted && !wanted.has(meta.id)) continue;
      position += 1;
      if (position < from) continue;
      metas.push(meta);
      onProgress == null ? void 0 : onProgress({ phase: "list", completed: 0, total: metas.length });
      if (position >= to) break;
    }
    const fetchOne = throttled((id) => adapter.fetchConversation(id), throttleMs);
    const files = [];
    const conversations = [];
    const failed = [];
    for (const meta of metas) {
      onProgress == null ? void 0 : onProgress({ phase: "fetch", meta, completed: conversations.length, total: metas.length });
      try {
        const conversation = await fetchOne(meta.id);
        conversations.push(conversation);
        onProgress == null ? void 0 : onProgress({ phase: "export", meta, completed: conversations.length, total: metas.length });
        for (const exporter of exporters) {
          files.push(exporter.export(conversation));
        }
      } catch (error) {
        failed.push(meta.id);
        onError == null ? void 0 : onError(meta.id, error);
      }
    }
    onProgress == null ? void 0 : onProgress({ phase: "done", completed: conversations.length, total: metas.length });
    return { files, conversations, failed };
  }
  function slugify(input, fallback = "untitled") {
    const slug = input.normalize("NFKC").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    return slug || fallback;
  }
  function conversationBaseName(conversation) {
    const date = (conversation.createdAt ?? conversation.updatedAt ?? "").slice(0, 10);
    const title = slugify(conversation.title, conversation.id);
    return date ? `${date}-${title}` : title;
  }
  function jsonExporter() {
    return {
      id: "json",
      extension: "json",
      export(conversation) {
        return {
          path: `${conversation.platform}/json/${conversationBaseName(conversation)}.json`,
          content: JSON.stringify(conversation, null, 2) + "\n",
          mimeType: "application/json"
        };
      }
    };
  }
  const ROLE_HEADING = {
    user: "🧑 User",
    assistant: "🤖 Assistant",
    system: "⚙️ System"
  };
  function renderPart(part) {
    switch (part.type) {
      case "text":
        return part.text;
      case "code":
        return "```" + (part.language ?? "") + "\n" + part.code + "\n```";
      case "table": {
        const header = `| ${part.headers.join(" | ")} |`;
        const divider = `| ${part.headers.map(() => "---").join(" | ")} |`;
        const rows = part.rows.map((row) => `| ${row.join(" | ")} |`);
        return [header, divider, ...rows].join("\n");
      }
      case "image":
        return `![${part.alt ?? ""}](${part.url ?? part.attachmentId ?? ""})`;
      case "file":
        return `📎 [${part.name ?? part.attachmentId}](${part.attachmentId})`;
    }
  }
  function renderMessage(message) {
    var _a2;
    const blocks = [];
    if (message.reasoning) {
      blocks.push(
        "<details><summary>💭 Reasoning</summary>\n\n" + message.reasoning.content + "\n\n</details>"
      );
    }
    const body = message.content.map(renderPart).join("\n\n");
    if (body) blocks.push(body);
    if ((_a2 = message.citations) == null ? void 0 : _a2.length) {
      const items = message.citations.map((c, i) => {
        const label = c.title ?? c.url ?? `Source ${i + 1}`;
        return c.url ? `${i + 1}. [${label}](${c.url})` : `${i + 1}. ${label}`;
      });
      blocks.push("**Sources**\n\n" + items.join("\n"));
    }
    if (!blocks.length) return null;
    return [`## ${ROLE_HEADING[message.role]}`, ...blocks].join("\n\n");
  }
  function renderMarkdown(conversation) {
    var _a2;
    const metaBits = [
      `Platform: ${conversation.platform}`,
      conversation.model ? `Model: ${conversation.model}` : null,
      conversation.updatedAt ? `Updated: ${conversation.updatedAt}` : null
    ].filter(Boolean);
    const parts = [`# ${conversation.title || conversation.id}`];
    if (metaBits.length) parts.push(`> ${metaBits.join(" · ")}`);
    for (const message of conversation.messages) {
      const rendered = renderMessage(message);
      if (rendered) parts.push(rendered);
    }
    if ((_a2 = conversation.attachments) == null ? void 0 : _a2.length) {
      const items = conversation.attachments.map((a) => {
        const label = a.name ?? a.id;
        return a.url ? `- [${label}](${a.url})` : `- ${label}`;
      });
      parts.push("## Attachments\n\n" + items.join("\n"));
    }
    return parts.join("\n\n") + "\n";
  }
  function markdownExporter() {
    return {
      id: "markdown",
      extension: "md",
      export(conversation) {
        return {
          path: `${conversation.platform}/markdown/${conversationBaseName(conversation)}.md`,
          content: renderMarkdown(conversation),
          mimeType: "text/markdown"
        };
      }
    };
  }
  var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
  var fleb = new u8([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0,
    /* unused */
    0,
    0,
    /* impossible */
    0
  ]);
  var fdeb = new u8([
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    /* unused */
    0,
    0
  ]);
  var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var freb = function(eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
      b[i] = start += 1 << eb[i - 1];
    }
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
      for (var j = b[i]; j < b[i + 1]; ++j) {
        r[j] = j - b[i] << 5 | i;
      }
    }
    return { b, r };
  };
  var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
  fl[28] = 258, revfl[258] = 28;
  var _b = freb(fdeb, 0), revfd = _b.r;
  var rev = new u16(32768);
  for (var i = 0; i < 32768; ++i) {
    var x = (i & 43690) >> 1 | (i & 21845) << 1;
    x = (x & 52428) >> 2 | (x & 13107) << 2;
    x = (x & 61680) >> 4 | (x & 3855) << 4;
    rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
  }
  var hMap = function(cd, mb, r) {
    var s = cd.length;
    var i = 0;
    var l = new u16(mb);
    for (; i < s; ++i) {
      if (cd[i])
        ++l[cd[i] - 1];
    }
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
      le[i] = le[i - 1] + l[i - 1] << 1;
    }
    var co;
    {
      co = new u16(s);
      for (i = 0; i < s; ++i) {
        if (cd[i]) {
          co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
        }
      }
    }
    return co;
  };
  var flt = new u8(288);
  for (var i = 0; i < 144; ++i)
    flt[i] = 8;
  for (var i = 144; i < 256; ++i)
    flt[i] = 9;
  for (var i = 256; i < 280; ++i)
    flt[i] = 7;
  for (var i = 280; i < 288; ++i)
    flt[i] = 8;
  var fdt = new u8(32);
  for (var i = 0; i < 32; ++i)
    fdt[i] = 5;
  var flm = /* @__PURE__ */ hMap(flt, 9);
  var fdm = /* @__PURE__ */ hMap(fdt, 5);
  var shft = function(p) {
    return (p + 7) / 8 | 0;
  };
  var slc = function(v, s, e) {
    if (e == null || e > v.length)
      e = v.length;
    return new u8(v.subarray(s, e));
  };
  var ec = [
    "unexpected EOF",
    "invalid block type",
    "invalid length/literal",
    "invalid distance",
    "stream finished",
    "no stream handler",
    ,
    // determined by compression function
    "no callback",
    "invalid UTF-8 data",
    "extra field too long",
    "date not in range 1980-2099",
    "filename too long",
    "stream finishing",
    "invalid zip data"
    // determined by unknown compression method
  ];
  var err = function(ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
      Error.captureStackTrace(e, err);
    if (!nt)
      throw e;
    return e;
  };
  var wbits = function(d, p, v) {
    v <<= p & 7;
    var o = p / 8 | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
  };
  var wbits16 = function(d, p, v) {
    v <<= p & 7;
    var o = p / 8 | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
    d[o + 2] |= v >> 16;
  };
  var hTree = function(d, mb) {
    var t = [];
    for (var i = 0; i < d.length; ++i) {
      if (d[i])
        t.push({ s: i, f: d[i] });
    }
    var s = t.length;
    var t2 = t.slice();
    if (!s)
      return { t: et, l: 0 };
    if (s == 1) {
      var v = new u8(t[0].s + 1);
      v[t[0].s] = 1;
      return { t: v, l: 1 };
    }
    t.sort(function(a, b) {
      return a.f - b.f;
    });
    t.push({ s: -1, f: 25001 });
    var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
    t[0] = { s: -1, f: l.f + r.f, l, r };
    while (i1 != s - 1) {
      l = t[t[i0].f < t[i2].f ? i0++ : i2++];
      r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
      t[i1++] = { s: -1, f: l.f + r.f, l, r };
    }
    var maxSym = t2[0].s;
    for (var i = 1; i < s; ++i) {
      if (t2[i].s > maxSym)
        maxSym = t2[i].s;
    }
    var tr = new u16(maxSym + 1);
    var mbt = ln(t[i1 - 1], tr, 0);
    if (mbt > mb) {
      var i = 0, dt = 0;
      var lft = mbt - mb, cst = 1 << lft;
      t2.sort(function(a, b) {
        return tr[b.s] - tr[a.s] || a.f - b.f;
      });
      for (; i < s; ++i) {
        var i2_1 = t2[i].s;
        if (tr[i2_1] > mb) {
          dt += cst - (1 << mbt - tr[i2_1]);
          tr[i2_1] = mb;
        } else
          break;
      }
      dt >>= lft;
      while (dt > 0) {
        var i2_2 = t2[i].s;
        if (tr[i2_2] < mb)
          dt -= 1 << mb - tr[i2_2]++ - 1;
        else
          ++i;
      }
      for (; i >= 0 && dt; --i) {
        var i2_3 = t2[i].s;
        if (tr[i2_3] == mb) {
          --tr[i2_3];
          ++dt;
        }
      }
      mbt = mb;
    }
    return { t: new u8(tr), l: mbt };
  };
  var ln = function(n, l, d) {
    return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
  };
  var lc = function(c) {
    var s = c.length;
    while (s && !c[--s])
      ;
    var cl = new u16(++s);
    var cli = 0, cln = c[0], cls = 1;
    var w = function(v) {
      cl[cli++] = v;
    };
    for (var i = 1; i <= s; ++i) {
      if (c[i] == cln && i != s)
        ++cls;
      else {
        if (!cln && cls > 2) {
          for (; cls > 138; cls -= 138)
            w(32754);
          if (cls > 2) {
            w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
            cls = 0;
          }
        } else if (cls > 3) {
          w(cln), --cls;
          for (; cls > 6; cls -= 6)
            w(8304);
          if (cls > 2)
            w(cls - 3 << 5 | 8208), cls = 0;
        }
        while (cls--)
          w(cln);
        cls = 1;
        cln = c[i];
      }
    }
    return { c: cl.subarray(0, cli), n: s };
  };
  var clen = function(cf, cl) {
    var l = 0;
    for (var i = 0; i < cl.length; ++i)
      l += cf[i] * cl[i];
    return l;
  };
  var wfblk = function(out, pos, dat) {
    var s = dat.length;
    var o = shft(pos + 2);
    out[o] = s & 255;
    out[o + 1] = s >> 8;
    out[o + 2] = out[o] ^ 255;
    out[o + 3] = out[o + 1] ^ 255;
    for (var i = 0; i < s; ++i)
      out[o + i + 4] = dat[i];
    return (o + 4 + s) * 8;
  };
  var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
    wbits(out, p++, final);
    ++lf[256];
    var _a2 = hTree(lf, 15), dlt = _a2.t, mlb = _a2.l;
    var _b2 = hTree(df, 15), ddt = _b2.t, mdb = _b2.l;
    var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
    var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
    var lcfreq = new u16(19);
    for (var i = 0; i < lclt.length; ++i)
      ++lcfreq[lclt[i] & 31];
    for (var i = 0; i < lcdt.length; ++i)
      ++lcfreq[lcdt[i] & 31];
    var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
    var nlcc = 19;
    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
      ;
    var flen = bl + 5 << 3;
    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
    var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
    if (bs >= 0 && flen <= ftlen && flen <= dtlen)
      return wfblk(out, p, dat.subarray(bs, bs + bl));
    var lm, ll, dm, dl;
    wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
    if (dtlen < ftlen) {
      lm = hMap(dlt, mlb), ll = dlt, dm = hMap(ddt, mdb), dl = ddt;
      var llm = hMap(lct, mlcb);
      wbits(out, p, nlc - 257);
      wbits(out, p + 5, ndc - 1);
      wbits(out, p + 10, nlcc - 4);
      p += 14;
      for (var i = 0; i < nlcc; ++i)
        wbits(out, p + 3 * i, lct[clim[i]]);
      p += 3 * nlcc;
      var lcts = [lclt, lcdt];
      for (var it = 0; it < 2; ++it) {
        var clct = lcts[it];
        for (var i = 0; i < clct.length; ++i) {
          var len = clct[i] & 31;
          wbits(out, p, llm[len]), p += lct[len];
          if (len > 15)
            wbits(out, p, clct[i] >> 5 & 127), p += clct[i] >> 12;
        }
      }
    } else {
      lm = flm, ll = flt, dm = fdm, dl = fdt;
    }
    for (var i = 0; i < li; ++i) {
      var sym = syms[i];
      if (sym > 255) {
        var len = sym >> 18 & 31;
        wbits16(out, p, lm[len + 257]), p += ll[len + 257];
        if (len > 7)
          wbits(out, p, sym >> 23 & 31), p += fleb[len];
        var dst = sym & 31;
        wbits16(out, p, dm[dst]), p += dl[dst];
        if (dst > 3)
          wbits16(out, p, sym >> 5 & 8191), p += fdeb[dst];
      } else {
        wbits16(out, p, lm[sym]), p += ll[sym];
      }
    }
    wbits16(out, p, lm[256]);
    return p + ll[256];
  };
  var deo = /* @__PURE__ */ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
  var et = /* @__PURE__ */ new u8(0);
  var dflt = function(dat, lvl, plvl, pre, post, st) {
    var s = st.z || dat.length;
    var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
    var w = o.subarray(pre, o.length - post);
    var lst = st.l;
    var pos = (st.r || 0) & 7;
    if (lvl) {
      if (pos)
        w[0] = st.r >> 3;
      var opt = deo[lvl - 1];
      var n = opt >> 13, c = opt & 8191;
      var msk_1 = (1 << plvl) - 1;
      var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
      var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
      var hsh = function(i2) {
        return (dat[i2] ^ dat[i2 + 1] << bs1_1 ^ dat[i2 + 2] << bs2_1) & msk_1;
      };
      var syms = new i32(25e3);
      var lf = new u16(288), df = new u16(32);
      var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
      for (; i + 2 < s; ++i) {
        var hv = hsh(i);
        var imod = i & 32767, pimod = head[hv];
        prev[imod] = pimod;
        head[hv] = imod;
        if (wi <= i) {
          var rem = s - i;
          if ((lc_1 > 7e3 || li > 24576) && (rem > 423 || !lst)) {
            pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
            li = lc_1 = eb = 0, bs = i;
            for (var j = 0; j < 286; ++j)
              lf[j] = 0;
            for (var j = 0; j < 30; ++j)
              df[j] = 0;
          }
          var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
          if (rem > 2 && hv == hsh(i - dif)) {
            var maxn = Math.min(n, rem) - 1;
            var maxd = Math.min(32767, i);
            var ml = Math.min(258, rem);
            while (dif <= maxd && --ch_1 && imod != pimod) {
              if (dat[i + l] == dat[i + l - dif]) {
                var nl = 0;
                for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                  ;
                if (nl > l) {
                  l = nl, d = dif;
                  if (nl > maxn)
                    break;
                  var mmd = Math.min(dif, nl - 2);
                  var md = 0;
                  for (var j = 0; j < mmd; ++j) {
                    var ti = i - dif + j & 32767;
                    var pti = prev[ti];
                    var cd = ti - pti & 32767;
                    if (cd > md)
                      md = cd, pimod = ti;
                  }
                }
              }
              imod = pimod, pimod = prev[imod];
              dif += imod - pimod & 32767;
            }
          }
          if (d) {
            syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
            var lin = revfl[l] & 31, din = revfd[d] & 31;
            eb += fleb[lin] + fdeb[din];
            ++lf[257 + lin];
            ++df[din];
            wi = i + l;
            ++lc_1;
          } else {
            syms[li++] = dat[i];
            ++lf[dat[i]];
          }
        }
      }
      for (i = Math.max(i, wi); i < s; ++i) {
        syms[li++] = dat[i];
        ++lf[dat[i]];
      }
      pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
      if (!lst) {
        st.r = pos & 7 | w[pos / 8 | 0] << 3;
        pos -= 7;
        st.h = head, st.p = prev, st.i = i, st.w = wi;
      }
    } else {
      for (var i = st.w || 0; i < s + lst; i += 65535) {
        var e = i + 65535;
        if (e >= s) {
          w[pos / 8 | 0] = lst;
          e = s;
        }
        pos = wfblk(w, pos + 1, dat.subarray(i, e));
      }
      st.i = s;
    }
    return slc(o, 0, pre + shft(pos) + post);
  };
  var crct = /* @__PURE__ */ function() {
    var t = new Int32Array(256);
    for (var i = 0; i < 256; ++i) {
      var c = i, k = 9;
      while (--k)
        c = (c & 1 && -306674912) ^ c >>> 1;
      t[i] = c;
    }
    return t;
  }();
  var crc = function() {
    var c = -1;
    return {
      p: function(d) {
        var cr = c;
        for (var i = 0; i < d.length; ++i)
          cr = crct[cr & 255 ^ d[i]] ^ cr >>> 8;
        c = cr;
      },
      d: function() {
        return ~c;
      }
    };
  };
  var dopt = function(dat, opt, pre, post, st) {
    if (!st) {
      st = { l: 1 };
      if (opt.dictionary) {
        var dict = opt.dictionary.subarray(-32768);
        var newDat = new u8(dict.length + dat.length);
        newDat.set(dict);
        newDat.set(dat, dict.length);
        dat = newDat;
        st.w = dict.length;
      }
    }
    return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20 : 12 + opt.mem, pre, post, st);
  };
  var mrg = function(a, b) {
    var o = {};
    for (var k in a)
      o[k] = a[k];
    for (var k in b)
      o[k] = b[k];
    return o;
  };
  var wbytes = function(d, b, v) {
    for (; v; ++b)
      d[b] = v, v >>>= 8;
  };
  function deflateSync(data, opts) {
    return dopt(data, opts || {}, 0, 0);
  }
  var fltn = function(d, p, t, o) {
    for (var k in d) {
      var val = d[k], n = p + k, op = o;
      if (Array.isArray(val))
        op = mrg(o, val[1]), val = val[0];
      if (ArrayBuffer.isView(val))
        t[n] = [val, op];
      else {
        t[n += "/"] = [new u8(0), op];
        fltn(val, n, t, o);
      }
    }
  };
  var te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
  var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
  var tds = 0;
  try {
    td.decode(et, { stream: true });
    tds = 1;
  } catch (e) {
  }
  function strToU8(str, latin1) {
    var i;
    if (te)
      return te.encode(str);
    var l = str.length;
    var ar = new u8(str.length + (str.length >> 1));
    var ai = 0;
    var w = function(v) {
      ar[ai++] = v;
    };
    for (var i = 0; i < l; ++i) {
      if (ai + 5 > ar.length) {
        var n = new u8(ai + 8 + (l - i << 1));
        n.set(ar);
        ar = n;
      }
      var c = str.charCodeAt(i);
      if (c < 128 || latin1)
        w(c);
      else if (c < 2048)
        w(192 | c >> 6), w(128 | c & 63);
      else if (c > 55295 && c < 57344)
        c = 65536 + (c & 1023 << 10) | str.charCodeAt(++i) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
      else
        w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
    }
    return slc(ar, 0, ai);
  }
  var exfl = function(ex) {
    var le = 0;
    if (ex) {
      for (var k in ex) {
        var l = ex[k].length;
        if (l > 65535)
          err(9);
        le += l + 4;
      }
    }
    return le;
  };
  var wzh = function(d, b, f, fn, u, c, ce, co) {
    var fl2 = fn.length, ex = f.extra, col = co && co.length;
    var exl = exfl(ex);
    wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
    if (ce != null)
      d[b++] = 20, d[b++] = f.os;
    d[b] = 20, b += 2;
    d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
    d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
    var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
    if (y < 0 || y > 119)
      err(10);
    wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >> 1), b += 4;
    if (c != -1) {
      wbytes(d, b, f.crc);
      wbytes(d, b + 4, c < 0 ? -c - 2 : c);
      wbytes(d, b + 8, f.size);
    }
    wbytes(d, b + 12, fl2);
    wbytes(d, b + 14, exl), b += 16;
    if (ce != null) {
      wbytes(d, b, col);
      wbytes(d, b + 6, f.attrs);
      wbytes(d, b + 10, ce), b += 14;
    }
    d.set(fn, b);
    b += fl2;
    if (exl) {
      for (var k in ex) {
        var exf = ex[k], l = exf.length;
        wbytes(d, b, +k);
        wbytes(d, b + 2, l);
        d.set(exf, b + 4), b += 4 + l;
      }
    }
    if (col)
      d.set(co, b), b += col;
    return b;
  };
  var wzf = function(o, b, c, d, e) {
    wbytes(o, b, 101010256);
    wbytes(o, b + 8, c);
    wbytes(o, b + 10, c);
    wbytes(o, b + 12, d);
    wbytes(o, b + 16, e);
  };
  function zipSync(data, opts) {
    if (!opts)
      opts = {};
    var r = {};
    var files = [];
    fltn(data, "", r, opts);
    var o = 0;
    var tot = 0;
    for (var fn in r) {
      var _a2 = r[fn], file = _a2[0], p = _a2[1];
      var compression = p.level == 0 ? 0 : 8;
      var f = strToU8(fn), s = f.length;
      var com = p.comment, m = com && strToU8(com), ms = m && m.length;
      var exl = exfl(p.extra);
      if (s > 65535)
        err(11);
      var d = compression ? deflateSync(file, p) : file, l = d.length;
      var c = crc();
      c.p(file);
      files.push(mrg(p, {
        size: file.length,
        crc: c.d(),
        c: d,
        f,
        m,
        u: s != fn.length || m && com.length != ms,
        o,
        compression
      }));
      o += 30 + s + exl + l;
      tot += 76 + 2 * (s + exl) + (ms || 0) + l;
    }
    var out = new u8(tot + 22), oe = o, cdl = tot - o;
    for (var i = 0; i < files.length; ++i) {
      var f = files[i];
      wzh(out, f.o, f, f.f, f.u, f.c.length);
      var badd = 30 + f.f.length + exfl(f.extra);
      out.set(f.c, f.o + badd);
      wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
    }
    wzf(out, o, files.length, cdl, oe);
    return out;
  }
  function bundleZip(files) {
    const entries = {};
    for (const file of files) {
      entries[file.path] = typeof file.content === "string" ? strToU8(file.content) : file.content;
    }
    return zipSync(entries, { level: 6 });
  }
  function download(bytes, filename) {
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );
    const blob = new Blob([buffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  function describeProgress(p) {
    var _a2;
    switch (p.phase) {
      case "list":
        return `Listing conversations… (${p.total})`;
      case "fetch":
        return `Fetching ${p.completed + 1}/${p.total}: ${((_a2 = p.meta) == null ? void 0 : _a2.title) ?? ""}`;
      case "export":
        return `Exporting ${p.completed}/${p.total}…`;
      case "done":
        return `Done — ${p.completed} conversations.`;
    }
  }
  function resolveAdapter() {
    const adapters = [new KimiAdapter(), new GeminiAdapter()];
    return adapters.find((adapter) => adapter.detect()) ?? null;
  }
  async function runExport(adapter, setStatus, range) {
    const { files, conversations, failed } = await exportConversations({
      adapter,
      exporters: [markdownExporter(), jsonExporter()],
      range,
      throttleMs: 500,
      onProgress: (p) => setStatus(describeProgress(p)),
      onError: (id, error) => console.error("[ai-chat-exporter] failed", id, error)
    });
    if (!conversations.length) {
      setStatus("No conversations exported.");
      return;
    }
    const zip = bundleZip(files);
    download(zip, `${adapter.platform}-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.zip`);
    const suffix = failed.length ? ` (${failed.length} failed)` : "";
    setStatus(`Saved ${conversations.length} conversations${suffix}.`);
  }
  const countCache = /* @__PURE__ */ new Map();
  async function countConversations(adapter, onTick) {
    const cached = countCache.get(adapter.platform);
    if (cached !== void 0) {
      onTick(cached);
      return cached;
    }
    let n = 0;
    for await (const _meta of adapter.listConversations()) {
      n += 1;
      onTick(n);
    }
    countCache.set(adapter.platform, n);
    return n;
  }
  function askRange(adapter) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        zIndex: "100000",
        background: "rgba(0,0,0,.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      });
      const panel = document.createElement("div");
      Object.assign(panel.style, {
        background: "#fff",
        color: "#111",
        // Host pages (e.g. Gemini dark mode) set `color-scheme: dark`, which
        // flips UA defaults for form controls — buttons/inputs without explicit
        // colors would render white-on-white. Pin the dialog to light.
        colorScheme: "light",
        borderRadius: "12px",
        padding: "20px",
        width: "300px",
        fontSize: "13px",
        fontFamily: "system-ui, sans-serif",
        boxShadow: "0 8px 30px rgba(0,0,0,.35)"
      });
      panel.innerHTML = `
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">Export conversations</div>
      <div style="color:#666;margin-bottom:12px">Range is 1-based and inclusive. Leave “to” empty to export to the end.</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
        <input data-role="from" type="number" min="1" step="1" value="1"
               style="width:0;flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;color:#111">
        <span>–</span>
        <input data-role="to" type="number" min="1" step="1" placeholder="end"
               style="width:0;flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;color:#111">
      </div>
      <div data-role="error" style="color:#c00;margin-bottom:8px;display:none"></div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
        <span data-role="total" style="color:#666">Total: unknown</span>
        <button data-role="count" style="padding:3px 10px;border-radius:6px;border:1px solid #ccc;background:#fff;color:#333;cursor:pointer;font-size:12px">Load count</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button data-role="cancel" style="padding:7px 14px;border-radius:8px;border:1px solid #ccc;background:#fff;color:#111;cursor:pointer">Cancel</button>
        <button data-role="ok" style="padding:7px 14px;border-radius:8px;border:none;background:#111;color:#fff;cursor:pointer">Export</button>
      </div>`;
      overlay.appendChild(panel);
      const fromInput = panel.querySelector('[data-role="from"]');
      const toInput = panel.querySelector('[data-role="to"]');
      const errorBox = panel.querySelector('[data-role="error"]');
      const totalLabel = panel.querySelector('[data-role="total"]');
      const countButton = panel.querySelector('[data-role="count"]');
      countButton.addEventListener("click", async () => {
        countButton.disabled = true;
        countButton.textContent = "Counting…";
        try {
          const total = await countConversations(adapter, (n) => {
            totalLabel.textContent = `Total: ${n}…`;
          });
          totalLabel.textContent = `Total: ${total}`;
          toInput.placeholder = String(total);
          countButton.remove();
        } catch (error) {
          console.error("[ai-chat-exporter] count failed", error);
          totalLabel.textContent = "Total: failed — see console";
          countButton.disabled = false;
          countButton.textContent = "Retry";
        }
      });
      const close = (result) => {
        overlay.remove();
        resolve(result);
      };
      const submit = () => {
        const from = Number.parseInt(fromInput.value, 10);
        const to = toInput.value.trim() === "" ? void 0 : Number.parseInt(toInput.value, 10);
        if (!Number.isInteger(from) || from < 1 || to !== void 0 && (!Number.isInteger(to) || to < from)) {
          errorBox.textContent = "Invalid range: “from” must be ≥ 1 and “to” must be ≥ “from”.";
          errorBox.style.display = "block";
          return;
        }
        close({ from, to });
      };
      panel.querySelector('[data-role="ok"]').addEventListener("click", submit);
      panel.querySelector('[data-role="cancel"]').addEventListener("click", () => close(null));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close(null);
      });
      panel.addEventListener("keydown", (event) => {
        if (event.key === "Enter") submit();
        if (event.key === "Escape") close(null);
      });
      document.body.appendChild(overlay);
      fromInput.focus();
    });
  }
  function mountButton() {
    const button = document.createElement("button");
    button.textContent = "Export all chats";
    Object.assign(button.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      zIndex: "99999",
      padding: "10px 16px",
      borderRadius: "10px",
      border: "none",
      background: "#111",
      color: "#fff",
      fontSize: "13px",
      cursor: "pointer",
      boxShadow: "0 2px 10px rgba(0,0,0,.25)"
    });
    const setStatus = (text) => {
      button.textContent = text;
    };
    button.addEventListener("click", async () => {
      const adapter = resolveAdapter();
      if (!adapter) {
        setStatus("Unsupported page.");
        return;
      }
      const range = await askRange(adapter);
      if (!range) return;
      button.disabled = true;
      try {
        await runExport(adapter, setStatus, range);
      } catch (error) {
        console.error("[ai-chat-exporter]", error);
        setStatus("Export failed — see console.");
      } finally {
        setTimeout(() => {
          button.disabled = false;
          button.textContent = "Export all chats";
        }, 4e3);
      }
    });
    document.body.appendChild(button);
  }
  function bootstrap() {
    mountButton();
  }
  bootstrap();

})();
// ==UserScript==
// @name               AI Chat 全部对话导出 / Export All Chats (Kimi, Gemini, Grok, DeepSeek, ChatGPT & Yuanbao)
// @name:zh-CN         AI Chat 全部对话导出（Kimi、Gemini、Grok、DeepSeek、ChatGPT & 腾讯元宝）
// @namespace          https://github.com/wanda1416/ai-chat-exporter
// @version            0.1.2
// @author             wanda1416
// @description        Batch-export your Kimi, Gemini, Grok, DeepSeek, ChatGPT & Yuanbao conversations to Markdown + JSON, zipped. Pick a range, one click — runs entirely in your browser, no data sent anywhere.
// @description:zh-CN  一键批量导出 Kimi / Gemini / Grok / DeepSeek / ChatGPT / 腾讯元宝 全部对话为 Markdown + JSON 并打包 zip。支持导出区间选择，纯本地运行，数据不离开浏览器。
// @license            MIT
// @homepageURL        https://github.com/wanda1416/ai-chat-exporter
// @supportURL         https://github.com/wanda1416/ai-chat-exporter/issues
// @downloadURL        https://raw.githubusercontent.com/wanda1416/ai-chat-exporter/master/apps/userscript/dist/ai-chat-exporter.user.js
// @updateURL          https://raw.githubusercontent.com/wanda1416/ai-chat-exporter/master/apps/userscript/dist/ai-chat-exporter.user.js
// @match              https://www.kimi.com/*
// @match              https://gemini.google.com/*
// @match              https://grok.com/*
// @match              https://chat.deepseek.com/*
// @match              https://chatgpt.com/*
// @match              https://yuanbao.tencent.com/*
// @grant              none
// @run-at             document-idle
// ==/UserScript==

/* eslint-disable */

(function () {
  'use strict';

  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  const BASE_URL$4 = "https://chatgpt.com";
  const DEFAULT_PAGE_SIZE$4 = 28;
  class ChatGPTClient {
    constructor(options = {}) {
      __publicField(this, "fetchImpl");
      __publicField(this, "pageSize");
      __publicField(this, "explicitToken");
      __publicField(this, "cachedToken");
      this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
      this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE$4;
      this.explicitToken = options.token;
    }
    /** Resolves the Bearer token from the override or the session endpoint. */
    async token() {
      if (this.explicitToken) return this.explicitToken;
      if (this.cachedToken) return this.cachedToken;
      try {
        const response = await this.fetchImpl(`${BASE_URL$4}/api/auth/session`, {
          method: "GET",
          credentials: "include",
          headers: { accept: "application/json" }
        });
        if (!response.ok) return void 0;
        const session = await response.json();
        this.cachedToken = session.accessToken || void 0;
        return this.cachedToken;
      } catch {
        return void 0;
      }
    }
    async get(path) {
      const token = await this.token();
      const headers = { accept: "application/json" };
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await this.fetchImpl(`${BASE_URL$4}${path}`, {
        method: "GET",
        credentials: "include",
        headers
      });
      if (!response.ok) {
        throw new Error(`ChatGPT GET ${path} failed: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    }
    /** One page of the sidebar history, starting at `offset`. */
    listPage(offset) {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(this.pageSize),
        order: "updated"
      });
      return this.get(`/backend-api/conversations?${params.toString()}`);
    }
    /** The full mapping tree for a conversation (all branches, one round-trip). */
    conversationDetail(id) {
      return this.get(`/backend-api/conversation/${encodeURIComponent(id)}`);
    }
    /**
     * Downloads one file (user upload `file-…` or generated image, whose
     * `sediment://file_…` pointer is stripped to the bare id) by resolving the
     * signed URL from the files download endpoint, then fetching it. Best
     * effort: returns null on any failure so a dead file never aborts a batch.
     */
    async downloadFile(fileId) {
      const clean = fileId.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
      try {
        const data = await this.get(
          `/backend-api/files/${encodeURIComponent(clean)}/download`
        );
        if (!data.download_url) return null;
        const response = await this.fetchImpl(data.download_url);
        if (!response.ok) return null;
        const file = { bytes: new Uint8Array(await response.arrayBuffer()) };
        const mime = response.headers.get("content-type");
        if (mime) file.mimeType = mime;
        if (data.file_name) file.name = data.file_name;
        return file;
      } catch {
        return null;
      }
    }
  }
  const PLATFORM$5 = "chatgpt";
  const VISIBLE_CONTENT_TYPES = /* @__PURE__ */ new Set(["text", "multimodal_text"]);
  function toRole$4(role) {
    if (role === "assistant" || role === "tool") return "assistant";
    if (role === "system") return "system";
    return "user";
  }
  function toIso$1(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Date(Math.round(value * 1e3)).toISOString();
    }
    if (typeof value === "string" && value) {
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) return new Date(ms).toISOString();
    }
    return void 0;
  }
  function isVisible(raw) {
    var _a2, _b2, _c;
    const role = (_a2 = raw.author) == null ? void 0 : _a2.role;
    if (role !== "user" && role !== "assistant" && role !== "tool") return false;
    if (raw.recipient && raw.recipient !== "all") return false;
    if ((_b2 = raw.metadata) == null ? void 0 : _b2.is_visually_hidden_from_conversation) return false;
    const contentType = (_c = raw.content) == null ? void 0 : _c.content_type;
    return Boolean(contentType && VISIBLE_CONTENT_TYPES.has(contentType));
  }
  function imageAttachment(part) {
    const attachment = { id: part.asset_pointer };
    if (typeof part.size_bytes === "number" && Number.isFinite(part.size_bytes)) {
      attachment.sizeBytes = part.size_bytes;
    }
    return attachment;
  }
  function parseContent(content, attachments, seen) {
    const parts = [];
    for (const part of (content == null ? void 0 : content.parts) ?? []) {
      if (typeof part === "string") {
        if (part.trim()) parts.push({ type: "text", text: part });
        continue;
      }
      if ((part == null ? void 0 : part.content_type) === "image_asset_pointer" && part.asset_pointer) {
        const id = part.asset_pointer;
        if (!seen.has(id)) {
          seen.add(id);
          attachments.push(imageAttachment(part));
        }
        parts.push({ type: "image", attachmentId: id });
      }
    }
    return parts;
  }
  function parseCitations$2(refs) {
    const citations = [];
    const seen = /* @__PURE__ */ new Set();
    for (const ref of refs ?? []) {
      if (ref.type !== "grouped_webpages") continue;
      for (const item of ref.items ?? []) {
        const key = item.url ?? item.title ?? "";
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const citation = {};
        if (item.title) citation.title = item.title;
        if (item.url) citation.url = item.url;
        if (item.snippet) citation.snippet = item.snippet;
        citations.push(citation);
      }
    }
    return citations;
  }
  function parseAttachments$3(raw, attachments, seen) {
    const ids = [];
    for (const [index, file] of (raw ?? []).entries()) {
      const id = file.id || file.name || `attachment-${index}`;
      ids.push(id);
      if (seen.has(id)) continue;
      seen.add(id);
      const attachment = { id };
      if (file.name) attachment.name = file.name;
      if (typeof file.size === "number" && Number.isFinite(file.size)) {
        attachment.sizeBytes = file.size;
      }
      if (file.mime_type) attachment.mimeType = file.mime_type;
      attachments.push(attachment);
    }
    return ids;
  }
  function parseMessage$2(raw, attachments, seen) {
    var _a2;
    const content = parseContent(raw.content, attachments, seen);
    if (!content.length) return null;
    const message = {
      id: String(raw.id ?? ""),
      role: toRole$4((_a2 = raw.author) == null ? void 0 : _a2.role),
      content
    };
    const timestamp = toIso$1(raw.create_time);
    if (timestamp) message.timestamp = timestamp;
    const metadata = raw.metadata ?? {};
    if (metadata.model_slug && message.role === "assistant") {
      message.model = metadata.model_slug;
    }
    const citations = parseCitations$2(metadata.content_references);
    if (citations.length) message.citations = citations;
    const attachmentIds = parseAttachments$3(metadata.attachments, attachments, seen);
    if (attachmentIds.length) message.attachments = attachmentIds;
    return message;
  }
  function activePath$1(mapping, currentNode) {
    if (currentNode && mapping[currentNode]) {
      const chain = [];
      const guard = /* @__PURE__ */ new Set();
      let cursor = currentNode;
      while (typeof cursor === "string" && mapping[cursor] && !guard.has(cursor)) {
        guard.add(cursor);
        const node = mapping[cursor];
        if (node.message) chain.push(node.message);
        cursor = node.parent ?? null;
      }
      return chain.reverse();
    }
    return Object.values(mapping).map((node) => node.message).filter((message) => Boolean(message)).sort((a, b) => (a.create_time ?? 0) - (b.create_time ?? 0));
  }
  function linkChildren$3(messages) {
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
  function parseConversationList$4(page) {
    const metas = [];
    for (const item of page.items ?? []) {
      if (!item.id) continue;
      const meta = {
        id: item.id,
        platform: PLATFORM$5,
        title: item.title ?? ""
      };
      const createdAt = toIso$1(item.create_time);
      const updatedAt = toIso$1(item.update_time);
      if (createdAt) meta.createdAt = createdAt;
      if (updatedAt) meta.updatedAt = updatedAt;
      metas.push(meta);
    }
    return metas;
  }
  function nextOffset(page) {
    const items = page.items ?? [];
    if (!items.length) return void 0;
    const next = (page.offset ?? 0) + items.length;
    const total = page.total ?? 0;
    if (total && next >= total) return void 0;
    return next;
  }
  function toConversation$5(conversationId, detail, meta) {
    var _a2;
    const mapping = detail.mapping ?? {};
    const ordered = activePath$1(mapping, detail.current_node);
    const messages = [];
    const attachments = [];
    const seenAttachment = /* @__PURE__ */ new Set();
    for (const raw of ordered) {
      if (!isVisible(raw)) continue;
      const message = parseMessage$2(raw, attachments, seenAttachment);
      if (message) messages.push(message);
    }
    messages.forEach((message, index) => {
      message.parentId = index === 0 ? null : messages[index - 1].id;
    });
    linkChildren$3(messages);
    const firstUserPart = (_a2 = messages.find((m) => m.role === "user")) == null ? void 0 : _a2.content.find((c) => c.type === "text");
    const fallbackTitle = (firstUserPart == null ? void 0 : firstUserPart.type) === "text" ? firstUserPart.text : "";
    const conversation = {
      schemaVersion: "1",
      id: conversationId,
      platform: PLATFORM$5,
      title: detail.title || (meta == null ? void 0 : meta.title) || fallbackTitle,
      messages
    };
    if (detail.default_model_slug) conversation.model = detail.default_model_slug;
    const createdAt = (meta == null ? void 0 : meta.createdAt) ?? toIso$1(detail.create_time);
    const updatedAt = (meta == null ? void 0 : meta.updatedAt) ?? toIso$1(detail.update_time);
    if (createdAt) conversation.createdAt = createdAt;
    if (updatedAt) conversation.updatedAt = updatedAt;
    if (attachments.length) conversation.attachments = attachments;
    conversation.sourceUrl = `https://chatgpt.com/c/${conversationId}`;
    return conversation;
  }
  const MAX_PAGES$5 = 1e3;
  class ChatGPTAdapter {
    constructor(options = {}) {
      __publicField(this, "platform", PLATFORM$5);
      __publicField(this, "client");
      __publicField(this, "metaCache", /* @__PURE__ */ new Map());
      this.client = new ChatGPTClient(options);
    }
    detect() {
      if (typeof location === "undefined") return false;
      return /(^|\.)chatgpt\.com$/.test(location.hostname);
    }
    async *listConversations() {
      let offset = 0;
      for (let page = 0; page < MAX_PAGES$5; page++) {
        const data = await this.client.listPage(offset);
        const metas = parseConversationList$4(data);
        for (const meta of metas) {
          this.metaCache.set(meta.id, meta);
          yield meta;
        }
        const next = nextOffset(data);
        if (next === void 0) break;
        offset = next;
      }
    }
    async fetchConversation(id) {
      const data = await this.client.conversationDetail(id);
      const meta = this.metaCache.get(id);
      return toConversation$5(id, data, {
        title: meta == null ? void 0 : meta.title,
        createdAt: meta == null ? void 0 : meta.createdAt,
        updatedAt: meta == null ? void 0 : meta.updatedAt
      });
    }
    /**
     * Resolves attachment bytes via the files download endpoint — covers user
     * uploads (`file-…`) and generated images (`sediment://file_…` pointers),
     * neither of which carries a direct URL in the conversation payload.
     */
    async fetchAttachment(attachment) {
      return this.client.downloadFile(attachment.id);
    }
  }
  const BASE_URL$3 = "https://chat.deepseek.com/api/v0/";
  const DEFAULT_PAGE_SIZE$3 = 100;
  class DeepSeekClient {
    constructor(options = {}) {
      __publicField(this, "fetchImpl");
      __publicField(this, "pageSize");
      __publicField(this, "explicitToken");
      this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
      this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE$3;
      this.explicitToken = options.token;
    }
    /** Resolves the Bearer token from the override or localStorage. */
    token() {
      var _a2;
      if (this.explicitToken) return this.explicitToken;
      try {
        const raw = (_a2 = globalThis.localStorage) == null ? void 0 : _a2.getItem("userToken");
        if (!raw) return void 0;
        const parsed = JSON.parse(raw);
        return (parsed == null ? void 0 : parsed.value) || void 0;
      } catch {
        return void 0;
      }
    }
    async get(path) {
      var _a2, _b2, _c;
      const token = this.token();
      const headers = { accept: "application/json" };
      if (token) headers.authorization = `Bearer ${token}`;
      const response = await this.fetchImpl(`${BASE_URL$3}${path}`, {
        method: "GET",
        credentials: "include",
        headers
      });
      if (!response.ok) {
        throw new Error(`DeepSeek GET ${path} failed: ${response.status} ${response.statusText}`);
      }
      const envelope = await response.json();
      if (envelope.code !== 0 || ((_a2 = envelope.data) == null ? void 0 : _a2.biz_code) !== 0) {
        throw new Error(`DeepSeek GET ${path} error: ${envelope.msg || ((_b2 = envelope.data) == null ? void 0 : _b2.biz_msg) || "unknown"}`);
      }
      return ((_c = envelope.data) == null ? void 0 : _c.biz_data) ?? {};
    }
    /** One page of the sidebar history. `beforeSeqId` continues a previous page. */
    fetchPage(beforeSeqId) {
      const params = new URLSearchParams({ count: String(this.pageSize) });
      if (beforeSeqId !== void 0) params.set("before_seq_id", String(beforeSeqId));
      return this.get(`chat_session/fetch_page?${params.toString()}`);
    }
    /** The full message set for a conversation (all branches, one round-trip). */
    historyMessages(chatSessionId) {
      const params = new URLSearchParams({ chat_session_id: chatSessionId });
      return this.get(`chat/history_messages?${params.toString()}`);
    }
  }
  const PLATFORM$4 = "deepseek";
  function toRole$3(role) {
    const r = (role ?? "").toLowerCase();
    if (r === "assistant") return "assistant";
    if (r === "system") return "system";
    return "user";
  }
  function toIso(seconds) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) return void 0;
    return new Date(Math.round(seconds * 1e3)).toISOString();
  }
  function parseCitations$1(results) {
    const citations = [];
    const seen = /* @__PURE__ */ new Set();
    for (const result of results ?? []) {
      const key = result.url ?? result.title ?? "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const citation = {};
      if (result.title) citation.title = result.title;
      if (result.url) citation.url = result.url;
      if (result.snippet) citation.snippet = result.snippet;
      citations.push(citation);
    }
    return citations;
  }
  function parseAttachments$2(files) {
    const attachments = [];
    for (const [index, file] of (files ?? []).entries()) {
      const attachment = { id: file.id || file.file_name || `file-${index}` };
      if (file.file_name) attachment.name = file.file_name;
      if (typeof file.file_size === "number" && Number.isFinite(file.file_size)) {
        attachment.sizeBytes = file.file_size;
      }
      attachments.push(attachment);
    }
    return attachments;
  }
  function parseMessage$1(raw) {
    const id = String(raw.message_id ?? "");
    const message = {
      id,
      role: toRole$3(raw.role),
      content: raw.content ? [{ type: "text", text: raw.content }] : []
    };
    const timestamp = toIso(raw.inserted_at);
    if (timestamp) message.timestamp = timestamp;
    if (raw.model && message.role === "assistant") message.model = raw.model;
    if (raw.thinking_content) {
      const reasoning = { content: raw.thinking_content };
      if (typeof raw.thinking_elapsed_secs === "number" && raw.thinking_elapsed_secs > 0) {
        reasoning.summary = `Thought for ${Math.round(raw.thinking_elapsed_secs)}s`;
      }
      message.reasoning = reasoning;
    }
    const citations = parseCitations$1(raw.search_results);
    if (citations.length) message.citations = citations;
    const attachments = parseAttachments$2(raw.files);
    if (attachments.length) message.attachments = attachments.map((a) => a.id);
    if (raw.parent_id !== void 0) {
      message.parentId = raw.parent_id === null ? null : String(raw.parent_id);
    }
    return { message, attachments };
  }
  function activePath(messages, currentId) {
    const byId = /* @__PURE__ */ new Map();
    for (const m of messages) {
      if (typeof m.message_id === "number") byId.set(m.message_id, m);
    }
    if (currentId !== void 0 && byId.has(currentId)) {
      const chain = [];
      const guard = /* @__PURE__ */ new Set();
      let cursor = currentId;
      while (typeof cursor === "number" && byId.has(cursor) && !guard.has(cursor)) {
        guard.add(cursor);
        const node = byId.get(cursor);
        chain.push(node);
        cursor = node.parent_id ?? null;
      }
      return chain.reverse();
    }
    return [...messages].sort((a, b) => (a.message_id ?? 0) - (b.message_id ?? 0));
  }
  function linkChildren$2(messages) {
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
  function parseConversationList$3(data) {
    const metas = [];
    for (const session of data.chat_sessions ?? []) {
      if (!session.id) continue;
      const meta = {
        id: session.id,
        platform: PLATFORM$4,
        title: session.title ?? ""
      };
      const createdAt = toIso(session.inserted_at);
      const updatedAt = toIso(session.updated_at);
      if (createdAt) meta.createdAt = createdAt;
      if (updatedAt) meta.updatedAt = updatedAt;
      metas.push(meta);
    }
    return metas;
  }
  function hasMore(data) {
    return Boolean(data.has_more);
  }
  function lastSeqId(data) {
    var _a2;
    const sessions = data.chat_sessions;
    if (!(sessions == null ? void 0 : sessions.length)) return void 0;
    return (_a2 = sessions[sessions.length - 1]) == null ? void 0 : _a2.seq_id;
  }
  function toConversation$4(conversationId, data, meta) {
    var _a2;
    const session = data.chat_session ?? {};
    const ordered = activePath(data.chat_messages ?? [], session.current_message_id);
    const messages = [];
    const attachments = [];
    const seenAttachment = /* @__PURE__ */ new Set();
    for (const raw of ordered) {
      const parsed = parseMessage$1(raw);
      messages.push(parsed.message);
      for (const att of parsed.attachments) {
        if (seenAttachment.has(att.id)) continue;
        seenAttachment.add(att.id);
        attachments.push(att);
      }
    }
    linkChildren$2(messages);
    const firstUserPart = (_a2 = messages.find((m) => m.role === "user")) == null ? void 0 : _a2.content.find((c) => c.type === "text");
    const fallbackTitle = (firstUserPart == null ? void 0 : firstUserPart.type) === "text" ? firstUserPart.text : "";
    const conversation = {
      schemaVersion: "1",
      id: conversationId,
      platform: PLATFORM$4,
      title: session.title || (meta == null ? void 0 : meta.title) || fallbackTitle,
      messages
    };
    const createdAt = (meta == null ? void 0 : meta.createdAt) ?? toIso(session.inserted_at);
    const updatedAt = (meta == null ? void 0 : meta.updatedAt) ?? toIso(session.updated_at);
    if (createdAt) conversation.createdAt = createdAt;
    if (updatedAt) conversation.updatedAt = updatedAt;
    if (attachments.length) conversation.attachments = attachments;
    conversation.sourceUrl = `https://chat.deepseek.com/a/chat/s/${conversationId}`;
    return conversation;
  }
  const MAX_PAGES$4 = 1e3;
  class DeepSeekAdapter {
    constructor(options = {}) {
      __publicField(this, "platform", PLATFORM$4);
      __publicField(this, "client");
      __publicField(this, "metaCache", /* @__PURE__ */ new Map());
      this.client = new DeepSeekClient(options);
    }
    detect() {
      if (typeof location === "undefined") return false;
      return /(^|\.)chat\.deepseek\.com$/.test(location.hostname);
    }
    async *listConversations() {
      let beforeSeqId;
      for (let page = 0; page < MAX_PAGES$4; page++) {
        const data = await this.client.fetchPage(beforeSeqId);
        const metas = parseConversationList$3(data);
        for (const meta of metas) {
          this.metaCache.set(meta.id, meta);
          yield meta;
        }
        if (!hasMore(data) || metas.length === 0) break;
        const next = lastSeqId(data);
        if (next === void 0) break;
        beforeSeqId = next;
      }
    }
    async fetchConversation(id) {
      const data = await this.client.historyMessages(id);
      const meta = this.metaCache.get(id);
      return toConversation$4(id, data, {
        title: meta == null ? void 0 : meta.title,
        createdAt: meta == null ? void 0 : meta.createdAt,
        updatedAt: meta == null ? void 0 : meta.updatedAt
      });
    }
  }
  const PLATFORM$3 = "gemini";
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
  function parseConversationList$2(payload) {
    const items = asArray(at(payload, 2));
    const metas = [];
    for (const item of items) {
      const id = asString(at(item, 0));
      if (!id) continue;
      const meta = {
        id,
        platform: PLATFORM$3,
        title: asString(at(item, 1)) ?? ""
      };
      const createdAt = isoFromTuple(at(item, 5));
      if (createdAt) meta.createdAt = createdAt;
      metas.push(meta);
    }
    return metas;
  }
  function nextPageToken$1(payload) {
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
  function toConversation$3(conversationId, payload, title) {
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
      platform: PLATFORM$3,
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
  const MAX_PAGES$3 = 1e3;
  class GeminiAdapter {
    constructor(options = {}) {
      __publicField(this, "platform", PLATFORM$3);
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
      for (let page = 0; page < MAX_PAGES$3; page++) {
        const payload = await this.client.listConversations(pageToken);
        const metas = parseConversationList$2(payload);
        for (const meta of metas) {
          this.titles.set(meta.id, meta.title);
          yield meta;
        }
        pageToken = nextPageToken$1(payload);
        if (!pageToken || metas.length === 0) break;
      }
    }
    async fetchConversation(id) {
      const allTurns = [];
      const seen = /* @__PURE__ */ new Set();
      let pageToken;
      for (let page = 0; page < MAX_PAGES$3; page++) {
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
      return toConversation$3(id, combined, this.titles.get(id));
    }
  }
  const BASE_URL$2 = "https://grok.com/rest/";
  const DEFAULT_PAGE_SIZE$2 = 30;
  class GrokClient {
    constructor(options = {}) {
      __publicField(this, "fetchImpl");
      __publicField(this, "pageSize");
      this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
      this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE$2;
    }
    async get(path) {
      const response = await this.fetchImpl(`${BASE_URL$2}${path}`, {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json" }
      });
      if (!response.ok) {
        throw new Error(`Grok GET ${path} failed: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    }
    async post(path, body) {
      const response = await this.fetchImpl(`${BASE_URL$2}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body ?? {})
      });
      if (!response.ok) {
        throw new Error(`Grok POST ${path} failed: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    }
    /** One page of the sidebar history. `pageToken` continues a previous page. */
    listConversations(pageToken) {
      const params = new URLSearchParams({ pageSize: String(this.pageSize) });
      if (pageToken) params.set("pageToken", pageToken);
      return this.get(`app-chat/conversations?${params.toString()}`);
    }
    /** The ordered message-tree skeleton (ids + sender + parent, no content). */
    responseNodes(conversationId) {
      return this.get(
        `app-chat/conversations/${conversationId}/response-node`
      );
    }
    /** The full content for the given response ids (order is NOT preserved). */
    loadResponses(conversationId, responseIds) {
      return this.post(
        `app-chat/conversations/${conversationId}/load-responses`,
        { responseIds }
      );
    }
  }
  const PLATFORM$2 = "grok";
  function toRole$2(sender) {
    return (sender ?? "").toLowerCase() === "assistant" ? "assistant" : "user";
  }
  function parseCitations(results) {
    const citations = [];
    const seen = /* @__PURE__ */ new Set();
    for (const result of results ?? []) {
      const key = result.url ?? result.title ?? "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const citation = {};
      if (result.title) citation.title = result.title;
      if (result.url) citation.url = result.url;
      if (result.preview) citation.snippet = result.preview;
      citations.push(citation);
    }
    return citations;
  }
  function parseAttachments$1(assets) {
    const attachments = [];
    for (const [index, asset] of (assets ?? []).entries()) {
      const size = typeof asset.sizeBytes === "string" ? Number(asset.sizeBytes) : asset.sizeBytes;
      const attachment = { id: asset.assetId || asset.name || `file-${index}` };
      if (asset.name) attachment.name = asset.name;
      if (asset.mimeType) attachment.mimeType = asset.mimeType;
      if (typeof size === "number" && Number.isFinite(size)) attachment.sizeBytes = size;
      attachments.push(attachment);
    }
    return attachments;
  }
  function parseResponse(raw) {
    var _a2;
    const id = raw.responseId ?? "";
    const message = {
      id,
      role: toRole$2(raw.sender),
      content: raw.message ? [{ type: "text", text: raw.message }] : []
    };
    if (raw.createTime) message.timestamp = raw.createTime;
    if (raw.model && message.role === "assistant") message.model = raw.model;
    const citations = parseCitations(((_a2 = raw.citedWebSearchResults) == null ? void 0 : _a2.length) ? raw.citedWebSearchResults : raw.webSearchResults);
    if (citations.length) message.citations = citations;
    const attachments = parseAttachments$1(raw.fileAttachmentAssetMetadata);
    if (attachments.length) message.attachments = attachments.map((a) => a.id);
    if (raw.parentResponseId !== void 0) message.parentId = raw.parentResponseId || null;
    return { message, attachments };
  }
  function sortChronologically$1(messages) {
    const originalIndex = /* @__PURE__ */ new Map();
    messages.forEach((m, i) => originalIndex.set(m, i));
    messages.sort((a, b) => {
      const ta = a.timestamp ?? "";
      const tb = b.timestamp ?? "";
      if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
      return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
    });
  }
  function linkChildren$1(messages) {
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
  function parseConversationList$1(response) {
    const metas = [];
    for (const conv of response.conversations ?? []) {
      if (!conv.conversationId) continue;
      const meta = {
        id: conv.conversationId,
        platform: PLATFORM$2,
        title: conv.title ?? ""
      };
      if (conv.createTime) meta.createdAt = conv.createTime;
      if (conv.modifyTime) meta.updatedAt = conv.modifyTime;
      metas.push(meta);
    }
    return metas;
  }
  function nextPageToken(response) {
    return response.nextPageToken || void 0;
  }
  function toConversation$2(conversationId, nodes, loaded, meta) {
    var _a2, _b2;
    const byId = /* @__PURE__ */ new Map();
    for (const r of loaded.responses ?? []) {
      if (r.responseId) byId.set(r.responseId, r);
    }
    const ordered = [];
    const seen = /* @__PURE__ */ new Set();
    for (const node of nodes.responseNodes ?? []) {
      const id = node.responseId;
      if (!id || seen.has(id)) continue;
      const raw = byId.get(id) ?? { responseId: id, sender: node.sender, parentResponseId: node.parentResponseId };
      seen.add(id);
      ordered.push(raw);
    }
    for (const r of loaded.responses ?? []) {
      if (r.responseId && !seen.has(r.responseId)) {
        seen.add(r.responseId);
        ordered.push(r);
      }
    }
    const messages = [];
    const attachments = [];
    const seenAttachment = /* @__PURE__ */ new Set();
    for (const raw of ordered) {
      const parsed = parseResponse(raw);
      messages.push(parsed.message);
      for (const att of parsed.attachments) {
        if (seenAttachment.has(att.id)) continue;
        seenAttachment.add(att.id);
        attachments.push(att);
      }
    }
    sortChronologically$1(messages);
    linkChildren$1(messages);
    const model = (_a2 = [...messages].reverse().find((m) => m.model)) == null ? void 0 : _a2.model;
    const firstUserPart = (_b2 = messages.find((m) => m.role === "user")) == null ? void 0 : _b2.content.find((c) => c.type === "text");
    const fallbackTitle = (firstUserPart == null ? void 0 : firstUserPart.type) === "text" ? firstUserPart.text : "";
    const conversation = {
      schemaVersion: "1",
      id: conversationId,
      platform: PLATFORM$2,
      title: (meta == null ? void 0 : meta.title) || fallbackTitle,
      messages
    };
    if (meta == null ? void 0 : meta.createdAt) conversation.createdAt = meta.createdAt;
    if (meta == null ? void 0 : meta.updatedAt) conversation.updatedAt = meta.updatedAt;
    if (model) conversation.model = model;
    if (attachments.length) conversation.attachments = attachments;
    conversation.sourceUrl = `https://grok.com/c/${conversationId}`;
    return conversation;
  }
  const MAX_PAGES$2 = 1e3;
  class GrokAdapter {
    constructor(options = {}) {
      __publicField(this, "platform", PLATFORM$2);
      __publicField(this, "client");
      __publicField(this, "metaCache", /* @__PURE__ */ new Map());
      this.client = new GrokClient(options);
    }
    detect() {
      if (typeof location === "undefined") return false;
      return /(^|\.)grok\.com$/.test(location.hostname);
    }
    async *listConversations() {
      let pageToken;
      for (let page = 0; page < MAX_PAGES$2; page++) {
        const response = await this.client.listConversations(pageToken);
        const metas = parseConversationList$1(response);
        for (const meta of metas) {
          this.metaCache.set(meta.id, meta);
          yield meta;
        }
        pageToken = nextPageToken(response);
        if (!pageToken || metas.length === 0) break;
      }
    }
    async fetchConversation(id) {
      const nodes = await this.client.responseNodes(id);
      const responseIds = (nodes.responseNodes ?? []).map((n) => n.responseId).filter((rid) => Boolean(rid));
      const loaded = responseIds.length ? await this.client.loadResponses(id, responseIds) : { responses: [] };
      const meta = this.metaCache.get(id);
      return toConversation$2(id, nodes, loaded, {
        title: meta == null ? void 0 : meta.title,
        createdAt: meta == null ? void 0 : meta.createdAt,
        updatedAt: meta == null ? void 0 : meta.updatedAt
      });
    }
  }
  const BASE_URL$1 = "https://www.kimi.com/apiv2/";
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
      const response = await this.fetchImpl(`${BASE_URL$1}${service}/${method}`, {
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
  const PLATFORM$1 = "kimi";
  function toRole$1(raw) {
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
      role: toRole$1(raw.role),
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
      const meta = { id: chat.id, platform: PLATFORM$1, title: chat.name ?? "" };
      if (chat.createTime) meta.createdAt = chat.createTime;
      if (chat.updateTime) meta.updatedAt = chat.updateTime;
      metas.push(meta);
    }
    return metas;
  }
  function toConversation$1(chatId, chat, messages) {
    const summary = chat.chat ?? {};
    const attachments = parseAttachments(chat);
    const parsedMessages = (messages.messages ?? []).map(parseMessage);
    sortChronologically(parsedMessages);
    linkChildren(parsedMessages);
    const conversation = {
      schemaVersion: "1",
      id: summary.id ?? chatId,
      platform: PLATFORM$1,
      title: summary.name ?? "",
      messages: parsedMessages
    };
    if (summary.createTime) conversation.createdAt = summary.createTime;
    if (summary.updateTime) conversation.updatedAt = summary.updateTime;
    if (attachments.length) conversation.attachments = attachments;
    conversation.sourceUrl = `https://www.kimi.com/chat/${conversation.id}`;
    return conversation;
  }
  const DEFAULT_PAGE_SIZE$1 = 30;
  const MAX_PAGES$1 = 1e3;
  class KimiAdapter {
    constructor(options = {}) {
      __publicField(this, "platform", PLATFORM$1);
      __publicField(this, "client");
      this.client = new KimiClient(options);
    }
    detect() {
      if (typeof location === "undefined") return false;
      return /(^|\.)kimi\.com$/.test(location.hostname);
    }
    async *listConversations() {
      let pageToken;
      for (let page = 0; page < MAX_PAGES$1; page++) {
        const response = await this.client.listFeeds({
          page_size: DEFAULT_PAGE_SIZE$1,
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
      return toConversation$1(id, chat, messages);
    }
  }
  const BASE_URL = "https://yuanbao.tencent.com";
  const DEFAULT_PAGE_SIZE = 20;
  const DEFAULT_DETAIL_LIMIT = 50;
  class YuanbaoClient {
    constructor(options = {}) {
      __publicField(this, "fetchImpl");
      __publicField(this, "pageSize");
      __publicField(this, "detailLimit");
      this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
      this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
      this.detailLimit = options.detailLimit ?? DEFAULT_DETAIL_LIMIT;
    }
    async post(path, body) {
      const response = await this.fetchImpl(`${BASE_URL}${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body ?? {})
      });
      if (!response.ok) {
        throw new Error(`Yuanbao POST ${path} failed: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    }
    /**
     * One page of the sidebar history, newest first. `lastRepliedAt` is the
     * cursor: 0 starts from the newest conversation, otherwise pass the smallest
     * `lastRepliedAt` of the previous page.
     */
    listConversations(agentId, lastRepliedAt = 0) {
      return this.post("/api/user/agent/conversation/v3/list", {
        agent_id: agentId,
        page_size: this.pageSize,
        action: 1,
        last_replied_at: lastRepliedAt,
        top_time: 0
      });
    }
    /**
     * One window of turns. `offset: 0` returns the newest `limit` turns; any
     * other `offset` returns the turns older than that index (verified semantics:
     * offset=4 → turns with index < 4), which is how long threads are walked.
     */
    conversationDetail(conversationId, agentId, offset = 0) {
      return this.post("/api/user/agent/conversation/v1/detail", {
        conversationId,
        offset,
        limit: this.detailLimit,
        agentId
      });
    }
  }
  const PLATFORM = "yuanbao";
  const DEFAULT_AGENT_ID = "naQivTmsDa";
  function agentIdFromPath(pathname) {
    const segments = pathname.split("/").filter(Boolean);
    if (segments[0] !== "chat") return void 0;
    return segments.length > 1 ? segments[1] : void 0;
  }
  function toIsoTime(value) {
    if (value === void 0 || value === null) return void 0;
    const numeric = typeof value === "string" ? Number(value) : value;
    if (!Number.isFinite(numeric) || numeric <= 0) return void 0;
    const ms = numeric < 1e12 ? numeric * 1e3 : numeric;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? void 0 : date.toISOString();
  }
  function toRole(speaker) {
    switch ((speaker ?? "").toLowerCase()) {
      case "ai":
      case "assistant":
      case "bot":
        return "assistant";
      case "system":
        return "system";
      default:
        return "user";
    }
  }
  function guessMimeType(tag, fileName) {
    const t = (tag ?? "").toLowerCase();
    if (t === "txt" || t === "text") return "text/plain";
    if (t === "pdf") return "application/pdf";
    if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName ?? "")) return "image/*";
    return void 0;
  }
  function isFileBlock(type) {
    return type === "txt" || type === "pdf" || type === "file" || type === "doc" || type === "excel" || type === "ppt";
  }
  function mediaToAttachment(media, fallbackId) {
    const id = media.mediaId || media.fileName || fallbackId;
    const attachment = { id };
    if (media.fileName) attachment.name = media.fileName;
    const mimeType = guessMimeType(media.type, media.fileName);
    if (mimeType) attachment.mimeType = mimeType;
    if (typeof media.size === "number" && Number.isFinite(media.size)) {
      attachment.sizeBytes = media.size;
    }
    if (media.url) attachment.url = media.url;
    return attachment;
  }
  function mapBlock(block, messageId, index) {
    const contribution = { parts: [], citations: [], attachments: [] };
    const type = (block.type ?? "").toLowerCase();
    if (type === "think") {
      const content = block.content ?? "";
      if (content) {
        contribution.reasoning = { content };
        if (block.title) contribution.reasoning.summary = block.title;
      }
      return contribution;
    }
    if (type === "searchguid") {
      for (const doc of block.docs ?? []) {
        const citation = {};
        if (doc.title) citation.title = doc.title;
        if (doc.url) citation.url = doc.url;
        if (doc.quote) citation.snippet = doc.quote;
        if (citation.title || citation.url) contribution.citations.push(citation);
      }
      return contribution;
    }
    if (type === "image") {
      const attachment = mediaToAttachment(
        { type: "image", url: block.url, fileName: block.fileName, mediaId: block.mediaId },
        `${messageId}-image-${index}`
      );
      contribution.attachments.push(attachment);
      contribution.parts.push({
        type: "image",
        attachmentId: attachment.id,
        ...block.url ? { url: block.url } : {},
        ...block.fileName ? { alt: block.fileName } : {}
      });
      return contribution;
    }
    if (isFileBlock(type)) {
      const attachment = mediaToAttachment(block, `${messageId}-file-${index}`);
      contribution.attachments.push(attachment);
      const part = { type: "file", attachmentId: attachment.id };
      if (attachment.name) part.name = attachment.name;
      contribution.parts.push(part);
      return contribution;
    }
    const text = block.msg ?? block.content ?? "";
    if (text) contribution.parts.push({ type: "text", text });
    return contribution;
  }
  function mergeReasoning(target, incoming) {
    if (!target) return incoming;
    return {
      content: `${target.content}

${incoming.content}`,
      ...target.summary ?? incoming.summary ? { summary: target.summary ?? incoming.summary } : {}
    };
  }
  function toMessage(turn, conversationId) {
    const messageId = turn.id ?? `${conversationId}_${turn.index ?? 0}`;
    const content = [];
    const citations = [];
    const attachments = [];
    let reasoning;
    let model;
    const speeches = turn.speechesV2 ?? [];
    for (const speech of speeches) {
      if (speech.chatModelId) model = speech.chatModelId;
      const blocks = speech.content ?? [];
      for (const [index, block] of blocks.entries()) {
        const contribution = mapBlock(block, messageId, index);
        content.push(...contribution.parts);
        citations.push(...contribution.citations);
        attachments.push(...contribution.attachments);
        if (contribution.reasoning) reasoning = mergeReasoning(reasoning, contribution.reasoning);
      }
    }
    for (const media of turn.multiMediaInfo ?? []) {
      const attachment = mediaToAttachment(media, `${messageId}-media-${attachments.length}`);
      attachments.push(attachment);
      const part = { type: "file", attachmentId: attachment.id };
      if (attachment.name) part.name = attachment.name;
      content.push(part);
    }
    const message = { id: messageId, role: toRole(turn.speaker), content };
    const timestamp = toIsoTime(turn.createTime);
    if (timestamp) message.timestamp = timestamp;
    if (model && message.role === "assistant") message.model = model;
    if (reasoning) message.reasoning = reasoning;
    if (citations.length) message.citations = citations;
    if (attachments.length) message.attachments = attachments.map((a) => a.id);
    return { message, attachments };
  }
  function orderedTurns(turns) {
    const byKey = /* @__PURE__ */ new Map();
    for (const [position, turn] of turns.entries()) {
      const key = turn.id ?? `#${turn.index ?? position}`;
      if (!byKey.has(key)) byKey.set(key, turn);
    }
    return [...byKey.values()].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }
  function nextListCursor(response) {
    var _a2;
    const items = ((_a2 = response.data) == null ? void 0 : _a2.list) ?? [];
    if (!items.length) return void 0;
    const times = items.map((item) => item.lastRepliedAt).filter((value) => typeof value === "number" && value > 0);
    return times.length ? Math.min(...times) : void 0;
  }
  function parseConversationList(response) {
    var _a2;
    const metas = [];
    for (const item of ((_a2 = response.data) == null ? void 0 : _a2.list) ?? []) {
      if (!item.id) continue;
      const meta = { id: item.id, platform: PLATFORM, title: item.title ?? "" };
      const createdAt = toIsoTime(item.firstRepliedAt);
      const updatedAt = toIsoTime(item.lastRepliedAt);
      if (createdAt) meta.createdAt = createdAt;
      if (updatedAt) meta.updatedAt = updatedAt;
      metas.push(meta);
    }
    return metas;
  }
  function toConversation(pages, meta) {
    var _a2, _b2, _c, _d;
    const first = pages[0] ?? {};
    const conversationId = (meta == null ? void 0 : meta.id) ?? first.id ?? "";
    const agentId = (meta == null ? void 0 : meta.agentId) ?? first.agentId ?? DEFAULT_AGENT_ID;
    const turns = orderedTurns(pages.flatMap((page) => page.convs ?? []));
    const messages = [];
    const attachments = [];
    const seenAttachment = /* @__PURE__ */ new Set();
    for (const turn of turns) {
      const parsed = toMessage(turn, conversationId);
      messages.push(parsed.message);
      for (const attachment of parsed.attachments) {
        if (seenAttachment.has(attachment.id)) continue;
        seenAttachment.add(attachment.id);
        attachments.push(attachment);
      }
    }
    for (const page of pages) {
      for (const media of page.multiMediaInfo ?? []) {
        const attachment = mediaToAttachment(media, `media-${attachments.length}`);
        if (seenAttachment.has(attachment.id)) continue;
        seenAttachment.add(attachment.id);
        attachments.push(attachment);
      }
    }
    const firstUserText = (_a2 = messages.find((message) => message.role === "user")) == null ? void 0 : _a2.content.find((part) => part.type === "text");
    const fallbackTitle = (firstUserText == null ? void 0 : firstUserText.type) === "text" ? firstUserText.text.replace(/\s+/g, " ").slice(0, 80) : "";
    const model = ((_b2 = [...messages].reverse().find((message) => message.model)) == null ? void 0 : _b2.model) ?? first.modelId;
    const conversation = {
      schemaVersion: "1",
      id: conversationId,
      platform: PLATFORM,
      title: (meta == null ? void 0 : meta.title) || first.title || fallbackTitle,
      messages
    };
    const createdAt = earliestTime(meta == null ? void 0 : meta.createdAt, pages) ?? toIsoTime(first.firstRepliedAt) ?? ((_c = messages.find((m) => m.timestamp)) == null ? void 0 : _c.timestamp);
    const updatedAt = (meta == null ? void 0 : meta.updatedAt) ?? toIsoTime(first.lastRepliedAt) ?? ((_d = [...messages].reverse().find((m) => m.timestamp)) == null ? void 0 : _d.timestamp);
    if (createdAt) conversation.createdAt = createdAt;
    if (updatedAt) conversation.updatedAt = updatedAt;
    if (model) conversation.model = model;
    if (attachments.length) conversation.attachments = attachments;
    conversation.sourceUrl = `https://yuanbao.tencent.com/chat/${agentId}/${conversationId}`;
    return conversation;
  }
  function earliestTime(fromMeta, pages) {
    if (fromMeta) return fromMeta;
    const times = pages.map((page) => toIsoTime(page.firstRepliedAt)).filter((value) => Boolean(value)).sort();
    return times[0];
  }
  const MAX_PAGES = 500;
  const MAX_DETAIL_PAGES = 50;
  class YuanbaoAdapter {
    constructor(options = {}) {
      __publicField(this, "platform", PLATFORM);
      __publicField(this, "client");
      __publicField(this, "explicitAgentId");
      __publicField(this, "metaCache", /* @__PURE__ */ new Map());
      this.client = new YuanbaoClient(options);
      this.explicitAgentId = options.agentId;
    }
    detect() {
      if (typeof location === "undefined") return false;
      return /(^|\.)yuanbao\.tencent\.com$/.test(location.hostname);
    }
    /** The agent whose history is exported: explicit → URL → the default agent. */
    agentId() {
      if (this.explicitAgentId) return this.explicitAgentId;
      if (typeof location !== "undefined") {
        const fromUrl = agentIdFromPath(location.pathname);
        if (fromUrl) return fromUrl;
      }
      return DEFAULT_AGENT_ID;
    }
    async *listConversations() {
      const agentId = this.agentId();
      const seen = /* @__PURE__ */ new Set();
      let cursor = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await this.client.listConversations(agentId, cursor);
        const metas = parseConversationList(response);
        if (!metas.length) break;
        for (const meta of metas) {
          if (seen.has(meta.id)) continue;
          seen.add(meta.id);
          this.metaCache.set(meta.id, meta);
          yield meta;
        }
        const next = nextListCursor(response);
        if (next === void 0 || next <= 0) break;
        if (cursor !== 0 && next >= cursor) break;
        cursor = next;
      }
    }
    async fetchConversation(id) {
      const agentId = this.agentId();
      const pages = [];
      let offset = 0;
      for (let page = 0; page < MAX_DETAIL_PAGES; page++) {
        const detail = await this.client.conversationDetail(id, agentId, offset);
        pages.push(detail);
        const turns = detail.convs ?? [];
        if (!detail.hasMore || !turns.length) break;
        const oldestIndex = Math.min(
          ...turns.map((turn) => turn.index ?? Number.POSITIVE_INFINITY)
        );
        if (!Number.isFinite(oldestIndex) || oldestIndex <= 0 || oldestIndex <= offset) break;
        offset = oldestIndex;
      }
      const meta = this.metaCache.get(id);
      return toConversation(pages, {
        id,
        agentId,
        ...(meta == null ? void 0 : meta.title) !== void 0 ? { title: meta.title } : {},
        ...(meta == null ? void 0 : meta.createdAt) !== void 0 ? { createdAt: meta.createdAt } : {},
        ...(meta == null ? void 0 : meta.updatedAt) !== void 0 ? { updatedAt: meta.updatedAt } : {}
      });
    }
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
  const DEFAULT_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
  const EXTENSION_BY_MIME = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "application/zip": "zip",
    "text/plain": "txt",
    "text/markdown": "md",
    "text/csv": "csv"
  };
  async function readCapped(response, maxBytes) {
    var _a2, _b2;
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > maxBytes) return null;
    const reader = (_b2 = (_a2 = response.body) == null ? void 0 : _a2.getReader) == null ? void 0 : _b2.call(_a2);
    if (!reader) {
      const bytes2 = new Uint8Array(await response.arrayBuffer());
      return bytes2.byteLength > maxBytes ? null : bytes2;
    }
    const chunks = [];
    let total = 0;
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
  function attachmentFileName(attachment, mimeType, index, used) {
    const raw = (attachment.name || attachment.id || `attachment-${index}`).replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^.*[\\/]/, "");
    const dot = raw.lastIndexOf(".");
    const base = slugify(dot > 0 ? raw.slice(0, dot) : raw, `attachment-${index}`);
    const namedExt = dot > 0 ? raw.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    const mime = (mimeType ?? attachment.mimeType ?? "").split(";")[0].trim();
    const ext = namedExt || EXTENSION_BY_MIME[mime] || "bin";
    let name = `${base}.${ext}`;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}.${ext}`;
    used.add(name);
    return name;
  }
  async function downloadAttachments(conversation, adapter, options = {}) {
    var _a2;
    const maxBytes = options.maxBytes ?? DEFAULT_ATTACHMENT_MAX_BYTES;
    const throttleMs = options.throttleMs ?? 500;
    const fetchImpl = options.fetchImpl ?? ((_a2 = globalThis.fetch) == null ? void 0 : _a2.bind(globalThis));
    const files = [];
    const used = /* @__PURE__ */ new Set();
    const baseDir = `${conversation.platform}/attachments/${conversationBaseName(conversation)}`;
    let saved = 0;
    let skipped = 0;
    let first = true;
    for (const [index, attachment] of (conversation.attachments ?? []).entries()) {
      if (typeof attachment.sizeBytes === "number" && attachment.sizeBytes > maxBytes) {
        skipped++;
        continue;
      }
      if (!first) await sleep(throttleMs);
      first = false;
      let payload = null;
      try {
        if (adapter.fetchAttachment) {
          payload = await adapter.fetchAttachment(attachment, conversation);
        }
        if (!payload && attachment.url && fetchImpl) {
          const response = await fetchImpl(attachment.url);
          if (response.ok) {
            const bytes = await readCapped(response, maxBytes);
            if (bytes) {
              payload = { bytes };
              const mime = response.headers.get("content-type");
              if (mime) payload.mimeType = mime;
            }
          }
        }
      } catch {
        payload = null;
      }
      if (!payload || payload.bytes.byteLength > maxBytes) {
        skipped++;
        continue;
      }
      const mimeType = payload.mimeType ?? attachment.mimeType;
      const name = attachmentFileName(
        payload.name ? { ...attachment, name: payload.name } : attachment,
        mimeType,
        index,
        used
      );
      const path = `${baseDir}/${name}`;
      attachment.localPath = path;
      if (!attachment.mimeType && mimeType) attachment.mimeType = mimeType.split(";")[0].trim();
      if (attachment.sizeBytes === void 0) attachment.sizeBytes = payload.bytes.byteLength;
      files.push({ path, content: payload.bytes, mimeType: mimeType ?? "application/octet-stream" });
      saved++;
    }
    return { files, saved, skipped };
  }
  async function exportConversations(options) {
    var _a2;
    const {
      adapter,
      exporters,
      ids,
      range,
      throttleMs = 500,
      includeAttachments = false,
      attachmentMaxBytes,
      onFile,
      onProgress,
      onError
    } = options;
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
    let attachmentsSaved = 0;
    let attachmentsSkipped = 0;
    const emit = onFile ?? ((file) => files.push(file));
    for (const meta of metas) {
      onProgress == null ? void 0 : onProgress({ phase: "fetch", meta, completed: conversations.length, total: metas.length });
      try {
        const conversation = await fetchOne(meta.id);
        if (includeAttachments && ((_a2 = conversation.attachments) == null ? void 0 : _a2.length)) {
          onProgress == null ? void 0 : onProgress({ phase: "attachments", meta, completed: conversations.length, total: metas.length });
          const downloaded = await downloadAttachments(conversation, adapter, {
            maxBytes: attachmentMaxBytes,
            throttleMs
          });
          for (const file of downloaded.files) emit(file);
          attachmentsSaved += downloaded.saved;
          attachmentsSkipped += downloaded.skipped;
        }
        conversations.push(conversation);
        onProgress == null ? void 0 : onProgress({ phase: "export", meta, completed: conversations.length, total: metas.length });
        for (const exporter of exporters) {
          emit(exporter.export(conversation));
        }
      } catch (error) {
        failed.push(meta.id);
        onError == null ? void 0 : onError(meta.id, error);
      }
    }
    onProgress == null ? void 0 : onProgress({ phase: "done", completed: conversations.length, total: metas.length });
    return { files, conversations, failed, attachmentsSaved, attachmentsSkipped };
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
  function localHref(attachment, platform) {
    const localPath = attachment == null ? void 0 : attachment.localPath;
    if (!localPath) return void 0;
    const prefix = `${platform}/`;
    return localPath.startsWith(prefix) ? `../${localPath.slice(prefix.length)}` : localPath;
  }
  function renderPart(part, context) {
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
      case "image": {
        const attachment = part.attachmentId ? context.attachments.get(part.attachmentId) : void 0;
        const href = localHref(attachment, context.platform) ?? part.url ?? (attachment == null ? void 0 : attachment.url) ?? part.attachmentId ?? "";
        return `![${part.alt ?? ""}](${href})`;
      }
      case "file": {
        const attachment = context.attachments.get(part.attachmentId);
        const href = localHref(attachment, context.platform) ?? (attachment == null ? void 0 : attachment.url) ?? part.attachmentId;
        return `📎 [${part.name ?? (attachment == null ? void 0 : attachment.name) ?? part.attachmentId}](${href})`;
      }
    }
  }
  function renderMessage(message, context) {
    var _a2;
    const blocks = [];
    if (message.reasoning) {
      blocks.push(
        "<details><summary>💭 Reasoning</summary>\n\n" + message.reasoning.content + "\n\n</details>"
      );
    }
    const body = message.content.map((part) => renderPart(part, context)).join("\n\n");
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
    const context = {
      platform: conversation.platform,
      attachments: new Map((conversation.attachments ?? []).map((a) => [a.id, a]))
    };
    for (const message of conversation.messages) {
      const rendered = renderMessage(message, context);
      if (rendered) parts.push(rendered);
    }
    if ((_a2 = conversation.attachments) == null ? void 0 : _a2.length) {
      const items = conversation.attachments.map((a) => {
        const label = a.name ?? a.id;
        const href = localHref(a, conversation.platform) ?? a.url;
        return href ? `- [${label}](${href})` : `- ${label}`;
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
  var Deflate = /* @__PURE__ */ function() {
    function Deflate2(opts, cb) {
      if (typeof opts == "function")
        cb = opts, opts = {};
      this.ondata = cb;
      this.o = opts || {};
      this.s = { l: 0, i: 32768, w: 32768, z: 32768 };
      this.b = new u8(98304);
      if (this.o.dictionary) {
        var dict = this.o.dictionary.subarray(-32768);
        this.b.set(dict, 32768 - dict.length);
        this.s.i = 32768 - dict.length;
      }
    }
    Deflate2.prototype.p = function(c, f) {
      this.ondata(dopt(c, this.o, 0, 0, this.s), f);
    };
    Deflate2.prototype.push = function(chunk, final) {
      if (!this.ondata)
        err(5);
      if (this.s.l)
        err(4);
      var endLen = chunk.length + this.s.z;
      if (endLen > this.b.length) {
        if (endLen > 2 * this.b.length - 32768) {
          var newBuf = new u8(endLen & -32768);
          newBuf.set(this.b.subarray(0, this.s.z));
          this.b = newBuf;
        }
        var split = this.b.length - this.s.z;
        this.b.set(chunk.subarray(0, split), this.s.z);
        this.s.z = this.b.length;
        this.p(this.b, false);
        this.b.set(this.b.subarray(-32768));
        this.b.set(chunk.subarray(split), 32768);
        this.s.z = chunk.length - split + 32768;
        this.s.i = 32766, this.s.w = 32768;
      } else {
        this.b.set(chunk, this.s.z);
        this.s.z += chunk.length;
      }
      this.s.l = final & 1;
      if (this.s.z > this.s.w + 8191 || final) {
        this.p(this.b, final || false);
        this.s.w = this.s.i, this.s.i -= 2;
      }
      if (final) {
        this.s = this.o = {};
        this.b = et;
      }
    };
    Deflate2.prototype.flush = function(sync) {
      if (!this.ondata)
        err(5);
      if (this.s.l)
        err(4);
      this.p(this.b, false);
      this.s.w = this.s.i, this.s.i -= 2;
      if (sync) {
        var c = new u8(6);
        c[0] = this.s.r >> 3;
        var ep = wfblk(c, this.s.r, et);
        this.s.r = 0;
        this.ondata(c.subarray(0, ep >> 3), false);
      }
    };
    return Deflate2;
  }();
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
  var dbf = function(l) {
    return l == 1 ? 3 : l < 6 ? 2 : l == 9 ? 1 : 0;
  };
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
  var ZipPassThrough = /* @__PURE__ */ function() {
    function ZipPassThrough2(filename) {
      this.filename = filename;
      this.c = crc();
      this.size = 0;
      this.compression = 0;
    }
    ZipPassThrough2.prototype.process = function(chunk, final) {
      this.ondata(null, chunk, final);
    };
    ZipPassThrough2.prototype.push = function(chunk, final) {
      if (!this.ondata)
        err(5);
      this.c.p(chunk);
      this.size += chunk.length;
      if (final)
        this.crc = this.c.d();
      this.process(chunk, final || false);
    };
    return ZipPassThrough2;
  }();
  var ZipDeflate = /* @__PURE__ */ function() {
    function ZipDeflate2(filename, opts) {
      var _this = this;
      if (!opts)
        opts = {};
      ZipPassThrough.call(this, filename);
      this.d = new Deflate(opts, function(dat, final) {
        _this.ondata(null, dat, final);
      });
      this.compression = 8;
      this.flag = dbf(opts.level);
    }
    ZipDeflate2.prototype.process = function(chunk, final) {
      try {
        this.d.push(chunk, final);
      } catch (e) {
        this.ondata(e, null, final);
      }
    };
    ZipDeflate2.prototype.push = function(chunk, final) {
      ZipPassThrough.prototype.push.call(this, chunk, final);
    };
    return ZipDeflate2;
  }();
  var Zip = /* @__PURE__ */ function() {
    function Zip2(cb) {
      this.ondata = cb;
      this.u = [];
      this.d = 1;
    }
    Zip2.prototype.add = function(file) {
      var _this = this;
      if (!this.ondata)
        err(5);
      if (this.d & 2)
        this.ondata(err(4 + (this.d & 1) * 8, 0, 1), null, false);
      else {
        var f = strToU8(file.filename), fl_1 = f.length;
        var com = file.comment, o = com && strToU8(com);
        var u = fl_1 != file.filename.length || o && com.length != o.length;
        var hl_1 = fl_1 + exfl(file.extra) + 30;
        if (fl_1 > 65535)
          this.ondata(err(11, 0, 1), null, false);
        var header = new u8(hl_1);
        wzh(header, 0, file, f, u, -1);
        var chks_1 = [header];
        var pAll_1 = function() {
          for (var _i = 0, chks_2 = chks_1; _i < chks_2.length; _i++) {
            var chk = chks_2[_i];
            _this.ondata(null, chk, false);
          }
          chks_1 = [];
        };
        var tr_1 = this.d;
        this.d = 0;
        var ind_1 = this.u.length;
        var uf_1 = mrg(file, {
          f,
          u,
          o,
          t: function() {
            if (file.terminate)
              file.terminate();
          },
          r: function() {
            pAll_1();
            if (tr_1) {
              var nxt = _this.u[ind_1 + 1];
              if (nxt)
                nxt.r();
              else
                _this.d = 1;
            }
            tr_1 = 1;
          }
        });
        var cl_1 = 0;
        file.ondata = function(err2, dat, final) {
          if (err2) {
            _this.ondata(err2, dat, final);
            _this.terminate();
          } else {
            cl_1 += dat.length;
            chks_1.push(dat);
            if (final) {
              var dd = new u8(16);
              wbytes(dd, 0, 134695760);
              wbytes(dd, 4, file.crc);
              wbytes(dd, 8, cl_1);
              wbytes(dd, 12, file.size);
              chks_1.push(dd);
              uf_1.c = cl_1, uf_1.b = hl_1 + cl_1 + 16, uf_1.crc = file.crc, uf_1.size = file.size;
              if (tr_1)
                uf_1.r();
              tr_1 = 1;
            } else if (tr_1)
              pAll_1();
          }
        };
        this.u.push(uf_1);
      }
    };
    Zip2.prototype.end = function() {
      var _this = this;
      if (this.d & 2) {
        this.ondata(err(4 + (this.d & 1) * 8, 0, 1), null, true);
        return;
      }
      if (this.d)
        this.e();
      else
        this.u.push({
          r: function() {
            if (!(_this.d & 1))
              return;
            _this.u.splice(-1, 1);
            _this.e();
          },
          t: function() {
          }
        });
      this.d = 3;
    };
    Zip2.prototype.e = function() {
      var bt = 0, l = 0, tl = 0;
      for (var _i = 0, _a2 = this.u; _i < _a2.length; _i++) {
        var f = _a2[_i];
        tl += 46 + f.f.length + exfl(f.extra) + (f.o ? f.o.length : 0);
      }
      var out = new u8(tl + 22);
      for (var _b2 = 0, _c = this.u; _b2 < _c.length; _b2++) {
        var f = _c[_b2];
        wzh(out, bt, f, f.f, f.u, -f.c - 2, l, f.o);
        bt += 46 + f.f.length + exfl(f.extra) + (f.o ? f.o.length : 0), l += f.b;
      }
      wzf(out, bt, this.u.length, tl, l);
      this.ondata(null, out, true);
      this.d = 2;
    };
    Zip2.prototype.terminate = function() {
      for (var _i = 0, _a2 = this.u; _i < _a2.length; _i++) {
        var f = _a2[_i];
        f.t();
      }
      this.d = 2;
    };
    return Zip2;
  }();
  const STORED_MIME = /^(?:image|video|audio)\/|\/(?:zip|gzip|x-7z-compressed)$/;
  const DEFAULT_SPILL_BYTES = 32 * 1024 * 1024;
  class ZipSink {
    constructor(options = {}) {
      __publicField(this, "zip");
      __publicField(this, "spillBytes");
      __publicField(this, "parts", []);
      __publicField(this, "chunks", []);
      __publicField(this, "chunkBytes", 0);
      __publicField(this, "error", null);
      __publicField(this, "finished");
      __publicField(this, "resolveFinished");
      this.spillBytes = options.spillBytes ?? DEFAULT_SPILL_BYTES;
      this.finished = new Promise((resolve) => {
        this.resolveFinished = resolve;
      });
      this.zip = new Zip((err2, data, final) => {
        if (err2) {
          this.error = err2;
          this.resolveFinished();
          return;
        }
        if (data.length) {
          this.chunks.push(data);
          this.chunkBytes += data.length;
          if (this.chunkBytes >= this.spillBytes) this.spill();
        }
        if (final) this.resolveFinished();
      });
    }
    spill() {
      if (!this.chunkBytes) return;
      this.parts.push(new Blob(this.chunks));
      this.chunks = [];
      this.chunkBytes = 0;
    }
    /** Adds one file; its bytes are compressed (or stored) immediately. */
    add(file) {
      if (this.error) throw this.error;
      const bytes = typeof file.content === "string" ? strToU8(file.content) : file.content;
      const entry = STORED_MIME.test(file.mimeType) ? new ZipPassThrough(file.path) : new ZipDeflate(file.path, { level: 6 });
      this.zip.add(entry);
      entry.push(bytes, true);
    }
    /** Finalizes the archive and returns it as a single Blob. */
    async finish() {
      this.zip.end();
      await this.finished;
      if (this.error) throw this.error;
      this.spill();
      return new Blob(this.parts, { type: "application/zip" });
    }
  }
  function download(blob, filename) {
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
      case "attachments":
        return `Downloading files ${p.completed + 1}/${p.total}…`;
      case "export":
        return `Exporting ${p.completed}/${p.total}…`;
      case "done":
        return `Done — ${p.completed} conversations.`;
    }
  }
  function resolveAdapter() {
    const adapters = [
      new KimiAdapter(),
      new GeminiAdapter(),
      new GrokAdapter(),
      new DeepSeekAdapter(),
      new ChatGPTAdapter(),
      new YuanbaoAdapter()
    ];
    return adapters.find((adapter) => adapter.detect()) ?? null;
  }
  async function runExport(adapter, setStatus, choices) {
    const sink = new ZipSink();
    const { conversations, failed, attachmentsSaved, attachmentsSkipped } = await exportConversations({
      adapter,
      exporters: [markdownExporter(), jsonExporter()],
      range: choices.range,
      includeAttachments: choices.includeAttachments,
      throttleMs: 500,
      onFile: (file) => sink.add(file),
      onProgress: (p) => setStatus(describeProgress(p)),
      onError: (id, error) => console.error("[ai-chat-exporter] failed", id, error)
    });
    if (!conversations.length) {
      setStatus("No conversations exported.");
      return;
    }
    const zip = await sink.finish();
    download(zip, `${adapter.platform}-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.zip`);
    const bits = [`Saved ${conversations.length} conversations`];
    if (attachmentsSaved) bits.push(`+${attachmentsSaved} files`);
    if (attachmentsSkipped) bits.push(`${attachmentsSkipped} files skipped`);
    if (failed.length) bits.push(`${failed.length} failed`);
    setStatus(`${bits[0]}${bits.length > 1 ? ` (${bits.slice(1).join(", ")})` : ""}.`);
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
  function askChoices(adapter) {
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
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:12px;cursor:pointer">
        <input data-role="attachments" type="checkbox" style="margin:0">
        <span>Include attachments (images &amp; files)</span>
      </label>
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
      const attachmentsInput = panel.querySelector('[data-role="attachments"]');
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
        close({ range: { from, to }, includeAttachments: attachmentsInput.checked });
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
      const choices = await askChoices(adapter);
      if (!choices) return;
      button.disabled = true;
      try {
        await runExport(adapter, setStatus, choices);
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
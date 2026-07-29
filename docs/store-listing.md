# Store Listing / 发布文案

Ready-to-paste copy for publishing **AI Chat Exporter v0.1.1** on Greasy Fork (userscript) and the Chrome Web Store (extension). English first, then 简体中文.

本文档为 **AI Chat Exporter v0.1.1** 在油猴脚本站（Greasy Fork 等）与 Chrome 应用商店发布时的说明文案，可直接复制粘贴。先英文，后中文。

---

## 1. Basic info / 基本信息

| Field / 字段 | Value / 内容 |
|---|---|
| Name (EN) | AI Chat Exporter (Kimi, Gemini, Grok, DeepSeek & ChatGPT) |
| 名称（中） | AI 对话导出（Kimi、Gemini、Grok、DeepSeek & ChatGPT） |
| Version / 版本 | 0.1.1 |
| License / 许可 | MIT |
| Homepage / 主页 | https://github.com/wanda1416/ai-chat-exporter |
| Support / 反馈 | https://github.com/wanda1416/ai-chat-exporter/issues |
| Category / 分类 | Productivity / Tools（生产力 / 工具） |
| Tags / 标签 | export, backup, chatgpt, gemini, deepseek, grok, kimi, markdown, json |

---

## 2. Short description / 简短描述

> Used for the Greasy Fork one-liner and the Chrome Web Store summary (≤132 chars).
> 用于 Greasy Fork 简介和 Chrome 商店摘要（≤132 字符）。

**EN**

> Batch-export your Kimi, Gemini, Grok, DeepSeek & ChatGPT conversations to Markdown + JSON, zipped. One click — runs entirely in your browser, no data sent anywhere.

**中文**

> 一键批量导出 Kimi / Gemini / Grok / DeepSeek / ChatGPT 全部对话为 Markdown + JSON 并打包 zip。支持导出区间选择，纯本地运行，数据不离开浏览器。

---

## 3. Full description — English

### What it does

**AI Chat Exporter** backs up *all* your conversations from five AI platforms — **Kimi, Gemini, Grok, DeepSeek and ChatGPT** — in one click, straight from your logged-in browser session.

Most export tools handle one conversation at a time and only produce Markdown. This one is different:

- **Batch, not one-off** — export your entire chat history in a single run, or pick a range (e.g. conversations 1–100).
- **Two formats per conversation** — a human-readable **Markdown** file *and* a machine-readable **JSON** file following an open, documented schema (great for Obsidian, RAG pipelines, or any downstream tool).
- **One tidy ZIP** — everything downloads as `<platform>-export-YYYY-MM-DD.zip`, with `markdown/` and `json/` folders inside.
- **Optional attachment download** — tick “Include attachments” to also save images and uploaded files into an `attachments/` folder (per-file 50 MB cap; best effort — files the platform no longer serves are skipped and counted). Markdown then links to the local copies, so exports stay readable offline.
- **Local-first & private** — everything runs inside your own browser against your own account. **No data is ever sent to any third-party server.** No analytics, no tracking, no accounts.
- **Gentle on the platforms** — requests are throttled (500 ms apart), so exporting never hammers the service.
- **Rich content preserved** — code blocks, tables, reasoning chains (chain-of-thought) and message branches are kept where the platform provides them; image/attachment references are always recorded in the JSON.

### How to use

1. Open kimi.com, gemini.google.com, grok.com, chat.deepseek.com or chatgpt.com and log in as usual.
2. Click the **“Export all chats”** button in the bottom-right corner.
3. Pick a conversation range (or leave it empty for everything), optionally tick **Include attachments**, and confirm.
4. A ZIP file downloads. Done.

No configuration, no API keys, no tokens to copy — it reuses the session you're already logged into.

### Supported platforms (v0.1)

| Platform | Domain | Status |
|---|---|---|
| Kimi | kimi.com | ✅ Working |
| Gemini | gemini.google.com | ✅ Working |
| Grok | grok.com | ✅ Working |
| DeepSeek | chat.deepseek.com | ✅ Working |
| ChatGPT | chatgpt.com | ✅ Working |

Platform APIs are private and can change without notice. Each adapter is guarded by snapshot tests, and breakage is tracked openly on the project page — please report issues on GitHub.

### Privacy & compliance

- Runs **only in your local browser**, exporting **your own account's** data. Nothing is uploaded anywhere.
- Exporting your own data is a recognized right (GDPR Art. 20 data portability, and equivalents elsewhere).
- Does not bypass paywalls, does not scrape other people's content, and throttles all requests.
- Open source (MIT): https://github.com/wanda1416/ai-chat-exporter

---

## 4. 完整描述 — 简体中文

### 功能简介

**AI Chat Exporter（AI 对话导出）** 一键备份你在五大 AI 平台上的*全部*聊天记录——**Kimi、Gemini、Grok、DeepSeek、ChatGPT**——直接利用你浏览器里已登录的会话完成。

市面上大多数导出工具一次只能导一条对话，而且只产出 Markdown。本工具不一样：

- **批量导出，而非逐条**——一次运行导出完整历史，也可以只导指定区间（如第 1–100 条）。
- **每条对话两种格式**——一份可读的 **Markdown**，加一份遵循开放文档化 Schema 的 **JSON**（方便导入 Obsidian、RAG 入库或任何下游工具）。
- **打包成一个 ZIP**——下载文件名为 `<平台>-export-YYYY-MM-DD.zip`，内含 `markdown/` 与 `json/` 两个目录。
- **可选附件下载**——勾选“Include attachments”后，图片与上传文件会一并保存到 `attachments/` 目录（单文件上限 50 MB；尽力而为——平台已不提供的文件会跳过并计数）。Markdown 会链接到本地副本，离线也能完整阅读。
- **本地优先，注重隐私**——一切都在你自己的浏览器里、针对你自己的账号运行。**不向任何第三方服务器发送任何数据。** 无统计、无跟踪、无需注册。
- **对平台友好**——所有请求自带节流（每 500 ms 一次），不会对平台服务造成压力。
- **保留富内容**——代码块、表格、思维链（chain-of-thought）与消息分支树，平台提供的都会尽量保留；图片/附件的引用与元数据始终记录在 JSON 中。

### 使用方法

1. 正常打开 kimi.com、gemini.google.com、grok.com、chat.deepseek.com 或 chatgpt.com 并登录。
2. 点击页面右下角的 **“Export all chats”** 按钮。
3. 在弹窗中选择导出区间（留空即导出全部），可按需勾选 **Include attachments**，确认。
4. ZIP 文件自动下载，完成。

无需任何配置、API Key 或手动复制 token——直接复用你已登录的会话。

### 支持的平台（v0.1）

| 平台 | 域名 | 状态 |
|---|---|---|
| Kimi | kimi.com | ✅ 可用 |
| Gemini | gemini.google.com | ✅ 可用 |
| Grok | grok.com | ✅ 可用 |
| DeepSeek | chat.deepseek.com | ✅ 可用 |
| ChatGPT | chatgpt.com | ✅ 可用 |

各平台接口均为私有 API，可能随时变动。每个适配器都有快照测试守护，失效情况会在项目主页公开标注——遇到问题欢迎到 GitHub 提 Issue。

### 隐私与合规

- **只在你本地浏览器中运行**，导出的是**你自己账号**的数据，不上传到任何地方。
- 导出自己的数据是被认可的权利（GDPR 第 20 条「数据可携权」及其他地区对应条款）。
- 不绕过付费墙、不抓取他人内容，且所有请求均已节流。
- 开源（MIT）：https://github.com/wanda1416/ai-chat-exporter

---

## 5. Chrome Web Store extras / Chrome 商店附加材料

> The Web Store requires per-permission justifications and privacy disclosures during submission. Paste these into the “Privacy practices” tab.
> Chrome 商店提交时需要逐项填写权限用途与隐私声明，以下内容可直接粘贴到 “Privacy practices” 页。

### Permission justifications / 权限用途说明

The extension requests **zero permissions** — no `storage`, no `downloads`, no `host_permissions` beyond content-script matches. It only declares content scripts on the five chat domains (`www.kimi.com`, `gemini.google.com`, `grok.com`, `chat.deepseek.com`, `chatgpt.com`), running in the page's MAIN world.

本扩展**不申请任何权限**——没有 `storage`、没有 `downloads`、除内容脚本匹配外没有任何 `host_permissions`。仅在五个聊天域名（`www.kimi.com`、`gemini.google.com`、`grok.com`、`chat.deepseek.com`、`chatgpt.com`）上声明内容脚本，运行在页面 MAIN world 中。

- **Content script on the five chat domains / 五个聊天域名上的内容脚本**: needed to add the “Export all chats” button and to call the platform's own conversation APIs from within the user's logged-in page, exactly as the page itself would. / 用于在页面中添加 “Export all chats” 按钮，并在用户已登录的页面内以与页面自身完全相同的方式调用平台自己的对话接口。

### Single purpose / 单一用途声明

**EN:** This extension has a single purpose: letting users batch-export their own AI chat conversations (Kimi, Gemini, Grok, DeepSeek, ChatGPT) to local Markdown/JSON files.

**中文：** 本扩展只有一个用途：让用户将自己在 Kimi、Gemini、Grok、DeepSeek、ChatGPT 上的对话批量导出为本地 Markdown/JSON 文件。

### Data usage disclosure / 数据使用披露

**EN:** This extension does **not** collect, transmit, sell or share any user data. All processing happens locally in the user's browser; the only network requests made are to the chat platform the user is currently on, using the user's own session, solely to read the user's own conversations. The export is written directly to a local file download.

**中文：** 本扩展**不**收集、传输、出售或共享任何用户数据。全部处理均在用户浏览器本地完成；唯一的网络请求是向用户当前所在的聊天平台发出的，使用用户自己的会话，仅用于读取用户自己的对话内容。导出结果直接以本地文件下载形式保存。

### Remote code / 远程代码声明

**EN:** No remote code. All JavaScript is bundled into the extension package; nothing is fetched or evaluated at runtime.

**中文：** 不使用远程代码。所有 JavaScript 均打包在扩展内，运行时不加载、不执行任何外部代码。

---

## 6. Greasy Fork extras / Greasy Fork 附加材料

- **Script metadata / 脚本元数据**: name, description (bilingual), `@match`, `@grant none`, `@license MIT`, update/download URLs are all embedded in the userscript header — Greasy Fork reads them automatically on import.
  脚本头部已内置双语名称/描述、`@match`、`@grant none`、`@license MIT` 及更新/下载地址，Greasy Fork 导入时自动读取。
- **`@grant none` note / 说明**: the script uses no GM_* APIs; it runs in the page context with the same privileges as the page itself.
  脚本不使用任何 GM_* API，运行在页面上下文中，权限与页面本身完全相同。
- **Antifeatures / 负面特性声明**: none — no ads, no tracking, no miners, no obfuscation (source maps to the open GitHub repo).
  无——无广告、无跟踪、无挖矿、无混淆（源码对应公开的 GitHub 仓库）。

---

## 7. Release notes / 版本说明

### v0.1.1

**EN**

- New: optional attachment download — tick “Include attachments (images & files)” in the export dialog to also save images and uploaded files into an `attachments/` folder. Per-file 50 MB cap; files the platform no longer serves are skipped and counted, never fatal.
- Markdown now links to the local copies when attachments are downloaded, so exports stay readable offline; JSON gains a `localPath` field on each `Attachment`.
- Streaming ZIP (`ZipSink`) keeps peak memory low — compressed output is spilled to `Blob` parts every 32 MB, so large exports (especially with attachments) no longer have to fit in memory twice.
- ChatGPT adapter now resolves attachment bytes via the `/backend-api/files/{id}/download` endpoint, covering both user uploads (`file-…`) and generated images (`sediment://file_…` pointers).
- Status bar now reports `+N files` and `M files skipped` when attachments are included.

**中文**

- 新增：可选附件下载——在导出弹窗勾选“Include attachments (images & files)”后，图片与上传文件会一并保存到 `attachments/` 目录。单文件上限 50 MB；平台已不提供的文件会跳过并计数，不会导致导出失败。
- Markdown 在有本地附件时改为链接本地副本，离线也能完整阅读；JSON 中每个 `Attachment` 新增 `localPath` 字段。
- 流式 ZIP（`ZipSink`）降低峰值内存——压缩输出每 32 MB 凝成一个 `Blob` 分片，大导出（尤其带附件）不再需要在内存中完整驻留两份。
- ChatGPT 适配器通过 `/backend-api/files/{id}/download` 端点解析附件字节，覆盖用户上传（`file-…`）与生成图（`sediment://file_…` 指针）。
- 状态栏在勾选附件时会额外报告 `+N files` 与 `M files skipped`。

### v0.1.0

**EN**

- Initial public release.
- Five platform adapters: Kimi, Gemini, Grok, DeepSeek, ChatGPT — all verified against live accounts (2026-07).
- Batch export with range selection (e.g. 1–100), Markdown + JSON per conversation, bundled as one ZIP.
- Preserves code blocks, tables, images, attachments, reasoning chains and message branches where available.
- Built-in 500 ms request throttling.
- Ships as both a Tampermonkey userscript and a zero-permission Chrome extension (identical behavior).

**中文**

- 首个公开版本。
- 五个平台适配器：Kimi、Gemini、Grok、DeepSeek、ChatGPT——均经真实账号验证（2026-07）。
- 批量导出，支持区间选择（如 1–100）；每条对话产出 Markdown + JSON，打包为一个 ZIP。
- 尽可能保留代码块、表格、图片、附件、思维链与消息分支。
- 内置 500 ms 请求节流。
- 同时提供油猴脚本与零权限 Chrome 扩展两种形态（行为完全一致）。

---

## 8. Known limitations / 已知限制

**EN**

- Attachment download is best effort: Grok and DeepSeek expose no download URL for uploaded files (metadata only), Gemini attachments are not yet parsed, and some CDN-hosted files may be blocked by CORS — skipped files are counted and reported, never fatal.
- Gemini conversations longer than 100 turns rely on a continuation token inferred from the list RPC; still being validated against a live long chat.
- Platform APIs are private and may break without notice; the project page tracks last-verified dates honestly.
- UI text is currently English-only (“Export all chats” button and range dialog).

**中文**

- 附件下载为尽力而为：Grok 与 DeepSeek 不提供上传文件的下载地址（仅元数据），Gemini 附件尚未解析，部分 CDN 文件可能受 CORS 限制——跳过的文件会计数并提示，不会导致导出失败。
- Gemini 超过 100 轮的对话依赖从列表 RPC 推断的续页 token，尚待真实超长对话验证。
- 各平台接口为私有 API，可能随时失效；项目主页如实标注最近验证日期。
- 界面文案目前仅英文（“Export all chats” 按钮与区间弹窗）。

# AI 对话通用导出工具 — 项目蓝图

> 本文档为**独立新项目**的设计蓝图，暂存于知识库；新仓库建好后可迁移为 `docs/blueprint.md`。
> 定位：本地优先的 AI 对话批量导出工具，适配所有主流 AI 平台，作为开源标准工具发布。

## 1. 定位与命名

**一句话定位**：本地优先的 AI 对话批量导出工具——把你在各 AI 平台的全部对话，一键导出为标准格式。

**命名方向**（注册前查 GitHub / npm 占用）：

- `chatporter` —— "chat + porter/portability"，直接点出数据可携带
- `convoy` / `convo-ark` —— 对话方舟，备份意象
- `unchat` / `dechat` —— "把对话从平台里解放出来"

**差异化主张**（写进 README 第一屏）：

1. **批量**导出全部历史，不是单条；
2. 定义**开放的对话交换格式**（Schema），而非只产出 Markdown；
3. **本地优先**：数据不经过任何第三方服务器；
4. 适配器**社区可维护**：每个平台的适配层足够薄、有 fixtures 保护。

## 2. 核心设计：两段式管道 + 标准 Schema

```
平台适配器 (Adapter)  →  标准对话格式 (Schema)  →  导出器 (Exporter)
   Kimi / DeepSeek...      conversation.json          Markdown / JSON / ZIP / DOCX...
```

**Schema 是项目的"标准"所在**，v0.1 就要定稿第一版（`schema/v1`），核心实体：

```
Conversation: id, platform, title, createdAt, updatedAt, model, messages[]
Message:      id, role (user/assistant/system), content[], timestamp,
              citations[] (引用来源), attachments[], reasoning (思维链, 可选),
              siblings/branch (分支对话, 预留字段)
ContentPart:  text | code | table | image | file  (结构化内容块)
```

用 Zod 定义（单一事实来源），同时生成 JSON Schema 文件对外发布——第三方工具（Obsidian 插件、RAG 入库脚本）可以只依赖这个格式。

## 3. 仓库结构（TypeScript monorepo，pnpm workspaces）

```
├── packages/
│   ├── schema/              # Zod 定义 + JSON Schema 导出（零依赖）
│   ├── core/                # 管道编排、Adapter/Exporter 接口、拦截器框架、运行时抽象
│   ├── adapter-kimi/        # v0.1 参考适配器（干净 JSON API）
│   ├── adapter-gemini/      # 第二适配器（batchexecute），验证 Schema 通用性
│   ├── exporter-markdown/
│   ├── exporter-json/
│   └── exporter-zip/        # 打包批量结果 (fflate)
├── apps/
│   ├── userscript/          # 首发形态：Tampermonkey 脚本 (vite 构建单文件)
│   └── cli/                 # v0.2+：Node CLI，读取 token 定期增量备份
├── fixtures/
│   └── kimi/                # 脱敏的真实 API 响应样本（golden files）
├── docs/
│   ├── schema.md            # 格式规范（对外标准文档）
│   ├── adapter-guide.md     # 「30 分钟写一个新平台适配器」
│   └── compliance.md        # 合规声明
└── .github/workflows/       # CI: typecheck + vitest 快照测试
```

**core 的关键接口**（对 chat-export-toolkit 做减法）：

```ts
interface PlatformAdapter {
  platform: string;
  detect(): boolean;                                    // 域名/页面特征
  listConversations(): AsyncIterable<ConversationMeta>; // 分页用迭代器抹平
  fetchConversation(id: string): Promise<Conversation>; // 直接产出标准格式
}
```

比它少一层：**不要独立的 Normalizer 层**——适配器直接吐标准 Schema，层数越多骨架烂尾风险越大。降级策略（API → DOM）作为适配器内部实现细节，不进公共接口。

## 4. 可持续维护的三根支柱（决定项目生死）

各平台 API 每改版一次，适配器就会坏一个——这是现有同类项目全部烂尾的根因。参照 yt-dlp（本质也是"适配无数个随时变化的私有接口"）的存活经验：

1. **Golden fixtures 测试**：每个适配器必须附带脱敏真实响应样本，`vitest` 快照测试"样本 → 标准格式"的转换。平台改版时，贡献者只需更新 fixture + 解析函数，CI 立刻验证。附带 `scripts/anonymize.ts` 脱敏工具，降低贡献样本的隐私门槛。
2. **适配器健康看板**：README 平台支持矩阵标注"最后验证日期"，坏了标 ⚠️——诚实状态比虚假的 ✅ 列表更能赢得信任。
3. **薄适配器公约**：单个适配器目标 ≤300 行、只做"端点 + 解析"两件事，写进 adapter-guide。

## 5. 路线图

| 版本 | 内容 | 验收标准 |
|---|---|---|
| **v0.1** | Schema v1 + Kimi 适配器 + MD/JSON/ZIP 导出 + 油猴脚本 | 全部 Kimi 对话一键导出 ZIP，表格/引用/代码块保真 |
| v0.2 | CLI 形态（增量备份）+ 第二平台（DeepSeek，声量最大） | 适配器接口经受住第二个平台检验，不需改 core |
| v0.3 | adapter-guide + fixtures 脱敏工具 + CONTRIBUTING，开放社区适配器 | 收到第一个外部 PR |
| v0.4+ | 浏览器扩展形态、Obsidian 导出器、更多平台 | 由社区需求驱动 |

**v0.1 刻意不做**：浏览器扩展、DOCX/PDF、多平台骨架、UI 美化。每一项都是烂尾诱因。

## 6. 合规叙事（写进 README 和 compliance.md）

- 仅在用户本地浏览器运行，导出**用户自己账号**的数据，不发送到任何服务器；
- 数据可携带权是正当权利（GDPR Art. 20、个保法第 45 条均有对应条款）；
- 内置请求节流（如 500ms/请求），不构成对平台的压力；
- 不绕过付费墙、不抓取他人内容；MIT 协议 + "AS IS" 免责。

## 7. 第一步：技术验证先行 ✅ 已完成

开仓库后的第 1 个 issue 原计划：**用 DevTools 抓取 Kimi 真实 API**（会话列表 + 消息详情两个端点的 URL、认证方式、响应 JSON），脱敏后作为第一批 fixtures 提交。**这一步完成前不写任何适配器代码**——避免重蹈"凭想象写骨架"的覆辙。

**验证状态**：已通过浏览器实测完成（返回 200，真实数据确认），完整结果见第 8 节。`fixtures/kimi/` 脱敏样本已落地并由快照测试覆盖。2026-07 进一步做了**端到端实跑**（登录态浏览器内注入完整管道，真实导出 2 条会话含 151 消息长会话）：List→Fetch→Markdown/JSON→ZIP 全链路 0 失败，表格/代码/思维链/引用保真；并借此发现并修复了 `ListMessages` 逆序返回导致的消息顺序 bug（见第 8 节）。此后（2026-07）又用 CDP 调试浏览器把最近 20 条会话真实导出落盘（40 文件，SHA-256 与源逐字节一致），并修掉了空 `system` 根节点渲染成悬空标题的瑕疵（见第 10 节）。剩余待办：长对话的 `ListMessages` 分页游标待用更长会话补测。

## 8. Kimi API 实测结果（技术验证）

> 2026-07 通过登录态浏览器实测确认：所有端点均带 Bearer token 调用返回 200、真实数据。下列为 v0.1 Kimi 适配器的事实依据。

**基址与协议**：`https://www.kimi.com/apiv2/`，ConnectRPC 风格，服务按 `包.服务.版本/方法` 命名，方法均为 **POST**。列表/查询类用普通 `application/json`；仅实时对话流 `ChatService/Chat` 用 `application/connect+json`（流式帧，导出用不到）。

**认证（关键）**：**不是 Cookie**，而是 `localStorage.access_token` 里的 JWT，经 `Authorization: Bearer <token>` 头传递；缺失时返回 401 `REASON_INVALID_AUTH_TOKEN`。旁边 `localStorage.refresh_token` 用于续期。导出全程只需 `Authorization` + `x-msh-platform: web` + `x-language` 三个头。油猴脚本形态天然可读 localStorage，契合。

**三个核心端点**（批量导出全靠它们）：

| 端点 (POST) | 请求体 | 返回 |
|---|---|---|
| `kimi.gateway.feed.v1.FeedService/ListFeeds` | `{page_size, project_id, filter_types:["FEED_TYPE_CHAT","FEED_TYPE_TASK"], include_pinned, page_token}` | 会话列表 `items[].chat{id,name,messageContent,createTime,updateTime,status,...}` + `nextPageToken` |
| `kimi.gateway.chat.v1.ChatService/GetChat` | `{chat_id}` | `{chat{id,name,messageContent,createTime,updateTime,status}, files[]{meta{name,contentType,sizeBytes,checksum},blob.signUrl}}`（会话包在 `chat` 下） |
| `kimi.gateway.chat.v1.ChatService/ListMessages` | `{chat_id}` | 完整消息树 `messages[]` + `nextPageToken` |

**消息结构（直接决定 Schema）**：

- `role`: `user` / `assistant` / `system`（含 system 根节点，id 为全 0）。该根节点 `content` 为空——Markdown 渲染器跳过「无正文/思维链/引用」的空消息，避免产生光秃秃的 `## ⚙️ System` 悬空标题（`packages/exporter-markdown` 附回归测试）。
- **树形分支**：每条消息带 `parentId`（根为空串），但**不带** `childrenMessageIds`——子节点需由 `parentId` 反推。仍印证 Schema 预留 `parentId`/`childrenIds` 分支字段是必要的。
- **返回顺序（实测坑）**：`messages[]` **逆序返回**（最新 turn 在前），且同一 turn 内**助手回复排在它自己的用户提问之前**（两者 `createTime` 仅差几微秒）。直接按数组序导出会「答在问前、通篇倒序」。适配器 `toConversation` 按 `createTime` 升序**稳定重排**修正——此坑由 2026-07 端到端实跑（一条 151 消息真实会话）发现，`fixtures/kimi/listMessages.json` 已特意改成逆序样本以守护该行为。
- `blocks[]` 按类型区分（block 自带 `id`/`parentId`/`messageId`/`createTime` 元数据，内容为 oneof）：`text`=正文 `{content}`；`think`=思维链 `{content, summary}`（对应 Schema `reasoning`）；`tool`=工具调用 `{toolCallId,name,args,contents,status}`（进度脚手架，导出跳过）；`multiStage`/`stage`=阶段标记（跳过）。
- **引用来源**：消息级 `references[]`（web 搜索引证），结构 `items[].search.base{title,url,siteName,snippet,...}`，映射到 Schema `citations`（按 url 去重）。
- `status`: 如 `MESSAGE_STATUS_FINISHED`；时间戳为 ISO8601；ID 为 UUID；`scenario` 如 `SCENARIO_CHAT`。
- 附件走 `GetChat.files[]` 的带 `sig` 临时签名 URL，导出时需存 URL 或即时下载。

**分页**：`ListFeeds` / `ListMessages` 均用请求参数 `page_token` + 响应 `nextPageToken`（空串即末页），已在适配器实现并由 `fixtures/kimi/` 快照测试覆盖。

## 9. Gemini API 实测结果（第二平台，验证 Schema 通用性）

> 2026-07 通过登录态浏览器（复用日常 Chrome profile 的 Cookie）实测确认：`batchexecute` 两个 RPC 返回 200、真实数据。这是刻意选的「反面样本」——与 Kimi 干净的 ConnectRPC/JSON 截然不同，用来检验 Schema v1 与两段式管道是否只是过拟合 Kimi。

**基址与协议**：`POST https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=<id>&source-path=/app&f.sid=<sid>&bl=<release>&hl=<lang>&_reqid=<n>&rt=c`。**没有干净 JSON API**：所有调用走 Google 内部 `batchexecute` 协议，请求体 `application/x-www-form-urlencoded`。

**认证（关键，与 Kimi 相反）**：靠 **Cookie**（登录态 `SAPISID` 等，`credentials: include`）+ 页面里的 XSRF token。三个 token 都在 `window.WIZ_global_data`：`at`=`SNlM0e`（XSRF，进请求体）、`bl`=`cfb2h`（后端版本）、`f.sid`=`FdrFJe`（前端会话）。油猴脚本在 `gemini.google.com` 源内运行天然带 Cookie 且可读 `WIZ_global_data`，契合。

**请求体**：`f.req=<URL 编码的 [[["<rpcid>","<内层 payload 的 JSON 字符串>",null,"generic"]]]>&at=<token>&`。内层 payload 本身是被 JSON 序列化成字符串再塞进外层数组。

**响应（反 JSON 包裹）**：以 `)]}'` 前缀开头，后跟若干「长度行 + JSON chunk」；有用的 chunk 形如 `[["wrb.fr","<rpcid>","<内层结果，又是 JSON 字符串>",...]]`。解析需两层：先按行剥壳定位 `wrb.fr` 拿到字符串，再 `JSON.parse` 得到深层嵌套数组。适配器 `extractRpcPayload` 对长度行做容错（逐行试解析，不依赖长度准确）。

**两个核心 RPC**：

| RPC (rpcid) | 内层请求 | 内层响应（**纯位置数组，无字段名**） |
|---|---|---|
| 列表 `MaZiqc` | `[20, "<pageToken>", [0,null,1]]` | `[null, "<nextPageToken>", [item...]]`；`item=[convId, title, null×3, [sec,nanos], …, responseId]` |
| 详情 `hNvQHb` | `["c_<convId>", 10, null, 1, [0], [4], null, 1]` | `[[turn...], null, null, []]` |

**详情 turn 结构（直接决定解析）**：`turn = [[convId, respId], null, [userPrompt…], [candidates…], [sec,nanos]]`。

- 用户文本 `turn[2][0][0]`，用户消息 id `turn[2][4]`；
- 候选数组 `turn[3][0]`，每个候选 `[candidateId, [markdown], …]`；被选中候选 id 在 `turn[3][3]`，助手正文取该候选的 `[1][0]`（干净 Markdown，另有一份结构化富文本表示，v0.1 用不到）；
- 模型名（如 `3.6 Flash`）是候选块尾部的裸字符串（从尾部扫描第一个非 id 字符串即得）；
- 时间戳 `turn[4]=[秒,纳秒]`。

**与 Kimi 的关键差异 → 全部落到「适配器层」，Schema 与 core 零改动**：

| 维度 | Kimi | Gemini |
|---|---|---|
| 传输 | 干净 ConnectRPC/JSON | `batchexecute` 位置数组 + 反 JSON 包裹 |
| 认证 | `Authorization: Bearer`（localStorage JWT） | Cookie + `at` XSRF token（WIZ_global_data） |
| 消息组织 | **树形**（`parentId`，子节点反推 `childrenIds`） | **线性**多轮（无分支，不产出树字段） |
| 正文 | 分块 `blocks[]`（text/think/tool…） | 单块 Markdown 字符串 |
| 引用/思维链 | `references`→citations、`think`→reasoning | 本次样本均无（字段留空即可） |
| 标题 | `GetChat` 直接给 | 详情 RPC **不含**，从列表带入或用首条 prompt 兜底 |

**通用性结论**：两个传输/认证/数据模型都截然不同的平台，映射到**同一份 Schema v1**、复用**同一套 `PlatformAdapter` 接口与管道**，全程不改 `schema` 与 `core`——差异被完全隔离在适配器内。尤其验证了几个 Schema 设计决策站得住：① `parentId`/`childrenIds` 为可选，天然同时容纳树形（Kimi）与线性（Gemini）；② `Message.model` 的按条覆盖、`content[]` 结构化块、`citations`/`reasoning` 可选，都能优雅降级到「没有就不填」。由 `packages/adapter-gemini` + `fixtures/gemini/` 快照测试固化，佐证两段式管道不是对 Kimi 的过拟合。

## 10. 端到端实跑与 CDP 抓取的工程注意事项（dogfood）

> 2026-07 通过 CDP 调试浏览器（复用登录态）把完整管道注入线上 Kimi 页面实跑，真实导出最近 20 条会话落盘（40 文件，SHA-256 全部与源逐字节一致）。过程沉淀出几条「浏览器内取数 → 落盘」的工程坑，对后续 CLI / 扩展形态的抓取链路同样适用。

- **大字符串返回会卡死**：`agent-browser eval` 返回 >~100KB 的字符串会挂起。取数必须分块——把内容留在页面（如 `window.__FILES__`），按 ≤60KB 切片多次取回、本地拼接；切勿一次性返回整包。
- **控制台编码腐蚀 UTF-8**：中文 Windows 上 PowerShell 控制台按 GBK 回显，会把 agent-browser 的 UTF-8 stdout 解码坏（中文/emoji 乱码、文件名非法）。**传输层全程走 base64（纯 ASCII）**：页面内先 `TextEncoder` 编码再 base64（`btoa` 仅支持 Latin1，必须先 UTF-8），本地 `FromBase64String` 得字节后 `WriteAllBytes` 直写，绕开一切编码与 JSON 转义边界问题。
- **eval 的两个行为**：会 `await` 返回的 Promise；`window` 跨 eval 持久（可分步在页面累积状态）。`--stdin` 传代码在 CRLF/BOM 下失败，改用 `eval -b <base64>` 传代码更稳。
- **确定性校验**：落盘后不要靠肉眼看控制台（会被 GBK 假乱码误导）——页面内对每个文件内容算 SHA-256，与磁盘 `Get-FileHash` 逐一比对，match 数 = 文件数才算通过。
- **规模提示**：实测账号内 `ListFeeds` 全量分页得 1602 条会话——全量导出需分批（单次 eval 扛不住长时间运行），也印证 v0.2 CLI 增量备份的必要性。

## 11. Grok 适配器：真实 API 发现（第三个适配器）

> 2026-07 通过 CDP 登录态浏览器实测确认：Grok 的三个 REST 端点均返回 200、真实数据，并用真实账号完整 dogfood（3 条会话导出，含 18 轮长对话、引用、附件，0 失败）。这是第三种「极端」——认证比 Kimi/Gemini 都简单（**纯 Cookie，无 token**），数据比 Gemini 干净（**规整 REST/JSON**），进一步验证 Schema v1 不是对前两家的过拟合。

**基址与协议**：`https://grok.com/rest/`，干净 REST/JSON。Grok 前端是 **Remix 应用**——会话列表首屏 SSR 内联，只有客户端软导航（点侧栏另一条会话、或命令菜单搜索）才触发独立 REST 请求；直接刷新页面抓不到列表请求，需软导航或直接 fetch 探测。

**认证（关键，最简单）**：**纯 Cookie 会话**（`credentials: "include"`），无需 `Authorization: Bearer`、无需 XSRF token、无需任何自定义 header。油猴/扩展在 `grok.com` 源内运行天然带 Cookie，契合。

**三个核心端点**：

| 端点 | 方法 | 请求 | 响应 |
|---|---|---|---|
| 列表 | `GET /rest/app-chat/conversations?pageSize=N[&pageToken=<cursor>]` | 游标翻页 | `{conversations:[{conversationId,title,starred,createTime,modifyTime}], nextPageToken, textSearchMatches}` |
| 消息树骨架 | `GET /rest/app-chat/conversations/{id}/response-node` | — | `{responseNodes:[{responseId,sender,parentResponseId}], inflightResponses}`（时序，root first） |
| 消息正文 | `POST /rest/app-chat/conversations/{id}/load-responses` | `{responseIds:[...]}` | `{responses:[{responseId,message,sender,createTime,parentResponseId,model,webSearchResults,citedWebSearchResults,fileAttachmentAssetMetadata,…}]}` |

**分页**：游标式。`nextPageToken` 即上一页最后一个 `conversationId`，作为下一页的 `pageToken` 回传；实测第二页无重叠，空/缺失即末页。

**「查看全部」按钮 = 命令菜单，非独立数据源**：点击只触发 `opened_command_menu` 埋点；其搜索框走的是**同一个** `conversations` 端点，仅多带 `searchQuery=` 过滤参数。适配器翻不带 `searchQuery` 的完整列表即覆盖全部会话，无需单独适配。

**解析要点（直接决定实现）**：

- `sender`：`"human"`→user、`"ASSISTANT"`→assistant（大小写不敏感处理）；`message` 是纯 Markdown 字符串。
- **`load-responses` 不保证按请求顺序返回**（与 Kimi 同款坑）——必须按 `createTime` 稳定重排；fixture 刻意做成乱序样本守护该逻辑。
- 树结构靠 `parentResponseId`（root 缺失该键 → `parentId` 不赋值，保持 undefined），像 Kimi 一样反推 `childrenIds`。
- `model` 是**逐条消息级**（如 `grok-3`/`grok-4`），仅助手消息保留；会话级 model 取最后一条助手的。
- 引用 `citedWebSearchResults` 优先、回退 `webSearchResults`，`{url,title,preview}`→Citation（按 url 去重）。
- 附件 `fileAttachmentAssetMetadata[]={assetId,mimeType,name,sizeBytes}`→Attachment。
- 标题：详情端点**不含**，从列表带入或用首条 user prompt 兜底（与 Gemini 同策略）。

**通用性结论**：第三个平台在传输（REST）、认证（纯 Cookie）、数据模型（`parentResponseId` 树 + 逐条 model）上又是一组新组合，仍映射到**同一份 Schema v1**、复用**同一套接口与管道**，`schema`/`core` 零改动。由 `packages/adapter-grok` + `fixtures/grok/` 快照测试固化，并经真实账号 dogfood 验证。

## 附：产品形态决策

首发采用**核心库 + 多形态**架构：`core` 与形态解耦，v0.1 先出油猴脚本形态（免 token、天然带登录态、安装门槛低），浏览器扩展和 CLI 后续跟进。

## 附：现有项目调研结论

- 单条导出工具很多（GiveMeDoc、kimi-pp 等），**批量导出的几乎没有**。
- 最接近的 [gandli/chat-export-toolkit](https://github.com/gandli/chat-export-toolkit) 走对了适配器架构方向，但卡在 Alpha：Kimi 适配器是"凭想象写的骨架"（`fetchConversationList`/`fetchConversationDetail` 均为 TODO 返回 null，域名检测还停留在旧域名 `kimi.moonshot.cn`）。
- 结论：**不 fork，重起炉灶**。其 MIT 协议下可借鉴接口划分思路（学设计不抄代码），README Acknowledgements 致谢即可，定位上更像"新标准"而非"某项目分支"。
- [springrain1/kimi-pp](https://github.com/springrain1/kimi-pp)（Apache-2.0）：经源码核验，本质是 **DeepSeek++ 扩展机械改名壳**（`rename.cjs`、乱码 `diff_readme.txt` 为证），所有 REST 导出逻辑仍打 `chat.deepseek.com` 的 `/api/v0/` 接口；对 Kimi 的支持只有拦截实时对话请求做增强（`core/kimi/`），导出当前对话走 DOM 抓取，无任何 Kimi 批量列表/历史拉取代码——正是本项目要超越的"单条导出"。不可复用。可借鉴处：其 `core/kimi/protocol.ts` 的 Connect 帧编解码，对未来解析 `ChatService/Chat` 流式响应有参考价值，README 可致谢。

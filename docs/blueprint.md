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
│   ├── adapter-kimi/        # v0.1 唯一适配器
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

**验证状态**：已通过浏览器实测完成（返回 200，真实数据确认），完整结果见第 8 节。剩余待办：把实测响应脱敏后落成 `fixtures/kimi/`（含真实对话内容，进库前必须脱敏）；长对话的 `ListMessages` 分页游标待用长会话补测。

## 8. Kimi API 实测结果（技术验证）

> 2026-07 通过登录态浏览器实测确认：所有端点均带 Bearer token 调用返回 200、真实数据。下列为 v0.1 Kimi 适配器的事实依据。

**基址与协议**：`https://www.kimi.com/apiv2/`，ConnectRPC 风格，服务按 `包.服务.版本/方法` 命名，方法均为 **POST**。列表/查询类用普通 `application/json`；仅实时对话流 `ChatService/Chat` 用 `application/connect+json`（流式帧，导出用不到）。

**认证（关键）**：**不是 Cookie**，而是 `localStorage.access_token` 里的 JWT，经 `Authorization: Bearer <token>` 头传递；缺失时返回 401 `REASON_INVALID_AUTH_TOKEN`。旁边 `localStorage.refresh_token` 用于续期。导出全程只需 `Authorization` + `x-msh-platform: web` + `x-language` 三个头。油猴脚本形态天然可读 localStorage，契合。

**三个核心端点**（批量导出全靠它们）：

| 端点 (POST) | 请求体 | 返回 |
|---|---|---|
| `kimi.gateway.feed.v1.FeedService/ListFeeds` | `{page_size, project_id, filter_types:["FEED_TYPE_CHAT","FEED_TYPE_TASK"], include_pinned}` | 会话列表 `items[].chat{id,name,messageContent,createTime,updateTime,status,...}` |
| `kimi.gateway.chat.v1.ChatService/GetChat` | `{chat_id}` | 会话元数据 + 附件 `files[]{meta{name,contentType,sizeBytes,checksum},blob.signUrl}` |
| `kimi.gateway.chat.v1.ChatService/ListMessages` | `{chat_id}` | 完整消息树 `messages[]` |

**消息结构（直接决定 Schema）**：

- `role`: `user` / `assistant` / `system`（含 system 根节点，id 为全 0）。
- **树形分支**：每条消息带 `parentId` + `childrenMessageIds`，是树而非线性数组——印证 Schema 预留的 `siblings/branch` 字段是必要的。
- `blocks[]` 按类型区分（对应 `ContentPart`）：`text`=正文；`think`=思维链（含 `content` + `summary`，对应 Schema `reasoning`）；`multiStage`/`stage`=阶段标记；`file`=附件引用（配合 `GetChat.files[].blob.signUrl` 下载）。
- `status`: 如 `MESSAGE_STATUS_COMPLETED`；时间戳为纳秒级 ISO8601；ID 为 UUID；`scenario` 如 `SCENARIO_K2D5`。
- 附件下载走带 `sig` 的临时签名 URL，导出时需存 URL 或即时下载。

**待补**：`ListMessages` 分页游标（短对话一次返回完，未触发）；`ListFeeds` 翻页游标（需滚动列表触发）。

## 附：产品形态决策

首发采用**核心库 + 多形态**架构：`core` 与形态解耦，v0.1 先出油猴脚本形态（免 token、天然带登录态、安装门槛低），浏览器扩展和 CLI 后续跟进。

## 附：现有项目调研结论

- 单条导出工具很多（GiveMeDoc、kimi-pp 等），**批量导出的几乎没有**。
- 最接近的 [gandli/chat-export-toolkit](https://github.com/gandli/chat-export-toolkit) 走对了适配器架构方向，但卡在 Alpha：Kimi 适配器是"凭想象写的骨架"（`fetchConversationList`/`fetchConversationDetail` 均为 TODO 返回 null，域名检测还停留在旧域名 `kimi.moonshot.cn`）。
- 结论：**不 fork，重起炉灶**。其 MIT 协议下可借鉴接口划分思路（学设计不抄代码），README Acknowledgements 致谢即可，定位上更像"新标准"而非"某项目分支"。
- [springrain1/kimi-pp](https://github.com/springrain1/kimi-pp)（Apache-2.0）：经源码核验，本质是 **DeepSeek++ 扩展机械改名壳**（`rename.cjs`、乱码 `diff_readme.txt` 为证），所有 REST 导出逻辑仍打 `chat.deepseek.com` 的 `/api/v0/` 接口；对 Kimi 的支持只有拦截实时对话请求做增强（`core/kimi/`），导出当前对话走 DOM 抓取，无任何 Kimi 批量列表/历史拉取代码——正是本项目要超越的"单条导出"。不可复用。可借鉴处：其 `core/kimi/protocol.ts` 的 Connect 帧编解码，对未来解析 `ChatService/Chat` 流式响应有参考价值，README 可致谢。

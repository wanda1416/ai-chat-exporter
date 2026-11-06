# AI Chat Exporter

[English](./README.md) · **简体中文**

> **本地优先、批量导出你的 AI 对话。** 一键把任意 AI 平台上的*全部*聊天记录导出为开放、可迁移的格式——数据始终不离开你的浏览器。

现有工具大多一次只能导出一条对话，且只产出 Markdown。本项目不一样：

1. **批量，而非逐条**——一次运行即可导出你的完整历史。
2. **开放的交换格式**——一份有文档的[对话 Schema](#交换格式)，而不仅是 Markdown。第三方工具（Obsidian 导入器、RAG 入库）可以依赖这个格式，而不必依赖我们。
3. **本地优先**——一切都在你自己的浏览器里、针对你自己的账号运行，不向任何第三方服务器发送数据。
4. **社区可维护的适配器**——每个平台适配器都很薄（端点 + 解析），并由 golden-file fixture 守护，因此接口变动只是一次小而可测的修复。

## 项目状态

**v0.1 —— alpha。** 核心管道、Schema v1 与七个适配器（Kimi、Gemini、Grok、DeepSeek、ChatGPT、腾讯元宝、腾讯混元）均已在发行的油猴脚本中端到端可用，并经真实账号验证（真实对话导出到磁盘；Kimi 那次运行经 SHA-256 逐字节校验）。这几个平台刻意选了不同的极端——干净的 JSON、`batchexecute` 位置数组、仅靠 cookie 的 REST、带思维链的分支树、混合 system/tool/image 的 mapping 树、强风控下带富文本块的轮次数组、跨域 Cookie 网关配 `lastId` 游标的详情续页——证明 Schema 与管道没有过拟合到单一平台。

这是一款「诚实状态」的软件：下方平台矩阵标注的是**最近验证日期**，而非永久的 ✅，因为私有 API 会在没有通知的情况下变动。

## 支持的平台

| 平台 | 传输 | 认证 | 状态 | 最近验证 |
|---|---|---|---|---|
| **Kimi** (`kimi.com`) | ConnectRPC / JSON | `Authorization: Bearer`（localStorage JWT） | ✅ 可用（发行形态） | 2026-07 |
| **Gemini** (`gemini.google.com`) | `batchexecute` | Cookie + XSRF token | ✅ 可用（发行形态）¹ | 2026-07 |
| **Grok** (`grok.com`) | REST / JSON | Cookie（会话） | ✅ 可用（发行形态） | 2026-07 |
| **DeepSeek** (`chat.deepseek.com`) | REST / JSON | `Authorization: Bearer`（localStorage token） | ✅ 可用（发行形态） | 2026-07 |
| **ChatGPT** (`chatgpt.com`) | REST / JSON | `Authorization: Bearer`（`/api/auth/session` token） | ✅ 可用（发行形态） | 2026-07 |
| **腾讯元宝** (`yuanbao.tencent.com`) | REST / JSON（POST） | 仅 Cookie（`hy_token` + `uin`） | ✅ 可用 ² | 2026-11 |
| **腾讯混元 AI Studio** (`aistudio.tencent.com`) | REST / JSON（POST，跨域网关） | 仅 Cookie（`hunyuan_token` + `hy_token`） | ✅ 可用 ³ | 2026-11 |

¹ Gemini 对话详情每次请求拉取 100 轮；超过 100 轮的对话依赖“更旧轮次”续页 token，该 token 位置系从列表 RPC 的对称结构推断，尚待真实超长对话验证。

² 元宝没有 CSRF token（Cookie 即可授权两个端点），但它是本项目中风控最严的平台，**500ms 节流不可关闭**。两个已知缺口：生图结果不在详情响应里（只有提示词文本）、自建 AI 应用（自定义 agent）的会话不在列表枚举范围（仅默认元宝 agent）。

³ 混元的接口在独立域 `api.hunyuan.tencent.com`，由页面跨域带 Cookie 调用（站点自身 CORS 已放开）。列表是 offset/limit 分页、置顶会话单独放在 `pinnedData`；详情续页必须带 `lastId` 游标（最早一轮的 `chatRecordId`），该规则来自前端 bundle——短历史账号抓包无法体现。引用与文件块已做防御性映射，但尚未在真实混元会话中观测到。

想要其他平台？见[编写适配器](#编写适配器)。

## 安装与使用（Kimi、Gemini、Grok、DeepSeek、ChatGPT、腾讯元宝与腾讯混元）

v0.1 提供两种发行形态，功能完全一致（同一份页内代码 `@ace/app-core`）：**Tampermonkey 油猴脚本**和 **Chrome 扩展**。都无需配置 token，运行在你已登录的会话中，并按站点自动选择对应适配器。

### 形态一：油猴脚本

1. 在浏览器中安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 安装脚本，两种方式任选：
   - **一键安装（推荐）**：直接打开 [ai-chat-exporter.user.js](https://raw.githubusercontent.com/wanda1416/ai-chat-exporter/master/apps/userscript/dist/ai-chat-exporter.user.js)，Tampermonkey 会弹出安装页；仓库更新后脚本会自动升级。
   - **从源码构建**：
     ```bash
     pnpm install
     pnpm --filter @ace/userscript build
     ```
     产物会输出到 `apps/userscript/dist/ai-chat-exporter.user.js`，在浏览器中打开该文件（或把它拖进 Tampermonkey 面板）并确认安装。

### 形态二：Chrome 扩展（开发者模式加载，尚未上架商店）

1. 构建扩展：
   ```bash
   pnpm install
   pnpm --filter @ace/extension build
   ```
2. 打开 `chrome://extensions`，开启右上角“开发者模式”，点“加载已解压的扩展程序”，选择 `apps/extension/dist` 目录。
3. 扩展零权限申请（内容脚本跑在页面主世界，与油猴脚本运行环境完全等价）。

### 使用（两种形态相同）

1. 打开 [kimi.com](https://www.kimi.com/)、[gemini.google.com](https://gemini.google.com/)、[grok.com](https://grok.com/)、[chat.deepseek.com](https://chat.deepseek.com/)、[chatgpt.com](https://chatgpt.com/)、[yuanbao.tencent.com](https://yuanbao.tencent.com/) **或** [aistudio.tencent.com](https://aistudio.tencent.com/) 登录，点击右下角的 **“Export all chats”** 按钮。
2. 弹出的对话框可选择导出的对话区间（从 1 开始、含首尾，如 1–100；“to” 留空则导出全部），也可按需加载对话总数。
3. 会下载一个 `<platform>-export-YYYY-MM-DD.zip`，Markdown 与 JSON 分目录存放：
   ```
   kimi/            （或 gemini/、grok/、deepseek/、chatgpt/、yuanbao/、hunyuan/）
   ├── markdown/    每条对话一个 .md
   └── json/        每条对话一个 .json
   ```

请求做了节流（每次 500 ms），因此导出不会对平台造成压力。

## 交换格式

Schema（`@ace/schema`，以 Zod 作为唯一事实来源定义）是本项目的「标准」。核心实体：

```
Conversation  id, platform, title, createdAt?, updatedAt?, model?, messages[], attachments?
Message       id, role (user|assistant|system), content[], timestamp?, model?,
              reasoning? (思维链), citations?, attachments?,
              parentId? / childrenIds?  （分支/树——可选，用于 Kimi 这类平台）
ContentPart   text | code | table | image | file   （结构化块）
```

Zod schema 会生成一份发布用的 JSON Schema（`pnpm schema:json`），因此任何下游工具都能校验该格式，而无需依赖我们的代码。

## 架构

两段式管道——适配器直接吐出标准 Schema，**没有独立的 normalizer 层**（刻意比同类项目薄一层）。

```
平台适配器  →  标准 Schema (v1)  →  导出器
 Kimi / Gemini...   conversation.json    Markdown / JSON / ZIP
```

适配器契约很小：

```ts
interface PlatformAdapter {
  platform: string;
  detect(): boolean;                                    // 域名 / 页面信号
  listConversations(): AsyncIterable<ConversationMeta>; // 分页隐藏在迭代器之后
  fetchConversation(id: string): Promise<Conversation>; // 直接吐出标准 schema
}
```

### Monorepo 结构（TypeScript + pnpm workspaces）

```
packages/
  schema/              Zod 定义 + JSON Schema 导出（零依赖）
  core/                管道编排、Adapter/Exporter 契约、节流、命名
  adapter-kimi/        v0.1 参考适配器（干净的 JSON API）
  adapter-gemini/      第二个适配器（batchexecute）——证明 Schema 的通用性
  adapter-grok/        第三个适配器（仅 cookie 的 REST、树形消息）
  adapter-deepseek/    第四个适配器（Bearer REST、思维链 + 分支树）
  adapter-chatgpt/     第五个适配器（Bearer REST、含 system/tool/image 节点的 mapping 树）
  adapter-yuanbao/     第六个适配器（仅 Cookie 的 POST、带富文本块的轮次数组）
  adapter-hunyuan/     第七个适配器（跨域 Cookie 网关、lastId 游标详情续页）
  exporter-markdown/   每条对话一个可读的 .md
  exporter-json/       每条对话一个忠于 Schema 的 .json
  exporter-zip/        打包整批（fflate）
  app-core/            页内引导（按钮 + 区间对话框 + 导出流程），两个发行壳共用
apps/
  userscript/          发行形态 1：Tampermonkey 脚本（用 vite-plugin-monkey 构建）
  extension/           发行形态 2：Chrome 扩展（MV3，MAIN world 内容脚本，零权限）
docs/
  blueprint.md         设计蓝图 + 真实 API 发现 + 工程注意事项
```

## 开发

需要 Node ≥ 20 和 pnpm 9。

```bash
pnpm install          # 安装 workspace 依赖
pnpm typecheck        # 对每个包做类型检查
pnpm test             # 运行 vitest 套件（golden-fixture 快照测试）
pnpm schema:json      # 重新生成发布用的 JSON Schema
```

**可持续性建立在三根支柱之上**（同类项目为何停摆，以及我们如何避免）：

1. **Golden fixtures**——每个适配器都附带匿名化的真实 API 响应；vitest 对「样本 → 标准格式」的转换做快照，因此接口变动会被 CI 捕获，并通过更新 fixture + 解析器来修复。
2. **诚实的健康看板**——平台矩阵展示最近验证日期，并用 ⚠️ 标记失效。
3. **薄适配器约定**——每个适配器以 ≤300 行为目标，只做「端点 + 解析」。

## 编写适配器

在新的 `packages/adapter-<name>/` 中实现 `PlatformAdapter`，把平台的响应映射到 Schema v1，并附带匿名化 fixture 与一个快照测试。现有七个适配器是不同极端的范例：Kimi（干净的 JSON、树形消息、Bearer token）、Gemini（基于位置的 `batchexecute` 数组、线性回合、cookie 认证）、Grok（仅 cookie 的 REST、`parentResponseId` 消息树、逐条消息级 model）、DeepSeek（Bearer REST、单端点详情、`thinking_content` 思维链、以及保留全部分支的消息树——可见主线是从 `current_message_id` 沿父链上走出的活跃路径）与 ChatGPT（从 `/api/auth/session` 取 Bearer token、offset/limit 列表分页、以及一棵 `mapping` 树——可见主线从 `current_node` 走出，同时过滤掉 system/tool-call 脚手架，并保留 `tool` 节点上生成的图像）、腾讯元宝（仅 Cookie 的 POST 端点、列表走游标分页而详情走“反向 index 窗口”分页、轮次数组中的 `speechesV2[].content[]` 块承载文本 / `think` 思维链 / `searchGuid` 引用 / 文件附件）、腾讯混元（独立域名的跨域 Cookie 网关、offset/limit 列表且置顶会话单独成数组、详情续页需要 `lastId` 游标配最早一条的 `index`、思考块叫 `thought` 且正文放在 `msg` 里）。如果它在不触碰 `schema` 或 `core` 的前提下就能映射到同一份 Schema，说明设计站得住。

## 隐私与合规

- **只在你本地的浏览器中**运行，导出**你自己账号**的数据；不向任何服务器发送。
- 数据可携权是被认可的权利（GDPR 第 20 条，以及其他地区的对应条款）。
- 内置请求节流；不绕过付费墙，也不抓取他人内容。
- 采用 MIT 许可，按「原样」提供。

## 路线图

| 版本 | 范围 |
|---|---|
| **v0.1** | Schema v1 + Kimi、Gemini、Grok、DeepSeek、ChatGPT、腾讯元宝与腾讯混元适配器 + MD/JSON/ZIP 导出器 + 油猴脚本（区间对话框）+ Chrome 扩展 |
| **v0.1.2** | 可选附件下载（图片与上传文件）、流式 ZIP（`ZipSink`）、ChatGPT 附件通过 `/backend-api/files/{id}/download` 端点解析 |
| v0.2 | CLI 形态（增量备份）+ 另一个高需求平台 |
| v0.3 | 适配器指南 + fixture 匿名化工具 + CONTRIBUTING —— 开放社区适配器 |
| v0.4+ | Obsidian 导出器、更多平台、Chrome Web Store 上架 |

## 致谢

- [gandli/chat-export-toolkit](https://github.com/gandli/chat-export-toolkit) —— 适配器架构方向的启发（仅设计灵感，未复用代码）。
- [springrain1/kimi-pp](https://github.com/springrain1/kimi-pp) —— 其 Connect-frame 编解码对未来的流式解析是有用的参考。

## 许可

MIT

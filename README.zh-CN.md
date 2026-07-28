# AI Chat Exporter

[English](./README.md) · **简体中文**

> **本地优先、批量导出你的 AI 对话。** 一键把任意 AI 平台上的*全部*聊天记录导出为开放、可迁移的格式——数据始终不离开你的浏览器。

现有工具大多一次只能导出一条对话，且只产出 Markdown。本项目不一样：

1. **批量，而非逐条**——一次运行即可导出你的完整历史。
2. **开放的交换格式**——一份有文档的[对话 Schema](#交换格式)，而不仅是 Markdown。第三方工具（Obsidian 导入器、RAG 入库）可以依赖这个格式，而不必依赖我们。
3. **本地优先**——一切都在你自己的浏览器里、针对你自己的账号运行，不向任何第三方服务器发送数据。
4. **社区可维护的适配器**——每个平台适配器都很薄（端点 + 解析），并由 golden-file fixture 守护，因此接口变动只是一次小而可测的修复。

## 项目状态

**v0.1 —— alpha。** 核心管道、Schema v1 与 Kimi 适配器均已可用，并已针对真实账号做过端到端验证（一次完整管道运行把真实对话导出到磁盘，并经 SHA-256 逐字节校验）。第二个适配器（Gemini）用于证明 Schema 与管道没有过拟合到单一平台。

这是一款「诚实状态」的软件：下方平台矩阵标注的是**最近验证日期**，而非永久的 ✅，因为私有 API 会在没有通知的情况下变动。

## 支持的平台

| 平台 | 传输 | 认证 | 状态 | 最近验证 |
|---|---|---|---|---|
| **Kimi** (`kimi.com`) | ConnectRPC / JSON | `Authorization: Bearer`（localStorage JWT） | ✅ 可用（发行形态） | 2026-07 |
| **Gemini** (`gemini.google.com`) | `batchexecute` | Cookie + XSRF token | 🧪 适配器已验证（fixture + 测试） | 2026-07 |

想要其他平台？见[编写适配器](#编写适配器)。

## 安装与使用（Kimi）

v0.1 的发行形态是一个 **Tampermonkey 油猴脚本**——无需配置 token，运行在你已登录的会话中。

1. 在浏览器中安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 构建油猴脚本：
   ```bash
   pnpm install
   pnpm --filter @ace/userscript build
   ```
   产物会输出到 `apps/userscript/dist/@ace/userscript.user.js`。
3. 在浏览器中打开该 `.user.js` 文件（或把它拖进 Tampermonkey 面板）并确认安装。
4. 打开 [kimi.com](https://www.kimi.com/) 登录，点击右下角的 **“Export all chats”** 按钮。
5. 会下载一个 `kimi-export-YYYY-MM-DD.zip`，其中在 `kimi/` 目录下每条对话包含一个 `.md` 和一个 `.json`。

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
  exporter-markdown/   每条对话一个可读的 .md
  exporter-json/       每条对话一个忠于 Schema 的 .json
  exporter-zip/        打包整批（fflate）
apps/
  userscript/          发行形态：Tampermonkey 脚本（用 vite-plugin-monkey 构建）
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

在新的 `packages/adapter-<name>/` 中实现 `PlatformAdapter`，把平台的响应映射到 Schema v1，并附带匿名化 fixture 与一个快照测试。现有两个适配器是两个极端的范例：Kimi（干净的 JSON、树形消息、Bearer token）与 Gemini（基于位置的 `batchexecute` 数组、线性回合、cookie 认证）。如果它在不触碰 `schema` 或 `core` 的前提下就能映射到同一份 Schema，说明设计站得住。

## 隐私与合规

- **只在你本地的浏览器中**运行，导出**你自己账号**的数据；不向任何服务器发送。
- 数据可携权是被认可的权利（GDPR 第 20 条，以及其他地区的对应条款）。
- 内置请求节流；不绕过付费墙，也不抓取他人内容。
- 采用 MIT 许可，按「原样」提供。

## 路线图

| 版本 | 范围 |
|---|---|
| **v0.1** | Schema v1 + Kimi 适配器 + MD/JSON/ZIP 导出器 + 油猴脚本 |
| v0.2 | CLI 形态（增量备份）+ 第二个高需求平台 |
| v0.3 | 适配器指南 + fixture 匿名化工具 + CONTRIBUTING —— 开放社区适配器 |
| v0.4+ | 浏览器扩展形态、Obsidian 导出器、更多平台 |

## 致谢

- [gandli/chat-export-toolkit](https://github.com/gandli/chat-export-toolkit) —— 适配器架构方向的启发（仅设计灵感，未复用代码）。
- [springrain1/kimi-pp](https://github.com/springrain1/kimi-pp) —— 其 Connect-frame 编解码对未来的流式解析是有用的参考。

## 许可

MIT

# 新平台适配器开发指南 — 用 Chrome 动态调试抓取数据

> 本文沉淀 Kimi / Gemini 两个适配器的完整开发流程，供后续新平台适配（DeepSeek、ChatGPT、豆包……）参考。
> 核心方法论一句话：**先用登录态浏览器把真实 API 摸清、重放验证、脱敏成 fixtures，然后才写适配器代码**——反面教材见蓝图附录（凭想象写骨架的项目全部烂尾）。

配套阅读：[blueprint.md](./blueprint.md) 第 7–10 节是两次实战的原始记录，本文是从中提炼的可复用流程。

## 0. 全流程总览

```
阶段一 DevTools 手工侦察   → 找到列表/详情端点，看清协议形状
阶段二 认证方式判定        → Cookie？Bearer？页面 token？三选一或组合
阶段三 Console 重放验证    → 最小请求集重放成功（200 + 真实数据）才算摸清
阶段四 CDP 自动化实测      → 分页、边界、大规模数据用脚本批量验证
阶段五 fixtures 脱敏落地   → 真实响应 → 合成占位符 → vitest 快照测试
阶段六 适配器编写 + dogfood → client/parse/adapter 三件套，管道端到端实跑
```

铁律：**阶段三重放成功之前，不写一行适配器代码。**

## 1. 阶段一：DevTools 手工侦察

用日常 Chrome（自带登录态）打开目标平台，F12 → Network 面板：

1. 勾选 **Preserve log**，筛选 `Fetch/XHR`；
2. 做两个动作，各对应一个必找端点：
   - **翻侧边栏会话列表**（滚动触发翻页）→ 列表端点；
   - **点开一条历史会话** → 详情端点；
3. 对每个候选请求记录四件事：
   - 完整 URL（含 query 参数，注意哪些是会变的）；
   - 请求方法与 Content-Type（干净 JSON？表单编码？protobuf？）;
   - **Request Headers 里所有非标准头**（`authorization`、`x-*` 等）；
   - 响应体形状（右键 → Copy → Copy response 存下来）。

辨认技巧：

- 列表端点的响应里必然有会话 id 数组 + 分页游标（`nextPageToken` / offset / cursor 之类）；把详情端点响应里的正文文字与页面上看到的对话内容对照，确认没找错。
- 平台可能不是干净 JSON。Gemini 走 Google 内部 `batchexecute` 协议：URL 固定为 `/_/BardChatUi/data/batchexecute?rpcids=<id>&...`，真正区分调用的是 `rpcids` 参数；响应带 `)]}'` 反 JSON 前缀 + 长度行分块。遇到这类协议先在 Network 面板把一次调用的**请求体原文**（Payload → view source）完整存下来，后续解剖。
- 详情请求可能带**分页参数**（Gemini Web UI 每次只取 10 turns，滚动懒加载）。留意同一端点被连续调用时请求体里哪个参数在变——那就是页游标。

## 2. 阶段二：认证方式判定

这是适配器最关键的分叉点，直接决定客户端代码怎么写。已知两种典型形态：

| | Kimi 型（Bearer） | Gemini 型（Cookie + 页面 token） |
|---|---|---|
| 凭据在哪 | `localStorage.access_token`（JWT） | 登录态 Cookie（`SAPISID` 等）+ `window.WIZ_global_data` 里的 XSRF token |
| 请求怎么带 | `Authorization: Bearer <token>` 头 | `credentials: "include"` + token 进请求体（`at` 字段） |
| 失败表现 | 401 `REASON_INVALID_AUTH_TOKEN` | 400 或空数据 |

判定手法：

1. 看 Request Headers 有没有 `Authorization` 头 → 有则去 `localStorage` / `sessionStorage` 里搜这个值，确认来源；
2. 没有 Authorization → 大概率靠 Cookie；再看请求体/URL 里有没有一次性 token（XSRF），去页面全局变量里找：Console 输入 `window.` 逐层翻，或直接 `JSON.stringify(window.WIZ_global_data).includes("<token值>")` 这类方式反查 token 藏在哪个全局对象的哪个字段；
3. **最小化验证**：重放时把可疑的头逐个删掉，找出让请求仍然 200 的**最小头集合**。Kimi 最终只需要 `authorization` + `x-msh-platform: web` + `x-language` 三个头——最小集越小，适配器越不容易被平台小改动弄坏。

## 3. 阶段三：Console 重放验证

在目标平台页面的 DevTools Console 里，用 `fetch` 手工重放（同源，天然带 Cookie/可读 localStorage——这正是油猴脚本/MAIN world 内容脚本运行环境的等价模拟）：

```js
// Kimi 型示例：验证列表端点 + 最小头集合
const r = await fetch("https://www.kimi.com/apiv2/kimi.gateway.feed.v1.FeedService/ListFeeds", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${localStorage.getItem("access_token")}`,
    "x-msh-platform": "web",
    "x-language": "zh-CN",
  },
  body: JSON.stringify({ page_size: 20, filter_types: ["FEED_TYPE_CHAT", "FEED_TYPE_TASK"] }),
});
console.log(r.status, await r.json());
```

此阶段必须验证的清单：

- [ ] 列表端点 200 + 真实数据；
- [ ] 详情端点 200 + 真实数据（拿列表返回的真实 id 去请求）；
- [ ] **分页走通**：用第一页返回的游标请求第二页，确认数据衔接、末页游标为空（Kimi：空串即末页）；
- [ ] 改动请求参数试探容量上限（Gemini 详情页大小从 UI 默认的 10 调到 100 依然 200——导出场景应尽量放大单页，减少请求数）；
- [ ] 记录每个端点响应里的**时间戳格式**（ISO8601？`[秒,纳秒]` 数组？）和 **id 形态**（UUID？`c_` 前缀？）。

对位置数组类协议（无字段名），解剖办法是**对照法**：同一条对话在页面上肉眼可见（提问文字、回答文字、时间），在响应数组里逐层展开找到这些值的位置，记下路径（如 Gemini：用户文本在 `turn[2][0][0]`、候选数组在 `turn[3][0]`）。每个位置结论都要拿**第二条不同形状的会话**（长对话、带附件、多轮）复核，防止过拟合单一样本。

## 4. 阶段四：CDP 自动化实测

Console 手工重放适合摸清协议；要做**批量、分页、大规模**验证（比如全量翻页数一共多少条会话、把最近 20 条会话真实导出比对），改用 CDP 调试浏览器 + 脚本注入：

1. 带调试端口启动 Chrome（复用日常 profile 的登录态）：`chrome.exe --remote-debugging-port=9222`；
2. 用 CDP 客户端（本项目用 `agent-browser --cdp 9222 eval`）向页面注入 JS 执行；
3. 把编译好的管道代码（如 `tmp/dogfood.ts` 经 vite 打包成 IIFE）整体注入页面跑真实导出，结果挂在 `window` 上分步取回。

**工程坑清单（每条都实际踩过，见蓝图 §10）**：

- **大字符串返回会卡死**：eval 返回 >~100KB 的字符串会挂起。取数必须分块——内容先留在页面（`window.__FILES__`），按 ≤60KB 切片多次取回、本地拼接（参考 `tmp/pull-write.ps1`）。
- **控制台编码腐蚀 UTF-8**：中文 Windows 的 PowerShell 按 GBK 回显，会把 UTF-8 stdout 解码坏。**传输层全程 base64（纯 ASCII）**：页面内先 `TextEncoder` 编码再 base64（`btoa` 仅支持 Latin1，必须先转 UTF-8 字节），本地 `FromBase64String` 后 `WriteAllBytes` 直写。
- **传代码也用 base64**：`--stdin` 方式在 CRLF/BOM 下会失败，用 `eval -b <base64>` 传代码更稳。
- **eval 行为**：会自动 `await` 返回的 Promise；`window` 跨 eval 持久——可以分步在页面累积状态。
- **确定性校验，不靠肉眼**：落盘后页面内对每个文件算 SHA-256，与磁盘 `Get-FileHash` 逐一比对，match 数 = 文件数才算通过（控制台的 GBK 假乱码会误导肉眼判断）。
- **单次 eval 别跑太久**：实测全量 1602 条会话必须分批，长任务拆成多次注入。

## 5. 阶段五：fixtures 脱敏落地

拿到真实响应后，制作脱敏样本提交到 `fixtures/<platform>/`：

- **必须替换**：会话/消息 id（换成全零或递增占位符，如 `c_0000000000000001`）、正文内容（换成合成对话）、用户名/邮箱、附件签名 URL、一切 token；
- **必须原样保留**：JSON 的**结构形状**——字段名、嵌套层级、数组位置、时间戳格式、枚举值（`MESSAGE_STATUS_FINISHED` 这类）、分页游标的有无；
- **刻意保留坑**：如果实测发现了顺序/边界陷阱，fixture 要**故意做成带坑的样子**。例：Kimi `ListMessages` 逆序返回且同 turn 内答在问前，`fixtures/kimi/listMessages.json` 特意做成逆序样本，守护适配器的重排逻辑不被后人"顺手修好"。

每个 fixture 配 vitest 快照测试：`样本 → toConversation() → 标准 Schema` 的转换结果快照。平台改版时贡献者只需更新 fixture + 解析函数，CI 立即验证。

## 6. 阶段六：适配器编写与 dogfood

### 代码结构（薄适配器公约：≤300 行，只做"端点 + 解析"）

```
packages/adapter-<platform>/src/
├── types.ts     # 响应类型（Kimi 型）或 RPC id 常量 + Json 类型（Gemini 型）
├── client.ts    # 薄 HTTP 客户端：端点、最小头集合、认证解析、分页参数
├── parse.ts     # 响应 → 标准 Schema 的纯函数（快照测试的对象）
├── adapter.ts   # 实现 PlatformAdapter：detect / listConversations / fetchConversation
└── index.ts     # re-export
```

client 的两个惯例（两个适配器都遵守）：

- **凭据双通道**：构造参数显式传入优先，否则从运行环境自动解析（`localStorage` / `window.WIZ_global_data`）。这样同一个 client 既能在页面内零配置跑，也能在 Node/测试里显式喂 token；
- **fetch 可注入**（`fetchImpl` 参数），测试时不发真网络请求。

adapter 的惯例：

- `listConversations()` 返回 `AsyncIterable`，把分页游标循环封装在内部，调用方感知不到分页；
- `fetchConversation()` 直接产出标准 `Conversation`（没有中间 Normalizer 层）；
- **排序防御**：不信任平台返回顺序，导出前按时间戳稳定升序重排（Kimi 逆序坑、Gemini 详情页 newest-first 都靠这个兜住）；
- 平台没有的字段（引用、思维链、树形分支）**留空即可**，Schema 全部可选。

### 端到端 dogfood

单元测试全绿 ≠ 能用。发布前必须在登录态页面里实跑一次完整管道：

1. 写一个 dogfood 入口（参考 `tmp/dogfood.ts`）：真实 adapter + 真实导出器，但**限流 + 截断**（如只导前 3 条，`throttleMs: 300+`），结果挂 `window` 而不触发下载；
2. vite 打包成单文件 IIFE，经 CDP 注入页面执行；
3. 检查返回的结构化摘要：会话数、失败数、消息数、role 序列、content 类型分布、思维链/引用计数；
4. 抽查 `firstMarkdown` 全文，人工比对页面渲染——表格/代码块/思维链/引用是否保真；
5. 有长会话（100+ 消息）的账号务必挑一条长的测——顺序 bug、分页 bug 只在长会话上暴露。

## 7. 案例速查：两种极端形态的对照

| 维度 | Kimi（干净型） | Gemini（对抗型） |
|---|---|---|
| 传输 | ConnectRPC/JSON，字段名齐全 | `batchexecute` 位置数组 + `)]}'` 反 JSON 包裹 |
| 认证 | localStorage JWT → Bearer 头 | Cookie + 页面 XSRF token 进请求体 |
| 端点区分 | URL 路径（`服务/方法`） | 同一 URL，靠 `rpcids` 参数 |
| 分页 | `page_token` / `nextPageToken` | 内层 payload 位置参数 + `payload[1]` 游标 |
| 消息组织 | 树形（`parentId`） | 线性多轮 |
| 实测坑 | 逆序返回、同 turn 答在问前 | UI 默认每页仅 10 turns、详情不含标题 |

新平台大概率落在两者之间。摸清后先问自己：更像 Kimi 还是更像 Gemini？照着对应适配器抄结构即可。

## 8. 常见坑速查表

| 坑 | 症状 | 对策 |
|---|---|---|
| 凭想象写适配器 | 编译过、fixtures 过，线上全空 | 阶段三重放成功前不写代码 |
| 信任平台返回顺序 | 导出通篇倒序 / 答在问前 | 按时间戳稳定重排；fixture 固化逆序样本 |
| 只测短会话 | 长会话截断或乱序 | dogfood 必测 100+ 消息会话 + 分页续读 |
| UI 默认页大小照搬 | 长对话导出不全 | 试探放大单页容量（Gemini 10→100） |
| 单一样本解剖位置数组 | 换条会话解析崩 | 每个位置结论用第二条异形会话复核 |
| CDP 大字符串直接返回 | eval 卡死 | 数据留页面，≤60KB 分块取回 |
| PowerShell 直读中文 stdout | 乱码/文件名非法 | 传输层全程 base64，本地按字节落盘 |
| 肉眼验收落盘结果 | GBK 假乱码误判 | 页面内 SHA-256 vs 磁盘哈希逐一比对 |
| 脱敏时"顺手规整"结构 | 快照测试失去守护力 | 只换值不动形状，坑要原样保留 |

# AI Chat Exporter

**English** · [简体中文](./README.zh-CN.md)

> **Local-first, batch export for your AI conversations.** Take *all* your chats out of any AI platform, in one click, as an open, portable format — the data never leaves your browser.

Most existing tools export one conversation at a time and only produce Markdown. This project is different:

1. **Batch, not one-off** — export your entire history in a single run.
2. **An open interchange format** — a documented [conversation Schema](#the-interchange-format), not just Markdown. Third-party tools (Obsidian importers, RAG ingestion) can depend on the format, not on us.
3. **Local-first** — everything runs in your own browser against your own account. No data is sent to any third-party server.
4. **Community-maintainable adapters** — each platform adapter is thin (endpoints + parsing) and guarded by golden-file fixtures, so an API change is a small, testable fix.

## Status

**v0.1 — alpha.** The core pipeline, Schema v1, and both adapters (Kimi, Gemini) are working end-to-end in the shipping userscript, verified against live accounts (real conversations exported to disk; the Kimi run was byte-verified by SHA-256). The two platforms are deliberately opposite extremes — clean JSON vs. `batchexecute` positional arrays — proving the Schema and pipeline aren't overfit to one platform.

This is honest-status software: the platform matrix below marks a **last-verified date** rather than a permanent ✅, because private APIs change without notice.

## Supported platforms

| Platform | Transport | Auth | Status | Last verified |
|---|---|---|---|---|
| **Kimi** (`kimi.com`) | ConnectRPC / JSON | `Authorization: Bearer` (localStorage JWT) | ✅ Working (shipping form) | 2026-07 |
| **Gemini** (`gemini.google.com`) | `batchexecute` | Cookie + XSRF token | ✅ Working (shipping form) ¹ | 2026-07 |

¹ Gemini conversation detail is fetched 100 turns per request; for conversations beyond that, the older-turns continuation token is inferred from the list RPC's symmetry and still being validated against a live long chat.

Want another platform? See [Writing an adapter](#writing-an-adapter).

## Install & use (Kimi & Gemini)

v0.1 ships in two forms with identical behavior (same in-page code, `@ace/app-core`): a **Tampermonkey userscript** and a **Chrome extension**. Neither needs token setup — both run in your logged-in session and pick the right adapter per site.

### Form 1: userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser.
2. Install the script, either way works:
   - **One-click install (recommended)**: open [ai-chat-exporter.user.js](https://raw.githubusercontent.com/wanda1416/ai-chat-exporter/master/apps/userscript/dist/ai-chat-exporter.user.js) — Tampermonkey shows an install page; the script auto-updates when the repo does.
   - **Build from source**:
     ```bash
     pnpm install
     pnpm --filter @ace/userscript build
     ```
     The bundle is emitted to `apps/userscript/dist/ai-chat-exporter.user.js`; open that file in the browser (or drag it into the Tampermonkey dashboard) and confirm the install.

### Form 2: Chrome extension (load unpacked — not on the Web Store yet)

1. Build the extension:
   ```bash
   pnpm install
   pnpm --filter @ace/extension build
   ```
2. Open `chrome://extensions`, enable “Developer mode” (top right), click “Load unpacked” and pick the `apps/extension/dist` folder.
3. The extension requests zero permissions — its content script runs in the page's MAIN world, the exact environment the userscript runs in.

### Usage (same for both forms)

1. Go to [kimi.com](https://www.kimi.com/) **or** [gemini.google.com](https://gemini.google.com/), log in, and click the **“Export all chats”** button (bottom-right).
2. A dialog lets you pick the conversation range to export (1-based, inclusive — e.g. 1–100; leave “to” empty for everything) and optionally load the total conversation count.
3. A `<platform>-export-YYYY-MM-DD.zip` downloads, with Markdown and JSON kept in separate folders:
   ```
   kimi/            (or gemini/)
   ├── markdown/    one .md per conversation
   └── json/        one .json per conversation
   ```

Requests are throttled (500 ms each) so the export never puts pressure on the platform.

## The interchange format

The Schema (`@ace/schema`, defined with Zod as the single source of truth) is the project's "standard". Core entities:

```
Conversation  id, platform, title, createdAt?, updatedAt?, model?, messages[], attachments?
Message       id, role (user|assistant|system), content[], timestamp?, model?,
              reasoning? (chain-of-thought), citations?, attachments?,
              parentId? / childrenIds?  (branch/tree — optional, for platforms like Kimi)
ContentPart   text | code | table | image | file   (structured blocks)
```

The Zod schemas generate a published JSON Schema (`pnpm schema:json`), so any downstream tool can validate the format without depending on our code.

## Architecture

Two-stage pipeline — adapters emit the standard Schema directly, with **no separate normalizer layer** (deliberately one layer thinner than similar projects).

```
Platform Adapter  →  Standard Schema (v1)  →  Exporter
 Kimi / Gemini...     conversation.json        Markdown / JSON / ZIP
```

The adapter contract is small:

```ts
interface PlatformAdapter {
  platform: string;
  detect(): boolean;                                    // domain / page signals
  listConversations(): AsyncIterable<ConversationMeta>; // pagination hidden behind an iterator
  fetchConversation(id: string): Promise<Conversation>; // emits the standard schema directly
}
```

### Monorepo layout (TypeScript + pnpm workspaces)

```
packages/
  schema/              Zod definitions + JSON Schema export (zero deps)
  core/                Pipeline orchestration, Adapter/Exporter contracts, throttling, naming
  adapter-kimi/        v0.1 reference adapter (clean JSON API)
  adapter-gemini/      Second adapter (batchexecute) — proves Schema generality
  exporter-markdown/   Human-readable .md per conversation
  exporter-json/       Schema-faithful .json per conversation
  exporter-zip/        Bundles the batch (fflate)
  app-core/            In-page bootstrap (button + range dialog + export flow), shared by both shells
apps/
  userscript/          Shipping form 1: Tampermonkey script (built with vite-plugin-monkey)
  extension/           Shipping form 2: Chrome extension (MV3, MAIN-world content script, zero permissions)
docs/
  blueprint.md         Design blueprint + real API findings + engineering notes
```

## Development

Requires Node ≥ 20 and pnpm 9.

```bash
pnpm install          # install workspace deps
pnpm typecheck        # type-check every package
pnpm test             # run the vitest suite (golden-fixture snapshot tests)
pnpm schema:json      # regenerate the published JSON Schema
```

**Sustainability rests on three pillars** (why similar projects stall, and how we avoid it):

1. **Golden fixtures** — every adapter ships anonymized real API responses; vitest snapshots the "sample → standard format" conversion, so an API change is caught by CI and fixed by updating a fixture + parser.
2. **Honest health board** — the platform matrix shows last-verified dates and marks breakage with ⚠️.
3. **Thin-adapter pact** — each adapter targets ≤300 lines and does only "endpoints + parsing".

## Writing an adapter

Implement `PlatformAdapter` in a new `packages/adapter-<name>/`, mapping the platform's responses onto Schema v1, and add anonymized fixtures with a snapshot test. Both existing adapters are worked examples of opposite extremes: Kimi (clean JSON, tree-structured messages, Bearer token) and Gemini (positional `batchexecute` arrays, linear turns, cookie auth). If it maps to the same Schema without touching `schema` or `core`, the design is holding.

## Privacy & compliance

- Runs **only in your local browser**, exporting **your own account's** data; nothing is sent to any server.
- Data portability is a recognized right (GDPR Art. 20, and equivalent provisions elsewhere).
- Built-in request throttling; does not bypass paywalls or scrape others' content.
- MIT licensed, provided "AS IS".

## Roadmap

| Version | Scope |
|---|---|
| **v0.1** | Schema v1 + Kimi & Gemini adapters + MD/JSON/ZIP exporters + userscript (range dialog) + Chrome extension |
| v0.2 | CLI form (incremental backup) + a third high-demand platform |
| v0.3 | Adapter guide + fixture anonymizer + CONTRIBUTING — open community adapters |
| v0.4+ | Obsidian exporter, more platforms, Chrome Web Store listing |

## Acknowledgements

- [gandli/chat-export-toolkit](https://github.com/gandli/chat-export-toolkit) — for the adapter-architecture direction (design inspiration only; no code reused).
- [springrain1/kimi-pp](https://github.com/springrain1/kimi-pp) — its Connect-frame codec is a useful reference for future streaming parsing.

## License

MIT

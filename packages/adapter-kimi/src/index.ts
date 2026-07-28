/**
 * @ace/adapter-kimi — the v0.1 reference adapter for Kimi (www.kimi.com).
 * Parsing functions are exported separately so golden-fixture tests can cover
 * them without any network.
 */

export { KimiAdapter } from "./adapter.js";
export { KimiClient, type KimiClientOptions } from "./client.js";
export { PLATFORM, parseBlocks, parseFeeds, toConversation } from "./parse.js";
export type * from "./types.js";

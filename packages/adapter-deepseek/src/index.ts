/**
 * @ace/adapter-deepseek — platform adapter for DeepSeek (chat.deepseek.com).
 * Parsing functions are exported separately so golden-fixture tests can cover
 * them without any network.
 */

export { DeepSeekAdapter } from "./adapter.js";
export { DeepSeekClient, type DeepSeekClientOptions } from "./client.js";
export { hasMore, lastSeqId, parseConversationList, PLATFORM, toConversation } from "./parse.js";
export type * from "./types.js";

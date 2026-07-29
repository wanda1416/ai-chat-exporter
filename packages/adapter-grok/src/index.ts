/**
 * @ace/adapter-grok — platform adapter for Grok (grok.com).
 * Parsing functions are exported separately so golden-fixture tests can cover
 * them without any network.
 */

export { GrokAdapter } from "./adapter.js";
export { GrokClient, type GrokClientOptions } from "./client.js";
export { nextPageToken, parseConversationList, PLATFORM, toConversation } from "./parse.js";
export type * from "./types.js";

/**
 * @ace/adapter-chatgpt — platform adapter for ChatGPT (chatgpt.com).
 * Parsing functions are exported separately so golden-fixture tests can cover
 * them without any network.
 */

export { ChatGPTAdapter } from "./adapter.js";
export { ChatGPTClient, type ChatGPTClientOptions } from "./client.js";
export { nextOffset, parseConversationList, PLATFORM, toConversation } from "./parse.js";
export type * from "./types.js";

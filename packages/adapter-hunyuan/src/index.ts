/**
 * @ace/adapter-hunyuan — platform adapter for Tencent Hunyuan AI Studio
 * (aistudio.tencent.com). Parsing functions are exported separately so
 * golden-fixture tests can cover them without any network.
 */

export { HunyuanAdapter, type HunyuanAdapterOptions } from "./adapter.js";
export {
  HunyuanClient,
  type DetailParams,
  type HunyuanClientOptions,
} from "./client.js";
export {
  agentIdFromPath,
  conversationIdFromPath,
  DEFAULT_AGENT_ID,
  hasMorePages,
  orderedTurns,
  parseConversationList,
  PLATFORM,
  toConversation,
  toIsoTime,
  toMessage,
  toRole,
} from "./parse.js";
export type * from "./types.js";

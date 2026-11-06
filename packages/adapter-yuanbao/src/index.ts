/**
 * @ace/adapter-yuanbao — platform adapter for Tencent Yuanbao
 * (yuanbao.tencent.com). Parsing functions are exported separately so
 * golden-fixture tests can cover them without any network.
 */

export { YuanbaoAdapter, type YuanbaoAdapterOptions } from "./adapter.js";
export { YuanbaoClient, type YuanbaoClientOptions } from "./client.js";
export {
  agentIdFromPath,
  DEFAULT_AGENT_ID,
  nextListCursor,
  orderedTurns,
  parseConversationList,
  PLATFORM,
  toConversation,
  toIsoTime,
  toMessage,
} from "./parse.js";
export type * from "./types.js";

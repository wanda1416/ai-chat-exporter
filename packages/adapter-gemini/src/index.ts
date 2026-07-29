/**
 * @ace/adapter-gemini — a second reference adapter (gemini.google.com), added
 * to prove the schema + two-stage pipeline are not overfit to Kimi. Parsing
 * functions are exported separately so golden-fixture tests can cover them
 * without any network.
 */

export { GeminiAdapter } from "./adapter.js";
export { GeminiClient, type GeminiClientOptions } from "./client.js";
export {
  detailNextPageToken,
  detailTurns,
  extractRpcPayload,
  nextPageToken,
  parseConversationList,
  PLATFORM,
  toConversation,
  turnResponseId,
} from "./parse.js";
export type * from "./types.js";

/**
 * Raw shapes of the Gemini web (gemini.google.com) `batchexecute` RPCs.
 *
 * Gemini has no clean JSON API. The web app talks to
 *   POST https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=<id>...
 * with a form body `f.req=<envelope>&at=<xsrf token>` (cookie-authenticated),
 * and answers with an anti-JSON envelope:
 *
 *   )]}'
 *
 *   <chunk length>
 *   [["wrb.fr","<rpcid>","<inner payload, JSON-encoded as a string>",...]]
 *   ...
 *
 * The inner payload is a deeply nested, mostly-positional array (no field
 * names). These types therefore describe *positions*, not objects; the parser
 * (parse.ts) navigates them with defensive accessors. Verified against a live
 * capture on 2026-07 — see docs/blueprint.md §9.
 */

/** Loose JSON value — the batchexecute payloads are heterogeneous arrays. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Conversation-list RPC (sidebar history). */
export const RPC_LIST = "MaZiqc";
/** Conversation-detail RPC (all turns of one conversation). */
export const RPC_DETAIL = "hNvQHb";

/**
 * Decoded list payload: `[null, "<nextPageToken>", [item, item, ...]]`.
 * Each item is positional:
 *   item[0]  conversation id, e.g. "c_1976535415a9d081"
 *   item[1]  title
 *   item[5]  [createdSeconds, nanos]
 *   item[-1] response id, e.g. "rc_93be5edae4f35d7f"
 */
export type RawListPayload = Json;

/**
 * Decoded detail payload: `[[turn, turn, ...], null, null, []]`.
 * Each turn is positional:
 *   turn[0]  [conversationId, responseId]
 *   turn[2]  user prompt block; user text at turn[2][0][0], id at turn[2][4]
 *   turn[3]  candidates block:
 *              turn[3][0]      candidates array; candidate = [id, [markdown], ...]
 *              turn[3][3]      selected candidate id
 *              (model name is the trailing plain string, e.g. "3.6 Flash")
 *   turn[4]  [seconds, nanos] timestamp of the exchange
 */
export type RawDetailPayload = Json;

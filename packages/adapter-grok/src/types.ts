/**
 * Raw shapes of the Grok REST JSON responses (base: grok.com/rest/).
 *
 * Verified against a live capture on 2026-07 (see docs/blueprint.md §11) and
 * matched by the golden fixtures under fixtures/grok/. Auth is cookie-based —
 * every call must run in the logged-in grok.com origin. Fields are optional so
 * the parser tolerates absent data rather than trusting every key.
 */

/** A conversation summary as returned by the listing endpoint. */
export interface RawConversation {
  conversationId?: string;
  title?: string;
  starred?: boolean;
  createTime?: string;
  modifyTime?: string;
}

/**
 * GET /rest/app-chat/conversations response.
 * Pagination is a cursor: `nextPageToken` echoes the last conversationId and is
 * passed back as the `pageToken` query param. Empty/absent means the last page.
 */
export interface ListConversationsResponse {
  conversations?: RawConversation[];
  nextPageToken?: string;
  textSearchMatches?: unknown[];
}

/** A single node in the message tree (structure only, no content). */
export interface RawResponseNode {
  responseId?: string;
  /** "human" for the user, "ASSISTANT" for the model. */
  sender?: string;
  /** Parent node id; absent/empty on the root. */
  parentResponseId?: string;
}

/**
 * GET /rest/app-chat/conversations/{id}/response-node response: the ordered
 * tree skeleton. The array is chronological (root first).
 */
export interface ResponseNodeResponse {
  responseNodes?: RawResponseNode[];
  inflightResponses?: unknown[];
}

/** A web-search source attached to an assistant response. */
export interface RawWebSearchResult {
  url?: string;
  title?: string;
  preview?: string;
}

/** File asset metadata carrying a human name + size (paired with a message). */
export interface RawFileAsset {
  assetId?: string;
  mimeType?: string;
  name?: string;
  sizeBytes?: number | string;
  createTime?: string;
}

/** A fully-loaded response (one message's content + metadata). */
export interface RawResponse {
  responseId?: string;
  message?: string;
  sender?: string;
  createTime?: string;
  parentResponseId?: string;
  model?: string;
  webSearchResults?: RawWebSearchResult[];
  citedWebSearchResults?: RawWebSearchResult[];
  fileAttachmentAssetMetadata?: RawFileAsset[];
}

/**
 * POST /rest/app-chat/conversations/{id}/load-responses response.
 * NOTE: `responses` is NOT guaranteed to be in request order — the parser
 * reorders chronologically (see docs/blueprint.md §11).
 */
export interface LoadResponsesResponse {
  responses?: RawResponse[];
}

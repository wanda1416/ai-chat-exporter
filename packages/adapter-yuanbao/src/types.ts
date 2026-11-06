/**
 * Raw shapes of the Tencent Yuanbao (yuanbao.tencent.com) JSON APIs.
 *
 * Verified against a live capture on 2026-11 (see tools/yuanbao-capture.js for
 * the recorder used). Auth is cookie-based (`hy_token` + Tencent `uin` cookies):
 * every call must run in the logged-in yuanbao.tencent.com origin. Fields are
 * optional so the parser tolerates absent data instead of trusting every key.
 */

/** A conversation summary as returned by POST /api/user/agent/conversation/v3/list. */
export interface RawConversationSummary {
  id?: string;
  title?: string;
  /** Unix seconds. */
  firstRepliedAt?: number;
  /** Unix seconds; also the pagination cursor. */
  lastRepliedAt?: number;
  /** Model id of the last turn, e.g. "hunyuan_gpt_175B_0404". */
  chatModelId?: string;
  agentId?: string;
  /** Highest message index in the conversation (1-based). */
  maxIndex?: number;
}

/**
 * POST /api/user/agent/conversation/v3/list response.
 * Pagination is a descending cursor: pass the smallest `lastRepliedAt` of the
 * page just received as `last_replied_at` to get the next (older) page.
 */
export interface ListConversationsResponse {
  code?: number;
  message?: string;
  data?: {
    total_count?: number;
    timestamp?: number;
    etag?: string;
    list?: RawConversationSummary[];
  };
}

/** A cited web-search document inside a `searchGuid` content block. */
export interface RawDoc {
  index?: number;
  title?: string;
  url?: string;
  quote?: string;
  sourceName?: string;
  webSiteName?: string;
}

/**
 * One block inside `speechesV2[].content`. The observed `type` values are
 * `text` (msg), `think` (title + content), `searchGuid` (docs[]) and `txt`
 * (an uploaded/produced file with url + fileName). Unknown types are mapped to
 * text when they carry a string body, otherwise skipped.
 */
export interface RawContentBlock {
  type?: string;
  /** Body of `text` blocks. */
  msg?: string;
  /** Body of `think` blocks. */
  content?: string;
  /** Title of `think` / `searchGuid` blocks. */
  title?: string;
  /** Download URL of file-like blocks. */
  url?: string;
  fileName?: string;
  size?: number;
  mediaId?: string;
  docs?: RawDoc[] | null;
}

/** One assistant/user "speech" inside a conversation turn. */
export interface RawSpeech {
  traceID?: string;
  speechType?: string;
  chatModelId?: string;
  content?: RawContentBlock[];
}

/** One conversation turn: a single speaker's message at a given index. */
export interface RawConvTurn {
  id?: string;
  /** 1-based position in the thread; the API returns turns newest-first. */
  index?: number;
  /** "human" for the user, "ai" for the model. */
  speaker?: string;
  /** Unix seconds. */
  createTime?: number;
  speechesV2?: RawSpeech[];
  /** Files attached to this single turn, when any. */
  multiMediaInfo?: RawMediaInfo[] | null;
}

/** A file attached to a conversation or one of its turns. */
export interface RawMediaInfo {
  type?: string;
  url?: string;
  fileName?: string;
  size?: number;
  mediaId?: string;
}

/**
 * POST /api/user/agent/conversation/v1/detail response — the conversation
 * object itself (no envelope). `convs` is newest-first; `hasMore` means older
 * turns exist and can be fetched by passing the smallest returned `index` back
 * as `offset`.
 */
export interface ConversationDetailResponse {
  id?: string;
  title?: string;
  /** Unix seconds. */
  firstRepliedAt?: number;
  /** Unix seconds. */
  lastRepliedAt?: number;
  modelId?: string;
  agentId?: string;
  hasMore?: boolean;
  convs?: RawConvTurn[];
  multiMediaInfo?: RawMediaInfo[] | null;
}

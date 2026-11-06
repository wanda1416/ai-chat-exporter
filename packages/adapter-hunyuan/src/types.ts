/**
 * Raw shapes of the Tencent Hunyuan AI Studio APIs
 * (base: https://api.hunyuan.tencent.com/api/new-portal).
 *
 * Verified against a live capture on 2026-11 (aistudio.tencent.com, logged-in
 * account). Auth is cookie-based (`hunyuan_token` + `hy_token` + `hunyuan_user`
 * on the hunyuan.tencent.com domain): requests are cross-origin from
 * aistudio.tencent.com and allowed by CORS, so `credentials: "include"` from the
 * page context is enough — no CSRF token and no custom header is required.
 *
 * The payload shapes are close relatives of the Yuanbao ones (same backend
 * family), but the endpoint paths, paging contract and thinking-block tag differ
 * — hence a separate adapter rather than a shared parser.
 */

/** A conversation summary as returned by POST /chat/conversation/list. */
export interface RawConversation {
  id?: string;
  title?: string;
  /** Unix seconds. */
  createdAt?: number;
  /** Unix seconds. */
  updatedAt?: number;
  /** Model of the conversation, e.g. "hy4". Needed by the detail endpoint. */
  chatModelId?: string;
  /** Agent the conversation belongs to, e.g. "HunyuanDefault". */
  agentId?: string;
  /** "text" | "image" | "video" … (the listing can be filtered by it). */
  modelTag?: string;
  modelId?: number;
  status?: string;
  pinnedAt?: number;
}

/**
 * POST /chat/conversation/list response. Offset/limit pagination:
 * keep incrementing `offset` by the page size until `offset >= totalCount`
 * (or a page comes back empty). Pinned conversations arrive in a separate
 * array and are NOT part of `data`.
 */
export interface ListConversationsResponse {
  code?: number;
  msg?: string;
  totalCount?: number;
  data?: RawConversation[];
  pinnedTotalCount?: number;
  pinnedData?: RawConversation[];
}

/** A cited web document inside a search/reference block. */
export interface RawDoc {
  index?: number;
  title?: string;
  url?: string;
  quote?: string;
  sourceName?: string;
  webSiteName?: string;
}

/**
 * One block inside `speechesV2[].content`.
 *
 * Observed live: `text` ({msg}) and `thought` ({msg, title, cost}) — note that
 * Yuanbao names the latter `think` and puts the body in `content`, so both
 * spellings are accepted. `searchGuid` (docs[]) and file-like blocks are handled
 * defensively: they are the same shapes the sibling Yuanbao API emits, but no
 * live hunyuan conversation containing them has been observed yet.
 */
export interface RawContentBlock {
  type?: string;
  /** Body of `text` / `thought` blocks. */
  msg?: string;
  /** Body of `think` blocks in the sibling API. */
  content?: string;
  /** Title of reasoning / search blocks. */
  title?: string;
  url?: string;
  fileName?: string;
  size?: number;
  mediaId?: string;
  docs?: RawDoc[] | null;
}

/** One speech inside a conversation turn. */
export interface RawSpeech {
  traceID?: string;
  speechType?: string;
  chatModelId?: string;
  content?: RawContentBlock[];
}

/** One conversation turn: a single speaker's message at a given index. */
export interface RawConvTurn {
  id?: string;
  /** Identifies the turn for the `lastId` paging cursor. */
  chatRecordId?: string;
  conversationId?: string;
  /** 1-based position in the thread; the API returns turns newest-first. */
  index?: number;
  /** "human" for the user, "ai" for the model, "custom" for injected dividers. */
  speaker?: string;
  /** Unix seconds. */
  createTime?: number;
  speechesV2?: RawSpeech[];
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
 * POST /user/agent/conversation/v1/detail response — a bare object (no
 * envelope). `convs` is newest-first and `hasMore` means older turns exist.
 *
 * Paging (read from the web bundle's load-more call): send `offset` = smallest
 * index already loaded, `lastId` = that turn's `chatRecordId`, plus
 * `conversationId`, `chatModelId` and `agentId`.
 */
export interface ConversationDetailResponse {
  code?: number;
  id?: string;
  /** Usually empty — the listing carries the real title. */
  title?: string;
  /** Unix seconds. */
  firstRepliedAt?: number;
  lastRepliedAt?: number;
  hasMore?: boolean;
  convs?: RawConvTurn[];
  multiMediaInfo?: RawMediaInfo[] | null;
  modelId?: string;
  chatModelId?: string;
  isExpire?: boolean;
}

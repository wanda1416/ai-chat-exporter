/**
 * Raw shapes of the DeepSeek REST JSON responses (base: chat.deepseek.com/api/v0/).
 *
 * Verified against a live capture on 2026-07 (see docs/blueprint.md §12) and
 * matched by the golden fixtures under fixtures/deepseek/. Auth is a Bearer
 * token read from `localStorage.userToken` (a JSON `{ value }` blob). Fields
 * are optional so the parser tolerates absent data rather than trusting keys.
 */

/**
 * The uniform three-layer envelope wrapping every endpoint. `code === 0` and
 * `data.biz_code === 0` signal success; the payload lives in `data.biz_data`.
 */
export interface DeepSeekEnvelope<T> {
  code?: number;
  msg?: string;
  data?: {
    biz_code?: number;
    biz_msg?: string;
    biz_data?: T;
  };
}

/** A conversation summary (listing) / header (detail). */
export interface RawChatSession {
  id?: string;
  /** Monotonic sequence id; also the listing cursor (see FetchPageData). */
  seq_id?: number;
  title?: string;
  title_type?: string;
  /** Float epoch seconds. */
  updated_at?: number;
  /** Float epoch seconds. */
  inserted_at?: number;
  pinned?: boolean;
  /** Mode tier ("default" / "expert"), NOT a concrete model name. */
  model_type?: string;
  agent?: string;
  version?: number;
  /** message_id of the active branch leaf — used to reconstruct the visible path. */
  current_message_id?: number;
}

/**
 * GET /api/v0/chat_session/fetch_page?count=N[&before_seq_id=<seq>] biz_data.
 * Pagination is a cursor: pass the last session's `seq_id` back as
 * `before_seq_id`. `has_more:false` marks the last page.
 */
export interface FetchPageData {
  chat_sessions?: RawChatSession[];
  has_more?: boolean;
}

/** A web-search source attached to an assistant message. */
export interface RawSearchResult {
  url?: string;
  title?: string;
  snippet?: string;
  cite_index?: number;
  site_name?: string;
  published_at?: number | null;
}

/** An uploaded file paired with a message. */
export interface RawFile {
  id?: string;
  file_name?: string;
  file_size?: number;
  status?: string;
}

/**
 * A single chat message. Messages form a tree via `parent_id`; DeepSeek keeps
 * every branch (edits/regenerations), so the active path is walked from
 * `chat_session.current_message_id`.
 */
export interface RawMessage {
  message_id?: number;
  parent_id?: number | null;
  /** Per-message model; typically "" (mode lives on the session). */
  model?: string;
  /** "USER" for the user, "ASSISTANT" for the model. */
  role?: string;
  status?: string;
  content?: string;
  /** Chain-of-thought trace (assistant only), or null. */
  thinking_content?: string | null;
  thinking_elapsed_secs?: number | null;
  /** Float epoch seconds. */
  inserted_at?: number;
  files?: RawFile[];
  search_results?: RawSearchResult[] | null;
  search_status?: string | null;
}

/** GET /api/v0/chat/history_messages?chat_session_id={id} biz_data. */
export interface HistoryMessagesData {
  chat_session?: RawChatSession;
  chat_messages?: RawMessage[];
}

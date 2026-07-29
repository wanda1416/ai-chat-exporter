/**
 * Raw shapes of the ChatGPT REST JSON responses (base: chatgpt.com).
 *
 * Verified against a live capture on 2026-07 (see docs/blueprint.md §13).
 * Auth is a Bearer token read from `GET /api/auth/session` (`accessToken`).
 * Fields are optional so the parser tolerates absent data rather than
 * trusting keys.
 */

/** GET /api/auth/session — carries the Bearer token and the signed-in user. */
export interface SessionData {
  /** JWT used as `Authorization: Bearer <accessToken>` on backend-api calls. */
  accessToken?: string;
  user?: { id?: string; name?: string; email?: string };
  expires?: string;
}

/**
 * GET /backend-api/conversations?offset=N&limit=M&order=updated.
 * Pagination is offset/limit (not a cursor): advance `offset` by the page
 * size until `offset >= total` or a page returns no items.
 */
export interface ConversationsPage {
  items?: ConversationSummary[];
  total?: number;
  limit?: number;
  offset?: number;
}

/**
 * A conversation summary in the listing. Note: the listing's timestamps are
 * ISO 8601 strings, whereas the detail endpoint returns float epoch seconds.
 */
export interface ConversationSummary {
  id?: string;
  title?: string;
  /** ISO 8601 string in the listing. */
  create_time?: string | null;
  /** ISO 8601 string in the listing. */
  update_time?: string | null;
  is_archived?: boolean;
  is_starred?: boolean | null;
  current_node?: string | null;
}

/**
 * GET /backend-api/conversation/{id}. Messages form a tree in `mapping`
 * keyed by node id; `current_node` is the active leaf. The visible path runs
 * from `current_node` up the `parent` chain to the root, reversed.
 */
export interface ConversationDetail {
  title?: string;
  /** Float epoch seconds in the detail (differs from the listing). */
  create_time?: number | null;
  /** Float epoch seconds in the detail. */
  update_time?: number | null;
  current_node?: string;
  default_model_slug?: string;
  mapping?: Record<string, MappingNode>;
}

/** A node in the `mapping` tree: a message plus its parent/children links. */
export interface MappingNode {
  id?: string;
  message?: RawMessage | null;
  parent?: string | null;
  children?: string[];
}

/** Message author. `role` is one of system / user / assistant / tool. */
export interface MessageAuthor {
  role?: string;
  name?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * A structured content block within a `parts` array. Plain text turns are
 * strings; multimodal turns interleave strings with objects such as an
 * `image_asset_pointer` for a model-produced image.
 */
export interface ContentPartObject {
  content_type?: string;
  /** e.g. "sediment://file_..." for a generated image. */
  asset_pointer?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
}

/**
 * A message body. `content_type` selects the shape of `parts`:
 * - "text": `parts` is a string array.
 * - "multimodal_text": `parts` mixes strings and objects (images).
 * Other types (code / model_editable_context / thoughts …) are non-visible
 * and dropped by the parser.
 */
export interface MessageContent {
  content_type?: string;
  parts?: Array<string | ContentPartObject>;
}

/** An uploaded file attached to a user message. */
export interface RawAttachment {
  id?: string;
  name?: string;
  size?: number;
  mime_type?: string;
}

/** A web-search source group carried on an assistant message. */
export interface ContentReference {
  /** "grouped_webpages" holds real page sources in `items`. */
  type?: string;
  items?: RefItem[];
}

/** One cited web source inside a `grouped_webpages` reference. */
export interface RefItem {
  title?: string;
  url?: string;
  attribution?: string;
  pub_date?: string | null;
  snippet?: string;
}

/** Per-message metadata: model, citations, references, attachments. */
export interface MessageMetadata {
  /** When true the message is hidden from the visible transcript. */
  is_visually_hidden_from_conversation?: boolean;
  model_slug?: string;
  citations?: unknown[];
  content_references?: ContentReference[];
  attachments?: RawAttachment[];
}

/**
 * A single chat message. `recipient === "all"` marks a turn shown to the
 * user; tool calls carry other recipients. Messages form a tree via the
 * `mapping` node's `parent`/`children` links, not on the message itself.
 */
export interface RawMessage {
  id?: string;
  author?: MessageAuthor;
  /** Float epoch seconds, or null. */
  create_time?: number | null;
  content?: MessageContent;
  status?: string;
  end_turn?: boolean | null;
  /** "all" for a visible turn; other values are tool routing. */
  recipient?: string;
  metadata?: MessageMetadata;
}

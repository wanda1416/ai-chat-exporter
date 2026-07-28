/**
 * Raw shapes of the Kimi ConnectRPC JSON responses (base: www.kimi.com/apiv2/).
 *
 * These were verified against a live capture on 2026-07 (see docs/blueprint.md
 * §8) and match the golden fixtures under fixtures/kimi/. Fields are optional
 * so the parser tolerates absent data rather than trusting every key.
 */

export interface RawChat {
  id?: string;
  name?: string;
  messageContent?: string;
  createTime?: string;
  updateTime?: string;
  status?: string;
}

/** FeedService/ListFeeds response. Pagination uses `nextPageToken`. */
export interface ListFeedsResponse {
  items?: Array<{ type?: string; chat?: RawChat }>;
  nextPageToken?: string;
}

export interface RawFile {
  meta?: {
    name?: string;
    contentType?: string;
    sizeBytes?: number | string;
    checksum?: string;
  };
  blob?: { signUrl?: string };
}

/** ChatService/GetChat response: the chat wrapped under `chat`, plus files. */
export interface GetChatResponse {
  chat?: RawChat;
  files?: RawFile[];
}

/**
 * A content block. Carries block-level metadata plus exactly one content
 * field (oneof): text | think | tool | multiStage | stage.
 */
export interface RawBlock {
  id?: string;
  parentId?: string;
  messageId?: string;
  createTime?: string;
  text?: { content?: string };
  think?: { content?: string; summary?: string };
  tool?: { toolCallId?: string; name?: string; status?: string };
  multiStage?: unknown;
  stage?: unknown;
}

/** A web-search / citation reference attached at the message level. */
export interface RawReference {
  matchedText?: string;
  type?: string;
  items?: Array<{
    search?: {
      id?: string;
      base?: { title?: string; url?: string; snippet?: string; siteName?: string };
    };
  }>;
}

export interface RawMessage {
  id?: string;
  parentId?: string;
  role?: string;
  status?: string;
  scenario?: string;
  createTime?: string;
  isGoal?: boolean;
  blocks?: RawBlock[];
  references?: RawReference[];
}

/** ChatService/ListMessages response: the full message tree. */
export interface ListMessagesResponse {
  messages?: RawMessage[];
  nextPageToken?: string;
}

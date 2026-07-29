import type {
  Attachment,
  Citation,
  Conversation,
  ConversationMeta,
  Message,
  Reasoning,
  Role,
} from "@ace/schema";
import type {
  FetchPageData,
  HistoryMessagesData,
  RawChatSession,
  RawFile,
  RawMessage,
  RawSearchResult,
} from "./types.js";

export const PLATFORM = "deepseek";

/** DeepSeek roles: "ASSISTANT" → assistant, "SYSTEM" → system, else user. */
function toRole(role: string | undefined): Role {
  const r = (role ?? "").toLowerCase();
  if (r === "assistant") return "assistant";
  if (r === "system") return "system";
  return "user";
}

/** Converts DeepSeek's float epoch seconds into an ISO 8601 string. */
function toIso(seconds: number | undefined): string | undefined {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return undefined;
  return new Date(Math.round(seconds * 1000)).toISOString();
}

/** Flattens DeepSeek search results into standard citations (deduped by url). */
function parseCitations(results: RawSearchResult[] | null | undefined): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const result of results ?? []) {
    const key = result.url ?? result.title ?? "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const citation: Citation = {};
    if (result.title) citation.title = result.title;
    if (result.url) citation.url = result.url;
    if (result.snippet) citation.snippet = result.snippet;
    citations.push(citation);
  }
  return citations;
}

/** Maps a message's uploaded files into standard attachments. */
function parseAttachments(files: RawFile[] | undefined): Attachment[] {
  const attachments: Attachment[] = [];
  for (const [index, file] of (files ?? []).entries()) {
    const attachment: Attachment = { id: file.id || file.file_name || `file-${index}` };
    if (file.file_name) attachment.name = file.file_name;
    if (typeof file.file_size === "number" && Number.isFinite(file.file_size)) {
      attachment.sizeBytes = file.file_size;
    }
    attachments.push(attachment);
  }
  return attachments;
}

function parseMessage(raw: RawMessage): { message: Message; attachments: Attachment[] } {
  const id = String(raw.message_id ?? "");
  const message: Message = {
    id,
    role: toRole(raw.role),
    content: raw.content ? [{ type: "text", text: raw.content }] : [],
  };

  const timestamp = toIso(raw.inserted_at);
  if (timestamp) message.timestamp = timestamp;
  if (raw.model && message.role === "assistant") message.model = raw.model;

  if (raw.thinking_content) {
    const reasoning: Reasoning = { content: raw.thinking_content };
    if (typeof raw.thinking_elapsed_secs === "number" && raw.thinking_elapsed_secs > 0) {
      reasoning.summary = `Thought for ${Math.round(raw.thinking_elapsed_secs)}s`;
    }
    message.reasoning = reasoning;
  }

  const citations = parseCitations(raw.search_results);
  if (citations.length) message.citations = citations;

  const attachments = parseAttachments(raw.files);
  if (attachments.length) message.attachments = attachments.map((a) => a.id);

  // parent_id is null on the root; leave parentId unset when the key is absent.
  if (raw.parent_id !== undefined) {
    message.parentId = raw.parent_id === null ? null : String(raw.parent_id);
  }

  return { message, attachments };
}

/**
 * Reconstructs the active (visible) message path from the branch leaf.
 *
 * DeepSeek keeps every edit/regenerate branch in `chat_messages`; the path the
 * user sees runs from `current_message_id` up the `parent_id` chain. We walk
 * that chain and reverse it (oldest-first). If the leaf is missing we fall
 * back to every message ordered by `message_id`.
 */
function activePath(messages: RawMessage[], currentId: number | undefined): RawMessage[] {
  const byId = new Map<number, RawMessage>();
  for (const m of messages) {
    if (typeof m.message_id === "number") byId.set(m.message_id, m);
  }

  if (currentId !== undefined && byId.has(currentId)) {
    const chain: RawMessage[] = [];
    const guard = new Set<number>();
    let cursor: number | null | undefined = currentId;
    while (typeof cursor === "number" && byId.has(cursor) && !guard.has(cursor)) {
      guard.add(cursor);
      const node: RawMessage = byId.get(cursor)!;
      chain.push(node);
      cursor = node.parent_id ?? null;
    }
    return chain.reverse();
  }

  return [...messages].sort((a, b) => (a.message_id ?? 0) - (b.message_id ?? 0));
}

/** Derives each message's `childrenIds` from the `parentId` links. */
function linkChildren(messages: Message[]): void {
  const childrenOf = new Map<string, string[]>();
  for (const m of messages) {
    if (m.parentId) {
      const list = childrenOf.get(m.parentId) ?? [];
      list.push(m.id);
      childrenOf.set(m.parentId, list);
    }
  }
  for (const m of messages) {
    const children = childrenOf.get(m.id);
    if (children?.length) m.childrenIds = children;
  }
}

/** Maps a listing page into standard listing entries. */
export function parseConversationList(data: FetchPageData): ConversationMeta[] {
  const metas: ConversationMeta[] = [];
  for (const session of data.chat_sessions ?? []) {
    if (!session.id) continue;
    const meta: ConversationMeta = {
      id: session.id,
      platform: PLATFORM,
      title: session.title ?? "",
    };
    const createdAt = toIso(session.inserted_at);
    const updatedAt = toIso(session.updated_at);
    if (createdAt) meta.createdAt = createdAt;
    if (updatedAt) meta.updatedAt = updatedAt;
    metas.push(meta);
  }
  return metas;
}

/** Whether another listing page exists after this one. */
export function hasMore(data: FetchPageData): boolean {
  return Boolean(data.has_more);
}

/** The cursor (`before_seq_id`) for the next page: the last session's seq_id. */
export function lastSeqId(data: FetchPageData): number | undefined {
  const sessions = data.chat_sessions;
  if (!sessions?.length) return undefined;
  return sessions[sessions.length - 1]?.seq_id;
}

/**
 * Assembles the standard Conversation from a history_messages payload.
 *
 * Only the active branch (from `current_message_id`) is emitted, matching what
 * the user sees. The session header carries the title/timestamps; when the
 * title is absent we fall back to the first user prompt. Timestamps are float
 * epoch seconds, converted to ISO.
 */
export function toConversation(
  conversationId: string,
  data: HistoryMessagesData,
  meta?: { title?: string; createdAt?: string; updatedAt?: string },
): Conversation {
  const session: RawChatSession = data.chat_session ?? {};
  const ordered = activePath(data.chat_messages ?? [], session.current_message_id);

  const messages: Message[] = [];
  const attachments: Attachment[] = [];
  const seenAttachment = new Set<string>();
  for (const raw of ordered) {
    const parsed = parseMessage(raw);
    messages.push(parsed.message);
    for (const att of parsed.attachments) {
      if (seenAttachment.has(att.id)) continue;
      seenAttachment.add(att.id);
      attachments.push(att);
    }
  }

  linkChildren(messages);

  const firstUserPart = messages
    .find((m) => m.role === "user")
    ?.content.find((c) => c.type === "text");
  const fallbackTitle = firstUserPart?.type === "text" ? firstUserPart.text : "";

  const conversation: Conversation = {
    schemaVersion: "1",
    id: conversationId,
    platform: PLATFORM,
    title: session.title || meta?.title || fallbackTitle,
    messages,
  };

  const createdAt = meta?.createdAt ?? toIso(session.inserted_at);
  const updatedAt = meta?.updatedAt ?? toIso(session.updated_at);
  if (createdAt) conversation.createdAt = createdAt;
  if (updatedAt) conversation.updatedAt = updatedAt;
  if (attachments.length) conversation.attachments = attachments;
  conversation.sourceUrl = `https://chat.deepseek.com/a/chat/s/${conversationId}`;
  return conversation;
}

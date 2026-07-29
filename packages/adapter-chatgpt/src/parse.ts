import type {
  Attachment,
  Citation,
  Conversation,
  ConversationMeta,
  ContentPart,
  Message,
  Role,
} from "@ace/schema";
import type {
  ContentPartObject,
  ContentReference,
  ConversationDetail,
  ConversationsPage,
  MappingNode,
  MessageContent,
  MessageMetadata,
  RawAttachment,
  RawMessage,
} from "./types.js";

export const PLATFORM = "chatgpt";

/** Content types shown to the user; everything else is tool/system scaffolding. */
const VISIBLE_CONTENT_TYPES = new Set(["text", "multimodal_text"]);

/**
 * ChatGPT roles: assistant / system pass through; `tool` (e.g. the image
 * generator) surfaces user-visible output, so it maps to assistant; anything
 * else → user.
 */
function toRole(role: string | undefined): Role {
  if (role === "assistant" || role === "tool") return "assistant";
  if (role === "system") return "system";
  return "user";
}

/**
 * Normalises a timestamp to ISO 8601. The detail endpoint uses float epoch
 * seconds; the listing uses ISO strings — this accepts either.
 */
function toIso(value: number | string | null | undefined): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Math.round(value * 1000)).toISOString();
  }
  if (typeof value === "string" && value) {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  return undefined;
}

/**
 * Whether a message is part of the visible transcript. Keeps user, assistant,
 * and tool turns (a `tool` node carries generated images shown to the user),
 * and excludes tool-call routing (`recipient !== "all"`), hidden nodes, and
 * non-text content types (code / model_editable_context / thoughts …). Hidden
 * tool status messages are dropped by the `is_visually_hidden` check.
 */
function isVisible(raw: RawMessage): boolean {
  const role = raw.author?.role;
  if (role !== "user" && role !== "assistant" && role !== "tool") return false;
  if (raw.recipient && raw.recipient !== "all") return false;
  if (raw.metadata?.is_visually_hidden_from_conversation) return false;
  const contentType = raw.content?.content_type;
  return Boolean(contentType && VISIBLE_CONTENT_TYPES.has(contentType));
}

/** A model-produced image part, registered as a conversation attachment. */
function imageAttachment(part: ContentPartObject): Attachment {
  const attachment: Attachment = { id: part.asset_pointer! };
  if (typeof part.size_bytes === "number" && Number.isFinite(part.size_bytes)) {
    attachment.sizeBytes = part.size_bytes;
  }
  return attachment;
}

/**
 * Maps a message body into structured content parts. Strings become text
 * parts; `image_asset_pointer` objects become image parts and register a
 * conversation attachment. Returns [] when nothing visible remains.
 */
function parseContent(
  content: MessageContent | undefined,
  attachments: Attachment[],
  seen: Set<string>,
): ContentPart[] {
  const parts: ContentPart[] = [];
  for (const part of content?.parts ?? []) {
    if (typeof part === "string") {
      if (part.trim()) parts.push({ type: "text", text: part });
      continue;
    }
    if (part?.content_type === "image_asset_pointer" && part.asset_pointer) {
      const id = part.asset_pointer;
      if (!seen.has(id)) {
        seen.add(id);
        attachments.push(imageAttachment(part));
      }
      parts.push({ type: "image", attachmentId: id });
    }
  }
  return parts;
}

/**
 * Flattens `grouped_webpages` references into standard citations (deduped by
 * url). ChatGPT's `metadata.citations` is usually empty; the real sources live
 * in `content_references`.
 */
function parseCitations(refs: ContentReference[] | undefined): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const ref of refs ?? []) {
    if (ref.type !== "grouped_webpages") continue;
    for (const item of ref.items ?? []) {
      const key = item.url ?? item.title ?? "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const citation: Citation = {};
      if (item.title) citation.title = item.title;
      if (item.url) citation.url = item.url;
      if (item.snippet) citation.snippet = item.snippet;
      citations.push(citation);
    }
  }
  return citations;
}

/** Registers uploaded files as conversation attachments; returns their ids. */
function parseAttachments(
  raw: RawAttachment[] | undefined,
  attachments: Attachment[],
  seen: Set<string>,
): string[] {
  const ids: string[] = [];
  for (const [index, file] of (raw ?? []).entries()) {
    const id = file.id || file.name || `attachment-${index}`;
    ids.push(id);
    if (seen.has(id)) continue;
    seen.add(id);
    const attachment: Attachment = { id };
    if (file.name) attachment.name = file.name;
    if (typeof file.size === "number" && Number.isFinite(file.size)) {
      attachment.sizeBytes = file.size;
    }
    if (file.mime_type) attachment.mimeType = file.mime_type;
    attachments.push(attachment);
  }
  return ids;
}

/** Builds a standard message, or null when it carries no visible content. */
function parseMessage(
  raw: RawMessage,
  attachments: Attachment[],
  seen: Set<string>,
): Message | null {
  const content = parseContent(raw.content, attachments, seen);
  if (!content.length) return null;

  const message: Message = {
    id: String(raw.id ?? ""),
    role: toRole(raw.author?.role),
    content,
  };

  const timestamp = toIso(raw.create_time);
  if (timestamp) message.timestamp = timestamp;

  const metadata: MessageMetadata = raw.metadata ?? {};
  if (metadata.model_slug && message.role === "assistant") {
    message.model = metadata.model_slug;
  }

  const citations = parseCitations(metadata.content_references);
  if (citations.length) message.citations = citations;

  const attachmentIds = parseAttachments(metadata.attachments, attachments, seen);
  if (attachmentIds.length) message.attachments = attachmentIds;

  return message;
}

/**
 * Reconstructs the visible message path from the active leaf.
 *
 * ChatGPT stores every edit/regenerate branch in `mapping`; the path the user
 * sees runs from `current_node` up the `parent` chain to the root. We walk
 * that chain, reverse it (oldest-first), and keep the message nodes. When the
 * leaf is missing we fall back to every node ordered by `create_time`.
 */
function activePath(
  mapping: Record<string, MappingNode>,
  currentNode: string | undefined,
): RawMessage[] {
  if (currentNode && mapping[currentNode]) {
    const chain: RawMessage[] = [];
    const guard = new Set<string>();
    let cursor: string | null | undefined = currentNode;
    while (typeof cursor === "string" && mapping[cursor] && !guard.has(cursor)) {
      guard.add(cursor);
      const node: MappingNode = mapping[cursor]!;
      if (node.message) chain.push(node.message);
      cursor = node.parent ?? null;
    }
    return chain.reverse();
  }

  return Object.values(mapping)
    .map((node) => node.message)
    .filter((message): message is RawMessage => Boolean(message))
    .sort((a, b) => (a.create_time ?? 0) - (b.create_time ?? 0));
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

/** Maps a listing page into standard listing entries (ISO timestamps). */
export function parseConversationList(page: ConversationsPage): ConversationMeta[] {
  const metas: ConversationMeta[] = [];
  for (const item of page.items ?? []) {
    if (!item.id) continue;
    const meta: ConversationMeta = {
      id: item.id,
      platform: PLATFORM,
      title: item.title ?? "",
    };
    const createdAt = toIso(item.create_time);
    const updatedAt = toIso(item.update_time);
    if (createdAt) meta.createdAt = createdAt;
    if (updatedAt) meta.updatedAt = updatedAt;
    metas.push(meta);
  }
  return metas;
}

/**
 * The offset for the next listing page, or undefined when the listing is
 * exhausted. Pagination is offset/limit: advance by the items returned until
 * we reach `total` or a page comes back empty.
 */
export function nextOffset(page: ConversationsPage): number | undefined {
  const items = page.items ?? [];
  if (!items.length) return undefined;
  const next = (page.offset ?? 0) + items.length;
  const total = page.total ?? 0;
  if (total && next >= total) return undefined;
  return next;
}

/**
 * Assembles the standard Conversation from a conversation detail payload.
 *
 * Only the active branch (from `current_node`) is emitted, and within it only
 * visible turns (user/assistant, recipient "all", text/multimodal). Because
 * hidden system/tool nodes sit between visible turns, the parent links are
 * re-derived linearly along the surviving path rather than copied from the
 * raw tree. Timestamps come from float epoch seconds; the title falls back to
 * the listing meta and then the first user prompt.
 */
export function toConversation(
  conversationId: string,
  detail: ConversationDetail,
  meta?: { title?: string; createdAt?: string; updatedAt?: string },
): Conversation {
  const mapping = detail.mapping ?? {};
  const ordered = activePath(mapping, detail.current_node);

  const messages: Message[] = [];
  const attachments: Attachment[] = [];
  const seenAttachment = new Set<string>();
  for (const raw of ordered) {
    if (!isVisible(raw)) continue;
    const message = parseMessage(raw, attachments, seenAttachment);
    if (message) messages.push(message);
  }

  // The visible path is linear, so link each message to its predecessor.
  messages.forEach((message, index) => {
    message.parentId = index === 0 ? null : messages[index - 1]!.id;
  });
  linkChildren(messages);

  const firstUserPart = messages
    .find((m) => m.role === "user")
    ?.content.find((c) => c.type === "text");
  const fallbackTitle = firstUserPart?.type === "text" ? firstUserPart.text : "";

  const conversation: Conversation = {
    schemaVersion: "1",
    id: conversationId,
    platform: PLATFORM,
    title: detail.title || meta?.title || fallbackTitle,
    messages,
  };

  if (detail.default_model_slug) conversation.model = detail.default_model_slug;

  const createdAt = meta?.createdAt ?? toIso(detail.create_time);
  const updatedAt = meta?.updatedAt ?? toIso(detail.update_time);
  if (createdAt) conversation.createdAt = createdAt;
  if (updatedAt) conversation.updatedAt = updatedAt;
  if (attachments.length) conversation.attachments = attachments;
  conversation.sourceUrl = `https://chatgpt.com/c/${conversationId}`;
  return conversation;
}

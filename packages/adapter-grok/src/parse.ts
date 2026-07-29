import type {
  Attachment,
  Citation,
  Conversation,
  ConversationMeta,
  Message,
  Role,
} from "@ace/schema";
import type {
  ListConversationsResponse,
  LoadResponsesResponse,
  RawFileAsset,
  RawResponse,
  RawWebSearchResult,
  ResponseNodeResponse,
} from "./types.js";

export const PLATFORM = "grok";

/** Grok senders: "human" → user, "ASSISTANT" → assistant. */
function toRole(sender: string | undefined): Role {
  return (sender ?? "").toLowerCase() === "assistant" ? "assistant" : "user";
}

/** Flattens Grok web-search results into standard citations (deduped by url). */
function parseCitations(results: RawWebSearchResult[] | undefined): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const result of results ?? []) {
    const key = result.url ?? result.title ?? "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const citation: Citation = {};
    if (result.title) citation.title = result.title;
    if (result.url) citation.url = result.url;
    if (result.preview) citation.snippet = result.preview;
    citations.push(citation);
  }
  return citations;
}

/** Maps a response's file assets into standard attachments. */
function parseAttachments(assets: RawFileAsset[] | undefined): Attachment[] {
  const attachments: Attachment[] = [];
  for (const [index, asset] of (assets ?? []).entries()) {
    const size = typeof asset.sizeBytes === "string" ? Number(asset.sizeBytes) : asset.sizeBytes;
    const attachment: Attachment = { id: asset.assetId || asset.name || `file-${index}` };
    if (asset.name) attachment.name = asset.name;
    if (asset.mimeType) attachment.mimeType = asset.mimeType;
    if (typeof size === "number" && Number.isFinite(size)) attachment.sizeBytes = size;
    attachments.push(attachment);
  }
  return attachments;
}

function parseResponse(raw: RawResponse): { message: Message; attachments: Attachment[] } {
  const id = raw.responseId ?? "";
  const message: Message = {
    id,
    role: toRole(raw.sender),
    content: raw.message ? [{ type: "text", text: raw.message }] : [],
  };
  if (raw.createTime) message.timestamp = raw.createTime;
  if (raw.model && message.role === "assistant") message.model = raw.model;

  const citations = parseCitations(raw.citedWebSearchResults?.length ? raw.citedWebSearchResults : raw.webSearchResults);
  if (citations.length) message.citations = citations;

  const attachments = parseAttachments(raw.fileAttachmentAssetMetadata);
  if (attachments.length) message.attachments = attachments.map((a) => a.id);

  if (raw.parentResponseId !== undefined) message.parentId = raw.parentResponseId || null;

  return { message, attachments };
}

/**
 * Reorders messages chronologically (oldest-first) by `timestamp`.
 *
 * Grok's load-responses does NOT return responses in request order, so the raw
 * array can read out of sequence. Sort by createTime; ties and missing
 * timestamps fall back to the original (stable) order.
 */
function sortChronologically(messages: Message[]): void {
  const originalIndex = new Map<Message, number>();
  messages.forEach((m, i) => originalIndex.set(m, i));
  messages.sort((a, b) => {
    const ta = a.timestamp ?? "";
    const tb = b.timestamp ?? "";
    if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
    return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
  });
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
export function parseConversationList(response: ListConversationsResponse): ConversationMeta[] {
  const metas: ConversationMeta[] = [];
  for (const conv of response.conversations ?? []) {
    if (!conv.conversationId) continue;
    const meta: ConversationMeta = {
      id: conv.conversationId,
      platform: PLATFORM,
      title: conv.title ?? "",
    };
    if (conv.createTime) meta.createdAt = conv.createTime;
    if (conv.modifyTime) meta.updatedAt = conv.modifyTime;
    metas.push(meta);
  }
  return metas;
}

/** The cursor for the next listing page, or undefined on the last page. */
export function nextPageToken(response: ListConversationsResponse): string | undefined {
  return response.nextPageToken || undefined;
}

/**
 * Assembles the standard Conversation from a response-node skeleton plus its
 * loaded response contents.
 *
 * `nodes` fixes the intended chronological order (root first); `loaded`
 * supplies the content but may be unordered — so we index loaded responses by
 * id, walk them in node order, then sort by timestamp as a safety net.
 * `title` is carried in from the listing (the detail endpoints omit it); when
 * absent we fall back to the first user prompt.
 */
export function toConversation(
  conversationId: string,
  nodes: ResponseNodeResponse,
  loaded: LoadResponsesResponse,
  meta?: { title?: string; createdAt?: string; updatedAt?: string },
): Conversation {
  const byId = new Map<string, RawResponse>();
  for (const r of loaded.responses ?? []) {
    if (r.responseId) byId.set(r.responseId, r);
  }

  // Walk in node order, falling back to any loaded responses not in the tree.
  const ordered: RawResponse[] = [];
  const seen = new Set<string>();
  for (const node of nodes.responseNodes ?? []) {
    const id = node.responseId;
    if (!id || seen.has(id)) continue;
    const raw = byId.get(id) ?? { responseId: id, sender: node.sender, parentResponseId: node.parentResponseId };
    seen.add(id);
    ordered.push(raw);
  }
  for (const r of loaded.responses ?? []) {
    if (r.responseId && !seen.has(r.responseId)) {
      seen.add(r.responseId);
      ordered.push(r);
    }
  }

  const messages: Message[] = [];
  const attachments: Attachment[] = [];
  const seenAttachment = new Set<string>();
  for (const raw of ordered) {
    const parsed = parseResponse(raw);
    messages.push(parsed.message);
    for (const att of parsed.attachments) {
      if (seenAttachment.has(att.id)) continue;
      seenAttachment.add(att.id);
      attachments.push(att);
    }
  }

  sortChronologically(messages);
  linkChildren(messages);

  const model = [...messages].reverse().find((m) => m.model)?.model;
  const firstUserPart = messages
    .find((m) => m.role === "user")
    ?.content.find((c) => c.type === "text");
  const fallbackTitle = firstUserPart?.type === "text" ? firstUserPart.text : "";

  const conversation: Conversation = {
    schemaVersion: "1",
    id: conversationId,
    platform: PLATFORM,
    title: meta?.title || fallbackTitle,
    messages,
  };
  if (meta?.createdAt) conversation.createdAt = meta.createdAt;
  if (meta?.updatedAt) conversation.updatedAt = meta.updatedAt;
  if (model) conversation.model = model;
  if (attachments.length) conversation.attachments = attachments;
  conversation.sourceUrl = `https://grok.com/c/${conversationId}`;
  return conversation;
}

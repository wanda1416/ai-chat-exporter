import type {
  Attachment,
  Citation,
  ContentPart,
  Conversation,
  ConversationMeta,
  Message,
  Role,
} from "@ace/schema";
import type {
  ConversationDetailResponse,
  ListConversationsResponse,
  RawContentBlock,
  RawConvTurn,
  RawMediaInfo,
} from "./types.js";

export const PLATFORM = "yuanbao";

/**
 * Yuanbao's default assistant agent id ("元宝"). Custom agents (AI 应用) live on
 * their own ids and have their own conversation lists; callers can override it.
 */
export const DEFAULT_AGENT_ID = "naQivTmsDa";

/** Reads the agent id out of `/chat/<agentId>/<conversationId>`, if present. */
export function agentIdFromPath(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "chat") return undefined;
  return segments.length > 1 ? segments[1] : undefined;
}

/**
 * Yuanbao timestamps are Unix **seconds** in the fields we use, but the same
 * API family occasionally emits milliseconds or strings — normalize all three.
 */
export function toIsoTime(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  // Values below 1e12 are seconds; above are milliseconds.
  const ms = numeric < 1e12 ? numeric * 1000 : numeric;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** "human" → user, "ai" → assistant; anything else is treated defensively. */
function toRole(speaker: string | undefined): Role {
  switch ((speaker ?? "").toLowerCase()) {
    case "ai":
    case "assistant":
    case "bot":
      return "assistant";
    case "system":
      return "system";
    default:
      return "user";
  }
}

/** Best-effort MIME type from a block/media `type` tag or a file extension. */
function guessMimeType(tag: string | undefined, fileName: string | undefined): string | undefined {
  const t = (tag ?? "").toLowerCase();
  if (t === "txt" || t === "text") return "text/plain";
  if (t === "pdf") return "application/pdf";
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName ?? "")) return "image/*";
  return undefined;
}

function isFileBlock(type: string): boolean {
  return (
    type === "txt" ||
    type === "pdf" ||
    type === "file" ||
    type === "doc" ||
    type === "excel" ||
    type === "ppt"
  );
}

function mediaToAttachment(media: RawMediaInfo, fallbackId: string): Attachment {
  const id = media.mediaId || media.fileName || fallbackId;
  const attachment: Attachment = { id };
  if (media.fileName) attachment.name = media.fileName;
  const mimeType = guessMimeType(media.type, media.fileName);
  if (mimeType) attachment.mimeType = mimeType;
  if (typeof media.size === "number" && Number.isFinite(media.size)) {
    attachment.sizeBytes = media.size;
  }
  if (media.url) attachment.url = media.url;
  return attachment;
}

/** What one content block contributes to a message. */
interface BlockContribution {
  parts: ContentPart[];
  reasoning?: { content: string; summary?: string };
  citations: Citation[];
  attachments: Attachment[];
}

/**
 * Maps a single `speechesV2[].content[]` block.
 *
 * Observed block types (2026-11):
 *   text       → { type: "text", msg }
 *   think      → { type: "think", title, content }        → reasoning
 *   searchGuid → { type: "searchGuid", title, docs[] }    → citations
 *   txt        → { type: "txt", url, fileName, size }     → attachment + file part
 * Unknown types degrade to text when they carry a string body, else are dropped.
 */
function mapBlock(block: RawContentBlock, messageId: string, index: number): BlockContribution {
  const contribution: BlockContribution = { parts: [], citations: [], attachments: [] };
  const type = (block.type ?? "").toLowerCase();

  if (type === "think") {
    const content = block.content ?? "";
    if (content) {
      contribution.reasoning = { content };
      if (block.title) contribution.reasoning.summary = block.title;
    }
    return contribution;
  }

  if (type === "searchguid") {
    for (const doc of block.docs ?? []) {
      const citation: Citation = {};
      if (doc.title) citation.title = doc.title;
      if (doc.url) citation.url = doc.url;
      if (doc.quote) citation.snippet = doc.quote;
      if (citation.title || citation.url) contribution.citations.push(citation);
    }
    return contribution;
  }

  if (type === "image") {
    const attachment = mediaToAttachment(
      { type: "image", url: block.url, fileName: block.fileName, mediaId: block.mediaId },
      `${messageId}-image-${index}`,
    );
    contribution.attachments.push(attachment);
    contribution.parts.push({
      type: "image",
      attachmentId: attachment.id,
      ...(block.url ? { url: block.url } : {}),
      ...(block.fileName ? { alt: block.fileName } : {}),
    });
    return contribution;
  }

  if (isFileBlock(type)) {
    const attachment = mediaToAttachment(block, `${messageId}-file-${index}`);
    contribution.attachments.push(attachment);
    const part: ContentPart = { type: "file", attachmentId: attachment.id };
    if (attachment.name) part.name = attachment.name;
    contribution.parts.push(part);
    return contribution;
  }

  const text = block.msg ?? block.content ?? "";
  if (text) contribution.parts.push({ type: "text", text });
  return contribution;
}

/** Merges the reasoning traces of one message (a turn may hold several). */
function mergeReasoning(
  target: { content: string; summary?: string } | undefined,
  incoming: { content: string; summary?: string },
): { content: string; summary?: string } {
  if (!target) return incoming;
  return {
    content: `${target.content}\n\n${incoming.content}`,
    ...(target.summary ?? incoming.summary ? { summary: target.summary ?? incoming.summary } : {}),
  };
}

/** Maps one conversation turn into a standard message. */
export function toMessage(turn: RawConvTurn, conversationId: string): {
  message: Message;
  attachments: Attachment[];
} {
  const messageId = turn.id ?? `${conversationId}_${turn.index ?? 0}`;
  const content: ContentPart[] = [];
  const citations: Citation[] = [];
  const attachments: Attachment[] = [];
  let reasoning: { content: string; summary?: string } | undefined;
  let model: string | undefined;

  const speeches = turn.speechesV2 ?? [];
  for (const speech of speeches) {
    if (speech.chatModelId) model = speech.chatModelId;
    const blocks = speech.content ?? [];
    for (const [index, block] of blocks.entries()) {
      const contribution = mapBlock(block, messageId, index);
      content.push(...contribution.parts);
      citations.push(...contribution.citations);
      attachments.push(...contribution.attachments);
      if (contribution.reasoning) reasoning = mergeReasoning(reasoning, contribution.reasoning);
    }
  }

  for (const media of turn.multiMediaInfo ?? []) {
    const attachment = mediaToAttachment(media, `${messageId}-media-${attachments.length}`);
    attachments.push(attachment);
    const part: ContentPart = { type: "file", attachmentId: attachment.id };
    if (attachment.name) part.name = attachment.name;
    content.push(part);
  }

  const message: Message = { id: messageId, role: toRole(turn.speaker), content };
  const timestamp = toIsoTime(turn.createTime);
  if (timestamp) message.timestamp = timestamp;
  if (model && message.role === "assistant") message.model = model;
  if (reasoning) message.reasoning = reasoning;
  if (citations.length) message.citations = citations;
  if (attachments.length) message.attachments = attachments.map((a) => a.id);

  return { message, attachments };
}

/**
 * Sorts turns oldest-first by `index` and drops duplicates. The API returns
 * turns newest-first and a paged fetch can overlap at the page boundary.
 */
export function orderedTurns(turns: RawConvTurn[]): RawConvTurn[] {
  const byKey = new Map<string, RawConvTurn>();
  for (const [position, turn] of turns.entries()) {
    const key = turn.id ?? `#${turn.index ?? position}`;
    if (!byKey.has(key)) byKey.set(key, turn);
  }
  return [...byKey.values()].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/** The cursor for the next (older) listing page, or undefined when exhausted. */
export function nextListCursor(response: ListConversationsResponse): number | undefined {
  const items = response.data?.list ?? [];
  if (!items.length) return undefined;
  const times = items
    .map((item) => item.lastRepliedAt)
    .filter((value): value is number => typeof value === "number" && value > 0);
  return times.length ? Math.min(...times) : undefined;
}

/** Maps a listing page into standard listing entries. */
export function parseConversationList(response: ListConversationsResponse): ConversationMeta[] {
  const metas: ConversationMeta[] = [];
  for (const item of response.data?.list ?? []) {
    if (!item.id) continue;
    const meta: ConversationMeta = { id: item.id, platform: PLATFORM, title: item.title ?? "" };
    const createdAt = toIsoTime(item.firstRepliedAt);
    const updatedAt = toIsoTime(item.lastRepliedAt);
    if (createdAt) meta.createdAt = createdAt;
    if (updatedAt) meta.updatedAt = updatedAt;
    metas.push(meta);
  }
  return metas;
}

/**
 * Assembles the standard Conversation from one or more detail responses.
 *
 * `pages` may contain several windows of the same thread (long conversations
 * are walked backwards from the newest turn); turns are deduped and sorted by
 * `index`. `meta` carries the listing title/timestamps, which the detail
 * endpoint usually repeats but not always.
 */
export function toConversation(
  pages: ConversationDetailResponse[],
  meta?: { id?: string; title?: string; createdAt?: string; updatedAt?: string; agentId?: string },
): Conversation {
  const first = pages[0] ?? {};
  const conversationId = meta?.id ?? first.id ?? "";
  const agentId = meta?.agentId ?? first.agentId ?? DEFAULT_AGENT_ID;

  const turns = orderedTurns(pages.flatMap((page) => page.convs ?? []));

  const messages: Message[] = [];
  const attachments: Attachment[] = [];
  const seenAttachment = new Set<string>();
  for (const turn of turns) {
    const parsed = toMessage(turn, conversationId);
    messages.push(parsed.message);
    for (const attachment of parsed.attachments) {
      if (seenAttachment.has(attachment.id)) continue;
      seenAttachment.add(attachment.id);
      attachments.push(attachment);
    }
  }

  for (const page of pages) {
    for (const media of page.multiMediaInfo ?? []) {
      const attachment = mediaToAttachment(media, `media-${attachments.length}`);
      if (seenAttachment.has(attachment.id)) continue;
      seenAttachment.add(attachment.id);
      attachments.push(attachment);
    }
  }

  const firstUserText = messages
    .find((message) => message.role === "user")
    ?.content.find((part) => part.type === "text");
  const fallbackTitle =
    firstUserText?.type === "text" ? firstUserText.text.replace(/\s+/g, " ").slice(0, 80) : "";

  const model = [...messages].reverse().find((message) => message.model)?.model ?? first.modelId;

  const conversation: Conversation = {
    schemaVersion: "1",
    id: conversationId,
    platform: PLATFORM,
    title: meta?.title || first.title || fallbackTitle,
    messages,
  };

  const createdAt =
    earliestTime(meta?.createdAt, pages) ??
    toIsoTime(first.firstRepliedAt) ??
    messages.find((m) => m.timestamp)?.timestamp;
  const updatedAt =
    meta?.updatedAt ??
    toIsoTime(first.lastRepliedAt) ??
    [...messages].reverse().find((m) => m.timestamp)?.timestamp;
  if (createdAt) conversation.createdAt = createdAt;
  if (updatedAt) conversation.updatedAt = updatedAt;
  if (model) conversation.model = model;
  if (attachments.length) conversation.attachments = attachments;
  conversation.sourceUrl = `https://yuanbao.tencent.com/chat/${agentId}/${conversationId}`;
  return conversation;
}

/** Picks the listing-provided createdAt, else the earliest detail timestamp. */
function earliestTime(
  fromMeta: string | undefined,
  pages: ConversationDetailResponse[],
): string | undefined {
  if (fromMeta) return fromMeta;
  const times = pages
    .map((page) => toIsoTime(page.firstRepliedAt))
    .filter((value): value is string => Boolean(value))
    .sort();
  return times[0];
}

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

export const PLATFORM = "hunyuan";

/** Agent id used by the default "混元" chat; custom agents have their own. */
export const DEFAULT_AGENT_ID = "HunyuanDefault";

/** Reads the agent id out of `/chat/<agentId>/<conversationId>`, if present. */
export function agentIdFromPath(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "chat") return undefined;
  return segments.length > 1 ? segments[1] : undefined;
}

/** Reads the conversation id out of `/chat/[<agentId>/]<conversationId>`. */
export function conversationIdFromPath(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "chat") return undefined;
  return segments.length >= 3 ? segments[2] : segments[1];
}

/** Hunyuan timestamps are Unix seconds; tolerate milliseconds and strings too. */
export function toIsoTime(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  const ms = numeric < 1e12 ? numeric * 1000 : numeric;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** "human" → user, "ai" → assistant; injected "custom" nodes are skipped. */
export function toRole(speaker: string | undefined): Role | undefined {
  switch ((speaker ?? "").toLowerCase()) {
    case "human":
    case "user":
      return "user";
    case "ai":
    case "assistant":
    case "bot":
      return "assistant";
    case "system":
      return "system";
    default:
      return undefined;
  }
}

/** Best-effort MIME type from a block/media tag or the filename extension. */
function guessMimeType(tag: string | undefined, fileName: string | undefined): string | undefined {
  const t = (tag ?? "").toLowerCase();
  if (t === "txt" || t === "text") return "text/plain";
  if (t === "pdf") return "application/pdf";
  if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName ?? "")) return "image/*";
  return undefined;
}

function isFileBlock(type: string): boolean {
  return type === "txt" || type === "pdf" || type === "file" || type === "doc";
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

interface BlockContribution {
  parts: ContentPart[];
  reasoning?: { content: string; summary?: string };
  citations: Citation[];
  attachments: Attachment[];
}

/**
 * Maps one `speechesV2[].content[]` block.
 *
 * Body field differs by tag: `text`/`thought` use `msg`, the sibling API's
 * `think` uses `content` — both are read.
 */
function mapBlock(block: RawContentBlock, messageId: string, index: number): BlockContribution {
  const contribution: BlockContribution = { parts: [], citations: [], attachments: [] };
  const type = (block.type ?? "").toLowerCase();
  const body = block.msg ?? block.content ?? "";

  if (type === "thought" || type === "think") {
    if (body) {
      contribution.reasoning = { content: body };
      if (block.title) contribution.reasoning.summary = block.title;
    }
    return contribution;
  }

  if (type === "searchguid" || type === "reference") {
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

  if (body) contribution.parts.push({ type: "text", text: body });
  return contribution;
}

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

/** Maps one conversation turn into a standard message (or null when skipped). */
export function toMessage(
  turn: RawConvTurn,
  conversationId: string,
): { message: Message; attachments: Attachment[] } | null {
  const role = toRole(turn.speaker);
  if (!role) return null;

  const messageId = turn.id ?? turn.chatRecordId ?? `${conversationId}_${turn.index ?? 0}`;
  const content: ContentPart[] = [];
  const citations: Citation[] = [];
  const attachments: Attachment[] = [];
  let reasoning: { content: string; summary?: string } | undefined;
  let model: string | undefined;

  for (const speech of turn.speechesV2 ?? []) {
    if (speech.chatModelId) model = speech.chatModelId;
    for (const [index, block] of (speech.content ?? []).entries()) {
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

  const message: Message = { id: messageId, role, content };
  const timestamp = toIsoTime(turn.createTime);
  if (timestamp) message.timestamp = timestamp;
  if (model && role === "assistant") message.model = model;
  if (reasoning) message.reasoning = reasoning;
  if (citations.length) message.citations = citations;
  if (attachments.length) message.attachments = attachments.map((a) => a.id);

  return { message, attachments };
}

/** Sorts turns oldest-first and drops duplicates and non-conversation nodes. */
export function orderedTurns(turns: RawConvTurn[]): RawConvTurn[] {
  const byKey = new Map<string, RawConvTurn>();
  for (const [position, turn] of turns.entries()) {
    if (!toRole(turn.speaker)) continue;
    const key = turn.id ?? turn.chatRecordId ?? `#${turn.index ?? position}`;
    if (!byKey.has(key)) byKey.set(key, turn);
  }
  return [...byKey.values()].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/** True when the listing reports no further pages. */
export function hasMorePages(response: ListConversationsResponse, offset: number): boolean {
  const total = response.totalCount;
  const seen = offset + (response.data?.length ?? 0);
  if (typeof total === "number") return seen < total;
  return (response.data?.length ?? 0) > 0;
}

/** Pinned conversations are not part of `data`; expose them separately. */
export function pinnedConversations(response: ListConversationsResponse) {
  return response.pinnedData ?? [];
}

/** Maps one listing page into standard listing entries. */
export function parseConversationList(response: ListConversationsResponse): ConversationMeta[] {
  return toMetas([...(response.pinnedData ?? []), ...(response.data ?? [])]);
}

function toMetas(items: NonNullable<ListConversationsResponse["data"]>): ConversationMeta[] {
  const metas: ConversationMeta[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    const meta: ConversationMeta = { id: item.id, platform: PLATFORM, title: item.title ?? "" };
    const createdAt = toIsoTime(item.createdAt);
    const updatedAt = toIsoTime(item.updatedAt);
    if (createdAt) meta.createdAt = createdAt;
    if (updatedAt) meta.updatedAt = updatedAt;
    metas.push(meta);
  }
  return metas;
}

/**
 * Assembles the standard Conversation from one or more detail responses.
 *
 * `meta` carries what only the listing knows: the real title (the detail
 * endpoint returns an empty one), its timestamps, and the `chatModelId` /
 * `agentId` needed to keep fetching.
 */
export function toConversation(
  pages: ConversationDetailResponse[],
  meta?: {
    id?: string;
    title?: string;
    createdAt?: string;
    updatedAt?: string;
    agentId?: string;
    chatModelId?: string;
  },
): Conversation {
  const first = pages[0] ?? {};
  const conversationId = meta?.id ?? first.id ?? "";
  const agentId = meta?.agentId ?? DEFAULT_AGENT_ID;

  const messages: Message[] = [];
  const attachments: Attachment[] = [];
  const seenAttachment = new Set<string>();
  for (const turn of orderedTurns(pages.flatMap((page) => page.convs ?? []))) {
    const parsed = toMessage(turn, conversationId);
    if (!parsed) continue;
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

  const model =
    [...messages].reverse().find((message) => message.model)?.model ??
    meta?.chatModelId ??
    first.chatModelId ??
    first.modelId;

  const conversation: Conversation = {
    schemaVersion: "1",
    id: conversationId,
    platform: PLATFORM,
    title: meta?.title || first.title || fallbackTitle,
    messages,
  };

  const earliest = messages.find((message) => message.timestamp)?.timestamp;
  const latest = [...messages].reverse().find((message) => message.timestamp)?.timestamp;
  const createdAt = meta?.createdAt ?? toIsoTime(first.firstRepliedAt) ?? earliest;
  const updatedAt = meta?.updatedAt ?? toIsoTime(first.lastRepliedAt) ?? latest;
  if (createdAt) conversation.createdAt = createdAt;
  if (updatedAt) conversation.updatedAt = updatedAt;
  if (model) conversation.model = model;
  if (attachments.length) conversation.attachments = attachments;
  conversation.sourceUrl = `https://aistudio.tencent.com/chat/${agentId}/${conversationId}`;
  return conversation;
}

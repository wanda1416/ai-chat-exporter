import type {
  Attachment,
  Citation,
  ContentPart,
  Conversation,
  ConversationMeta,
  Message,
  Reasoning,
  Role,
} from "@ace/schema";
import type {
  GetChatResponse,
  ListFeedsResponse,
  ListMessagesResponse,
  RawBlock,
  RawMessage,
  RawReference,
} from "./types.js";

export const PLATFORM = "kimi";

function toRole(raw: string | undefined): Role {
  const v = (raw ?? "").toLowerCase();
  if (v.includes("assistant")) return "assistant";
  if (v.includes("system")) return "system";
  return "user";
}

/**
 * Extracts ordered content + aggregated reasoning from a message's blocks.
 * `tool` / `multiStage` / `stage` blocks are progress/agent scaffolding with no
 * exportable prose and are intentionally skipped for v0.1.
 */
export function parseBlocks(blocks: RawBlock[] | undefined): {
  content: ContentPart[];
  reasoning?: Reasoning;
} {
  const content: ContentPart[] = [];
  const thoughts: string[] = [];
  const summaries: string[] = [];

  for (const block of blocks ?? []) {
    if (block.text?.content) {
      content.push({ type: "text", text: block.text.content });
    } else if (block.think) {
      if (block.think.content) thoughts.push(block.think.content);
      if (block.think.summary) summaries.push(block.think.summary);
    }
  }

  const reasoning: Reasoning | undefined = thoughts.length
    ? {
        content: thoughts.join("\n\n"),
        ...(summaries.length ? { summary: summaries.join("\n\n") } : {}),
      }
    : undefined;

  return { content, reasoning };
}

/** Flattens Kimi web-search references into standard citations (deduped by url). */
export function parseReferences(references: RawReference[] | undefined): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const ref of references ?? []) {
    for (const item of ref.items ?? []) {
      const base = item.search?.base;
      if (!base) continue;
      const key = base.url ?? base.title ?? "";
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const citation: Citation = {};
      if (base.title) citation.title = base.title;
      if (base.url) citation.url = base.url;
      if (base.snippet) citation.snippet = base.snippet;
      citations.push(citation);
    }
  }
  return citations;
}

function parseMessage(raw: RawMessage): Message {
  const { content, reasoning } = parseBlocks(raw.blocks);
  const citations = parseReferences(raw.references);
  const message: Message = {
    id: raw.id ?? "",
    role: toRole(raw.role),
    content,
  };
  if (raw.createTime) message.timestamp = raw.createTime;
  if (reasoning) message.reasoning = reasoning;
  if (citations.length) message.citations = citations;
  if (raw.parentId !== undefined) message.parentId = raw.parentId || null;
  return message;
}

/** Derives each message's `childrenIds` from the `parentId` links (Kimi omits it). */
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

function parseAttachments(chat: GetChatResponse): Attachment[] {
  return (chat.files ?? []).map((file, index) => {
    const meta = file.meta ?? {};
    const size = typeof meta.sizeBytes === "string" ? Number(meta.sizeBytes) : meta.sizeBytes;
    const attachment: Attachment = { id: meta.checksum || meta.name || `file-${index}` };
    if (meta.name) attachment.name = meta.name;
    if (meta.contentType) attachment.mimeType = meta.contentType;
    if (typeof size === "number" && Number.isFinite(size)) attachment.sizeBytes = size;
    if (file.blob?.signUrl) attachment.url = file.blob.signUrl;
    if (meta.checksum) attachment.checksum = meta.checksum;
    return attachment;
  });
}

/** Maps a ListFeeds page into standard listing entries. */
export function parseFeeds(response: ListFeedsResponse): ConversationMeta[] {
  const metas: ConversationMeta[] = [];
  for (const item of response.items ?? []) {
    const chat = item.chat;
    if (!chat?.id) continue;
    const meta: ConversationMeta = { id: chat.id, platform: PLATFORM, title: chat.name ?? "" };
    if (chat.createTime) meta.createdAt = chat.createTime;
    if (chat.updateTime) meta.updatedAt = chat.updateTime;
    metas.push(meta);
  }
  return metas;
}

/** Assembles the standard Conversation from a GetChat + ListMessages pair. */
export function toConversation(
  chatId: string,
  chat: GetChatResponse,
  messages: ListMessagesResponse,
): Conversation {
  const summary = chat.chat ?? {};
  const attachments = parseAttachments(chat);
  const parsedMessages = (messages.messages ?? []).map(parseMessage);
  linkChildren(parsedMessages);

  const conversation: Conversation = {
    schemaVersion: "1",
    id: summary.id ?? chatId,
    platform: PLATFORM,
    title: summary.name ?? "",
    messages: parsedMessages,
  };
  if (summary.createTime) conversation.createdAt = summary.createTime;
  if (summary.updateTime) conversation.updatedAt = summary.updateTime;
  if (attachments.length) conversation.attachments = attachments;
  conversation.sourceUrl = `https://www.kimi.com/chat/${conversation.id}`;
  return conversation;
}

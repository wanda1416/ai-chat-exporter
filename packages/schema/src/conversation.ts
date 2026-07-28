import { z } from "zod";
import { ContentPart } from "./content.js";

/** Current schema version. Bump on breaking changes to the format. */
export const SCHEMA_VERSION = "1" as const;

/** Who authored a message. `system` covers the platform's root/system node. */
export const Role = z.enum(["user", "assistant", "system"]);
export type Role = z.infer<typeof Role>;

/** A retrievable source cited by an assistant message. */
export const Citation = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
  snippet: z.string().optional(),
});
export type Citation = z.infer<typeof Citation>;

/** A file attached to the conversation (uploaded by user or produced by the model). */
export const Attachment = z.object({
  id: z.string(),
  name: z.string().optional(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  /** Download URL. May be a temporary signed URL — resolve/download promptly. */
  url: z.string().optional(),
  /** Integrity checksum when the platform exposes one. */
  checksum: z.string().optional(),
});
export type Attachment = z.infer<typeof Attachment>;

/** The model's chain-of-thought / reasoning trace, when the platform exposes it. */
export const Reasoning = z.object({
  content: z.string(),
  summary: z.string().optional(),
});
export type Reasoning = z.infer<typeof Reasoning>;

export const Message = z.object({
  id: z.string(),
  role: Role,
  /** Ordered structured content blocks. */
  content: z.array(ContentPart),
  /** ISO 8601 timestamp. Optional because some root/system nodes carry none. */
  timestamp: z.string().optional(),
  /** Per-message model override, when it differs from the conversation default. */
  model: z.string().optional(),
  reasoning: Reasoning.optional(),
  citations: z.array(Citation).optional(),
  /** Attachment ids referenced by this message; the bytes live on the Conversation. */
  attachments: z.array(z.string()).optional(),

  // --- Branch / tree fields (platforms like Kimi store messages as a tree) ---
  /** Parent message id, or null for the root. Absent means linear/unknown. */
  parentId: z.string().nullable().optional(),
  /** Child message ids, in order. Presence of >1 indicates a branch point. */
  childrenIds: z.array(z.string()).optional(),
});
export type Message = z.infer<typeof Message>;

export const Conversation = z.object({
  /** Format version, so downstream tools can validate compatibility. */
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  /** Source platform slug, e.g. "kimi", "deepseek". */
  platform: z.string(),
  title: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  /** Default model of the conversation. */
  model: z.string().optional(),
  /** All messages. When branch fields are set, this is a flattened tree. */
  messages: z.array(Message),
  /** Conversation-level attachments, referenced from messages by id. */
  attachments: z.array(Attachment).optional(),
  /** Original URL or other provenance metadata. */
  sourceUrl: z.string().optional(),
});
export type Conversation = z.infer<typeof Conversation>;

/** Lightweight listing entry, before the full conversation is fetched. */
export const ConversationMeta = z.object({
  id: z.string(),
  platform: z.string(),
  title: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type ConversationMeta = z.infer<typeof ConversationMeta>;

import { z } from "zod";

/**
 * ContentPart — a structured block inside a message.
 *
 * A message body is an ordered array of these blocks rather than a flat string,
 * so that tables / code / attachments survive the round-trip to any exporter
 * (Markdown, JSON, DOCX...). Discriminated on `type`.
 */

export const TextPart = z.object({
  type: z.literal("text"),
  /** Plain or Markdown text. Exporters decide how to render. */
  text: z.string(),
});

export const CodePart = z.object({
  type: z.literal("code"),
  code: z.string(),
  /** Language hint for syntax highlighting, e.g. "ts", "python". */
  language: z.string().optional(),
});

/** A structured table, kept as headers + rows so no rendering is lost. */
export const TablePart = z.object({
  type: z.literal("table"),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export const ImagePart = z.object({
  type: z.literal("image"),
  /** Direct URL when available (may be a temporary signed URL). */
  url: z.string().optional(),
  alt: z.string().optional(),
  /** Reference to a Conversation-level attachment by id, when the bytes are attached. */
  attachmentId: z.string().optional(),
});

export const FilePart = z.object({
  type: z.literal("file"),
  /** Reference to a Conversation-level attachment by id. */
  attachmentId: z.string(),
  name: z.string().optional(),
});

export const ContentPart = z.discriminatedUnion("type", [
  TextPart,
  CodePart,
  TablePart,
  ImagePart,
  FilePart,
]);

export type ContentPart = z.infer<typeof ContentPart>;

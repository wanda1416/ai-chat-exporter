import type { Conversation } from "@ace/schema";

/** A single produced artifact. `content` is text for MD/JSON, bytes for binary. */
export interface ExportedFile {
  /** Relative path inside the output bundle, e.g. "kimi/markdown/2024-01-topic.md". */
  path: string;
  content: string | Uint8Array;
  mimeType: string;
}

/**
 * Transforms one {@link Conversation} into one output file.
 * Per-conversation exporters (Markdown, JSON) implement this. Batch archiving
 * (ZIP) is a separate concern — see `@ace/exporter-zip`.
 */
export interface Exporter {
  /** Stable id, e.g. "markdown" | "json". */
  readonly id: string;
  /** File extension without dot, e.g. "md". */
  readonly extension: string;
  export(conversation: Conversation): ExportedFile;
}

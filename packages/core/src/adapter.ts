import type { Attachment, Conversation, ConversationMeta } from "@ace/schema";

/** Bytes (plus optional metadata) of one downloaded attachment. */
export interface AttachmentPayload {
  bytes: Uint8Array;
  /** Content type reported by the platform, e.g. "image/png". */
  mimeType?: string;
  /** Filename reported by the platform, when better than `Attachment.name`. */
  name?: string;
}

/**
 * A platform adapter is the ONLY platform-specific code in the pipeline.
 * It does exactly two things: enumerate conversations, and fetch one as the
 * standard {@link Conversation} format. Degradation strategies (API -> DOM)
 * are an internal implementation detail and never leak into this contract.
 *
 * Convention: keep each adapter thin (~<=300 lines, "endpoints + parsing").
 */
export interface PlatformAdapter {
  /** Stable platform slug, e.g. "kimi". Also used as `Conversation.platform`. */
  readonly platform: string;

  /** Whether the current environment (URL / page) is this platform. */
  detect(): boolean;

  /**
   * Enumerate conversation listings. An async iterator so the adapter can
   * paginate lazily behind the scenes; callers just `for await`.
   */
  listConversations(): AsyncIterable<ConversationMeta>;

  /** Fetch a single conversation, already normalized to the standard schema. */
  fetchConversation(id: string): Promise<Conversation>;

  /**
   * Optionally resolve the bytes of one attachment (platform-specific auth /
   * URL resolution, e.g. ChatGPT's files download endpoint). Return null when
   * the attachment cannot be resolved — the pipeline then falls back to a
   * plain fetch of `Attachment.url`, or skips it. Absence of this method means
   * the URL fallback is the only strategy.
   */
  fetchAttachment?(
    attachment: Attachment,
    conversation: Conversation,
  ): Promise<AttachmentPayload | null>;
}

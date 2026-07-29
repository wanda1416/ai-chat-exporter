/**
 * @ace/core — pipeline orchestration and the Adapter/Exporter contracts.
 * Deliberately one layer thinner than similar projects: adapters emit the
 * standard schema directly, with no separate normalizer layer.
 */

export type { PlatformAdapter, AttachmentPayload } from "./adapter.js";
export type { Exporter, ExportedFile } from "./exporter.js";
export {
  downloadAttachments,
  DEFAULT_ATTACHMENT_MAX_BYTES,
  type DownloadAttachmentsOptions,
  type DownloadAttachmentsResult,
} from "./attachments.js";
export {
  exportConversations,
  type ExportOptions,
  type ExportRange,
  type ExportResult,
  type ExportProgress,
} from "./pipeline.js";
export { sleep, throttled } from "./throttle.js";
export { slugify, conversationBaseName } from "./naming.js";

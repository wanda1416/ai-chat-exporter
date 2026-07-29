import type { Attachment, Conversation } from "@ace/schema";
import type { AttachmentPayload, PlatformAdapter } from "./adapter.js";
import type { ExportedFile } from "./exporter.js";
import { conversationBaseName, slugify } from "./naming.js";
import { sleep } from "./throttle.js";

/** Default per-attachment size cap: 50 MB. Bigger files are skipped, not OOM'd. */
export const DEFAULT_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export interface DownloadAttachmentsOptions {
  /** Per-attachment size cap in bytes. Default {@link DEFAULT_ATTACHMENT_MAX_BYTES}. */
  maxBytes?: number;
  /** Spacing between network downloads, in ms. Default 500. */
  throttleMs?: number;
  /** fetch implementation for the `Attachment.url` fallback. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface DownloadAttachmentsResult {
  /** One binary file per successfully downloaded attachment. */
  files: ExportedFile[];
  saved: number;
  /** Attachments that were too large, unresolvable, or failed to download. */
  skipped: number;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
};

/**
 * Reads a response body while enforcing the size cap. Streams chunk by chunk
 * and cancels as soon as the cap is exceeded, so an oversized file is aborted
 * mid-flight instead of being buffered whole. Returns null when over the cap.
 */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  const reader = response.body?.getReader?.();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > maxBytes ? null : bytes;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Builds a filesystem-safe, unique filename for an attachment. Prefers the
 * platform-reported name, strips URL-scheme prefixes from ids (ChatGPT's
 * `sediment://file_…`), and derives the extension from the mime type when the
 * name carries none.
 */
function attachmentFileName(
  attachment: Attachment,
  mimeType: string | undefined,
  index: number,
  used: Set<string>,
): string {
  const raw = (attachment.name || attachment.id || `attachment-${index}`)
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^.*[\\/]/, "");
  const dot = raw.lastIndexOf(".");
  const base = slugify(dot > 0 ? raw.slice(0, dot) : raw, `attachment-${index}`);
  const namedExt = dot > 0 ? raw.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const mime = (mimeType ?? attachment.mimeType ?? "").split(";")[0]!.trim();
  const ext = namedExt || EXTENSION_BY_MIME[mime] || "bin";

  let name = `${base}.${ext}`;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}.${ext}`;
  used.add(name);
  return name;
}

/**
 * Downloads a conversation's attachments (best effort) into export files under
 * `<platform>/attachments/<conversation>/`, and stamps each successful
 * attachment with its `localPath` so exporters can link to the local bytes.
 *
 * Resolution order per attachment: the adapter's `fetchAttachment` (when
 * implemented), then a plain fetch of `Attachment.url`. Failures and files
 * over the size cap are skipped and counted — an unfetchable attachment never
 * aborts the conversation.
 */
export async function downloadAttachments(
  conversation: Conversation,
  adapter: PlatformAdapter,
  options: DownloadAttachmentsOptions = {},
): Promise<DownloadAttachmentsResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_ATTACHMENT_MAX_BYTES;
  const throttleMs = options.throttleMs ?? 500;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);

  const files: ExportedFile[] = [];
  const used = new Set<string>();
  const baseDir = `${conversation.platform}/attachments/${conversationBaseName(conversation)}`;
  let saved = 0;
  let skipped = 0;
  let first = true;

  for (const [index, attachment] of (conversation.attachments ?? []).entries()) {
    // Known-oversized files are skipped without spending a request on them.
    if (typeof attachment.sizeBytes === "number" && attachment.sizeBytes > maxBytes) {
      skipped++;
      continue;
    }

    if (!first) await sleep(throttleMs);
    first = false;

    let payload: AttachmentPayload | null = null;
    try {
      if (adapter.fetchAttachment) {
        payload = await adapter.fetchAttachment(attachment, conversation);
      }
      if (!payload && attachment.url && fetchImpl) {
        const response = await fetchImpl(attachment.url);
        if (response.ok) {
          const bytes = await readCapped(response, maxBytes);
          if (bytes) {
            payload = { bytes };
            const mime = response.headers.get("content-type");
            if (mime) payload.mimeType = mime;
          }
        }
      }
    } catch {
      payload = null; // network/CORS failure — skip, never abort the batch
    }

    if (!payload || payload.bytes.byteLength > maxBytes) {
      skipped++;
      continue;
    }

    const mimeType = payload.mimeType ?? attachment.mimeType;
    const name = attachmentFileName(
      payload.name ? { ...attachment, name: payload.name } : attachment,
      mimeType,
      index,
      used,
    );
    const path = `${baseDir}/${name}`;

    attachment.localPath = path;
    if (!attachment.mimeType && mimeType) attachment.mimeType = mimeType.split(";")[0]!.trim();
    if (attachment.sizeBytes === undefined) attachment.sizeBytes = payload.bytes.byteLength;

    files.push({ path, content: payload.bytes, mimeType: mimeType ?? "application/octet-stream" });
    saved++;
  }

  return { files, saved, skipped };
}

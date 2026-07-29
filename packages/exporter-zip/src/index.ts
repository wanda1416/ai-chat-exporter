import { Zip, ZipDeflate, ZipPassThrough, zipSync, strToU8 } from "fflate";
import type { ExportedFile } from "@ace/core";

/**
 * Bundles per-conversation export files into one ZIP archive. This is the
 * batch deliverable — the whole point of the tool: one click, all history.
 * Runs synchronously in-memory; fflate works in both browser and Node.
 *
 * Fine for text-only exports; use {@link ZipSink} when attachments are
 * included, so the batch never has to fit in memory twice.
 */
export function bundleZip(files: ExportedFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[file.path] =
      typeof file.content === "string" ? strToU8(file.content) : file.content;
  }
  return zipSync(entries, { level: 6 });
}

/** Content that is already compressed — STORE it instead of re-deflating. */
const STORED_MIME = /^(?:image|video|audio)\/|\/(?:zip|gzip|x-7z-compressed)$/;

/** Wrap accumulated output chunks into a Blob part every 32 MB by default. */
const DEFAULT_SPILL_BYTES = 32 * 1024 * 1024;

/**
 * Streaming ZIP builder — the memory-safe path for large exports.
 *
 * Files are compressed the moment they are added, so their input buffers can
 * be released right away, and the compressed output is spilled into `Blob`
 * parts every ~32 MB. Browsers back large Blobs with disk storage (paging
 * them out of the JS heap), so peak JS memory stays around: one input file +
 * one spill buffer — regardless of how big the final archive gets. Already-
 * compressed content (images, video, zips) is STOREd rather than deflated.
 */
export class ZipSink {
  private readonly zip: Zip;
  private readonly spillBytes: number;
  private readonly parts: Blob[] = [];
  private chunks: Uint8Array[] = [];
  private chunkBytes = 0;
  private error: Error | null = null;
  private readonly finished: Promise<void>;
  private resolveFinished!: () => void;

  constructor(options: { spillBytes?: number } = {}) {
    this.spillBytes = options.spillBytes ?? DEFAULT_SPILL_BYTES;
    this.finished = new Promise((resolve) => {
      this.resolveFinished = resolve;
    });
    this.zip = new Zip((err, data, final) => {
      if (err) {
        this.error = err;
        this.resolveFinished();
        return;
      }
      if (data.length) {
        this.chunks.push(data);
        this.chunkBytes += data.length;
        if (this.chunkBytes >= this.spillBytes) this.spill();
      }
      if (final) this.resolveFinished();
    });
  }

  private spill(): void {
    if (!this.chunkBytes) return;
    this.parts.push(new Blob(this.chunks as BlobPart[]));
    this.chunks = [];
    this.chunkBytes = 0;
  }

  /** Adds one file; its bytes are compressed (or stored) immediately. */
  add(file: ExportedFile): void {
    if (this.error) throw this.error;
    const bytes = typeof file.content === "string" ? strToU8(file.content) : file.content;
    const entry = STORED_MIME.test(file.mimeType)
      ? new ZipPassThrough(file.path)
      : new ZipDeflate(file.path, { level: 6 });
    this.zip.add(entry);
    entry.push(bytes, true);
  }

  /** Finalizes the archive and returns it as a single Blob. */
  async finish(): Promise<Blob> {
    this.zip.end();
    await this.finished;
    if (this.error) throw this.error;
    this.spill();
    return new Blob(this.parts, { type: "application/zip" });
  }
}

import { zipSync, strToU8 } from "fflate";
import type { ExportedFile } from "@ace/core";

/**
 * Bundles per-conversation export files into one ZIP archive. This is the
 * batch deliverable — the whole point of the tool: one click, all history.
 * Runs synchronously in-memory; fflate works in both browser and Node.
 */
export function bundleZip(files: ExportedFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[file.path] =
      typeof file.content === "string" ? strToU8(file.content) : file.content;
  }
  return zipSync(entries, { level: 6 });
}

import type { Conversation, ConversationMeta } from "@ace/schema";
import type { PlatformAdapter } from "./adapter.js";
import type { Exporter, ExportedFile } from "./exporter.js";
import { throttled } from "./throttle.js";

export interface ExportProgress {
  phase: "list" | "fetch" | "export" | "done";
  /** Conversation currently being processed, when applicable. */
  meta?: ConversationMeta;
  /** How many conversations have been fully processed so far. */
  completed: number;
  /** Total known so far (grows while listing is still streaming). */
  total: number;
}

export interface ExportOptions {
  adapter: PlatformAdapter;
  exporters: Exporter[];
  /** Restrict to these conversation ids; defaults to everything listed. */
  ids?: string[];
  /** Minimum spacing between conversation fetches, in ms. Default 500. */
  throttleMs?: number;
  onProgress?: (progress: ExportProgress) => void;
  /** Called when a single conversation fails, so one bad chat can't abort the batch. */
  onError?: (id: string, error: unknown) => void;
}

export interface ExportResult {
  files: ExportedFile[];
  conversations: Conversation[];
  failed: string[];
}

/**
 * Drives the two-stage pipeline: for every listed conversation, fetch it via
 * the adapter (throttled) and run each exporter. Failures are collected, not
 * thrown, so a single broken conversation never aborts a full-history export.
 */
export async function exportConversations(options: ExportOptions): Promise<ExportResult> {
  const { adapter, exporters, ids, throttleMs = 500, onProgress, onError } = options;

  const metas: ConversationMeta[] = [];
  const wanted = ids ? new Set(ids) : null;

  onProgress?.({ phase: "list", completed: 0, total: 0 });
  for await (const meta of adapter.listConversations()) {
    if (wanted && !wanted.has(meta.id)) continue;
    metas.push(meta);
    onProgress?.({ phase: "list", completed: 0, total: metas.length });
  }

  const fetchOne = throttled((id: string) => adapter.fetchConversation(id), throttleMs);

  const files: ExportedFile[] = [];
  const conversations: Conversation[] = [];
  const failed: string[] = [];

  for (const meta of metas) {
    onProgress?.({ phase: "fetch", meta, completed: conversations.length, total: metas.length });
    try {
      const conversation = await fetchOne(meta.id);
      conversations.push(conversation);

      onProgress?.({ phase: "export", meta, completed: conversations.length, total: metas.length });
      for (const exporter of exporters) {
        files.push(exporter.export(conversation));
      }
    } catch (error) {
      failed.push(meta.id);
      onError?.(meta.id, error);
    }
  }

  onProgress?.({ phase: "done", completed: conversations.length, total: metas.length });
  return { files, conversations, failed };
}

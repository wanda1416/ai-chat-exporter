import { KimiAdapter } from "@ace/adapter-kimi";
import { exportConversations, type ExportProgress } from "@ace/core";
import { jsonExporter } from "@ace/exporter-json";
import { markdownExporter } from "@ace/exporter-markdown";
import { bundleZip } from "@ace/exporter-zip";

/** Triggers a browser download for the given bytes. */
function download(bytes: Uint8Array, filename: string): void {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([buffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function describeProgress(p: ExportProgress): string {
  switch (p.phase) {
    case "list":
      return `Listing conversations… (${p.total})`;
    case "fetch":
      return `Fetching ${p.completed + 1}/${p.total}: ${p.meta?.title ?? ""}`;
    case "export":
      return `Exporting ${p.completed}/${p.total}…`;
    case "done":
      return `Done — ${p.completed} conversations.`;
  }
}

async function runExport(setStatus: (text: string) => void): Promise<void> {
  const adapter = new KimiAdapter();
  if (!adapter.detect()) {
    setStatus("Not a Kimi page.");
    return;
  }

  const { files, conversations, failed } = await exportConversations({
    adapter,
    exporters: [markdownExporter(), jsonExporter()],
    throttleMs: 500,
    onProgress: (p) => setStatus(describeProgress(p)),
    onError: (id, error) => console.error("[ai-chat-exporter] failed", id, error),
  });

  if (!conversations.length) {
    setStatus("No conversations exported.");
    return;
  }

  const zip = bundleZip(files);
  download(zip, `kimi-export-${new Date().toISOString().slice(0, 10)}.zip`);
  const suffix = failed.length ? ` (${failed.length} failed)` : "";
  setStatus(`Saved ${conversations.length} conversations${suffix}.`);
}

function mountButton(): void {
  const button = document.createElement("button");
  button.textContent = "Export all chats";
  Object.assign(button.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    zIndex: "99999",
    padding: "10px 16px",
    borderRadius: "10px",
    border: "none",
    background: "#111",
    color: "#fff",
    fontSize: "13px",
    cursor: "pointer",
    boxShadow: "0 2px 10px rgba(0,0,0,.25)",
  } satisfies Partial<CSSStyleDeclaration>);

  const setStatus = (text: string) => {
    button.textContent = text;
  };

  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await runExport(setStatus);
    } catch (error) {
      console.error("[ai-chat-exporter]", error);
      setStatus("Export failed — see console.");
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = "Export all chats";
      }, 4000);
    }
  });

  document.body.appendChild(button);
}

mountButton();

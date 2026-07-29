import { ChatGPTAdapter } from "@ace/adapter-chatgpt";
import { DeepSeekAdapter } from "@ace/adapter-deepseek";
import { GeminiAdapter } from "@ace/adapter-gemini";
import { GrokAdapter } from "@ace/adapter-grok";
import { KimiAdapter } from "@ace/adapter-kimi";
import {
  exportConversations,
  type ExportProgress,
  type ExportRange,
  type PlatformAdapter,
} from "@ace/core";
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

/** Picks the adapter matching the current page, or null if unsupported. */
function resolveAdapter(): PlatformAdapter | null {
  const adapters: PlatformAdapter[] = [
    new KimiAdapter(),
    new GeminiAdapter(),
    new GrokAdapter(),
    new DeepSeekAdapter(),
    new ChatGPTAdapter(),
  ];
  return adapters.find((adapter) => adapter.detect()) ?? null;
}

async function runExport(
  adapter: PlatformAdapter,
  setStatus: (text: string) => void,
  range: ExportRange,
): Promise<void> {
  const { files, conversations, failed } = await exportConversations({
    adapter,
    exporters: [markdownExporter(), jsonExporter()],
    range,
    throttleMs: 500,
    onProgress: (p) => setStatus(describeProgress(p)),
    onError: (id, error) => console.error("[ai-chat-exporter] failed", id, error),
  });

  if (!conversations.length) {
    setStatus("No conversations exported.");
    return;
  }

  const zip = bundleZip(files);
  download(zip, `${adapter.platform}-export-${new Date().toISOString().slice(0, 10)}.zip`);
  const suffix = failed.length ? ` (${failed.length} failed)` : "";
  setStatus(`Saved ${conversations.length} conversations${suffix}.`);
}

/**
 * Counts conversations by paging the listing (metadata only, no per-chat
 * fetches). Neither platform exposes a total field, so enumeration is the
 * only way. Cached per platform for the session.
 */
const countCache = new Map<string, number>();

async function countConversations(
  adapter: PlatformAdapter,
  onTick: (n: number) => void,
): Promise<number> {
  const cached = countCache.get(adapter.platform);
  if (cached !== undefined) {
    onTick(cached);
    return cached;
  }
  let n = 0;
  for await (const _meta of adapter.listConversations()) {
    n += 1;
    onTick(n);
  }
  countCache.set(adapter.platform, n);
  return n;
}

/**
 * Modal asking for the 1-based, inclusive conversation range. Resolves with
 * the chosen range, or null if the user cancels.
 */
function askRange(adapter: PlatformAdapter): Promise<ExportRange | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "100000",
      background: "rgba(0,0,0,.4)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    } satisfies Partial<CSSStyleDeclaration>);

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      background: "#fff",
      color: "#111",
      // Host pages (e.g. Gemini dark mode) set `color-scheme: dark`, which
      // flips UA defaults for form controls — buttons/inputs without explicit
      // colors would render white-on-white. Pin the dialog to light.
      colorScheme: "light",
      borderRadius: "12px",
      padding: "20px",
      width: "300px",
      fontSize: "13px",
      fontFamily: "system-ui, sans-serif",
      boxShadow: "0 8px 30px rgba(0,0,0,.35)",
    } satisfies Partial<CSSStyleDeclaration>);
    panel.innerHTML = `
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">Export conversations</div>
      <div style="color:#666;margin-bottom:12px">Range is 1-based and inclusive. Leave “to” empty to export to the end.</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
        <input data-role="from" type="number" min="1" step="1" value="1"
               style="width:0;flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;color:#111">
        <span>–</span>
        <input data-role="to" type="number" min="1" step="1" placeholder="end"
               style="width:0;flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;color:#111">
      </div>
      <div data-role="error" style="color:#c00;margin-bottom:8px;display:none"></div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
        <span data-role="total" style="color:#666">Total: unknown</span>
        <button data-role="count" style="padding:3px 10px;border-radius:6px;border:1px solid #ccc;background:#fff;color:#333;cursor:pointer;font-size:12px">Load count</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button data-role="cancel" style="padding:7px 14px;border-radius:8px;border:1px solid #ccc;background:#fff;color:#111;cursor:pointer">Cancel</button>
        <button data-role="ok" style="padding:7px 14px;border-radius:8px;border:none;background:#111;color:#fff;cursor:pointer">Export</button>
      </div>`;
    overlay.appendChild(panel);

    const fromInput = panel.querySelector<HTMLInputElement>('[data-role="from"]')!;
    const toInput = panel.querySelector<HTMLInputElement>('[data-role="to"]')!;
    const errorBox = panel.querySelector<HTMLElement>('[data-role="error"]')!;
    const totalLabel = panel.querySelector<HTMLElement>('[data-role="total"]')!;
    const countButton = panel.querySelector<HTMLButtonElement>('[data-role="count"]')!;

    countButton.addEventListener("click", async () => {
      countButton.disabled = true;
      countButton.textContent = "Counting…";
      try {
        const total = await countConversations(adapter, (n) => {
          totalLabel.textContent = `Total: ${n}…`;
        });
        totalLabel.textContent = `Total: ${total}`;
        toInput.placeholder = String(total);
        countButton.remove();
      } catch (error) {
        console.error("[ai-chat-exporter] count failed", error);
        totalLabel.textContent = "Total: failed — see console";
        countButton.disabled = false;
        countButton.textContent = "Retry";
      }
    });

    const close = (result: ExportRange | null) => {
      overlay.remove();
      resolve(result);
    };

    const submit = () => {
      const from = Number.parseInt(fromInput.value, 10);
      const to = toInput.value.trim() === "" ? undefined : Number.parseInt(toInput.value, 10);
      if (!Number.isInteger(from) || from < 1 || (to !== undefined && (!Number.isInteger(to) || to < from))) {
        errorBox.textContent = "Invalid range: “from” must be ≥ 1 and “to” must be ≥ “from”.";
        errorBox.style.display = "block";
        return;
      }
      close({ from, to });
    };

    panel.querySelector('[data-role="ok"]')!.addEventListener("click", submit);
    panel.querySelector('[data-role="cancel"]')!.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(null);
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submit();
      if (event.key === "Escape") close(null);
    });

    document.body.appendChild(overlay);
    fromInput.focus();
  });
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
    const adapter = resolveAdapter();
    if (!adapter) {
      setStatus("Unsupported page.");
      return;
    }
    const range = await askRange(adapter);
    if (!range) return;
    button.disabled = true;
    try {
      await runExport(adapter, setStatus, range);
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

/**
 * Mounts the export button on supported pages. Shared entry point for both
 * shipping shells (Tampermonkey userscript, Chrome extension MAIN-world
 * content script) — the runtime environment is identical in both cases.
 */
export function bootstrap(): void {
  mountButton();
}

import { ChatGPTAdapter } from "@ace/adapter-chatgpt";
import { DeepSeekAdapter } from "@ace/adapter-deepseek";
import { GeminiAdapter } from "@ace/adapter-gemini";
import { GrokAdapter } from "@ace/adapter-grok";
import { HunyuanAdapter } from "@ace/adapter-hunyuan";
import { KimiAdapter } from "@ace/adapter-kimi";
import { YuanbaoAdapter } from "@ace/adapter-yuanbao";
import {
  exportConversations,
  type ExportProgress,
  type ExportRange,
  type PlatformAdapter,
} from "@ace/core";
import { jsonExporter } from "@ace/exporter-json";
import { markdownExporter } from "@ace/exporter-markdown";
import { ZipSink } from "@ace/exporter-zip";
import { detectLocale, messages } from "./i18n.js";

/** UI strings for the browser/OS language, resolved once per page load. */
const t = messages(detectLocale());

/** Triggers a browser download for the given blob. */
function download(blob: Blob, filename: string): void {
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
      return t.progressListing(p.total);
    case "fetch":
      return t.progressFetching(p.completed + 1, p.total, p.meta?.title ?? "");
    case "attachments":
      return t.progressAttachments(p.completed + 1, p.total);
    case "export":
      return t.progressExporting(p.completed, p.total);
    case "done":
      return t.progressDone(p.completed);
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
    new YuanbaoAdapter(),
    new HunyuanAdapter(),
  ];
  return adapters.find((adapter) => adapter.detect()) ?? null;
}

async function runExport(
  adapter: PlatformAdapter,
  setStatus: (text: string) => void,
  choices: ExportChoices,
): Promise<void> {
  // Stream every produced file straight into the ZIP: input buffers are
  // compressed and released one by one, so a big export (especially with
  // attachments) never has to sit in memory uncompressed.
  const sink = new ZipSink();
  const { conversations, failed, attachmentsSaved, attachmentsSkipped } =
    await exportConversations({
      adapter,
      exporters: [markdownExporter(), jsonExporter()],
      range: choices.range,
      includeAttachments: choices.includeAttachments,
      throttleMs: 500,
      onFile: (file) => sink.add(file),
      onProgress: (p) => setStatus(describeProgress(p)),
      onError: (id, error) => console.error("[ai-chat-exporter] failed", id, error),
    });

  if (!conversations.length) {
    setStatus(t.noConversations);
    return;
  }

  const zip = await sink.finish();
  download(zip, `${adapter.platform}-export-${new Date().toISOString().slice(0, 10)}.zip`);
  const bits = [t.saved(conversations.length)];
  if (attachmentsSaved) bits.push(t.filesSaved(attachmentsSaved));
  if (attachmentsSkipped) bits.push(t.filesSkipped(attachmentsSkipped));
  if (failed.length) bits.push(t.failed(failed.length));
  setStatus(`${bits[0]}${bits.length > 1 ? ` (${bits.slice(1).join(", ")})` : ""}.`);
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

/** What the user picked in the export dialog. */
interface ExportChoices {
  range: ExportRange;
  includeAttachments: boolean;
}

/**
 * Modal asking for the 1-based, inclusive conversation range and whether to
 * download attachments. Resolves with the choices, or null on cancel.
 */
function askChoices(adapter: PlatformAdapter): Promise<ExportChoices | null> {
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
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">${t.dialogTitle}</div>
      <div style="color:#666;margin-bottom:12px">${t.dialogHint}</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
        <input data-role="from" type="number" min="1" step="1" value="1"
               style="width:0;flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;color:#111">
        <span>–</span>
        <input data-role="to" type="number" min="1" step="1" placeholder="${t.rangeToPlaceholder}"
               style="width:0;flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;color:#111">
      </div>
      <div data-role="error" style="color:#c00;margin-bottom:8px;display:none"></div>
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:12px;cursor:pointer">
        <input data-role="attachments" type="checkbox" style="margin:0">
        <span>${t.attachmentsLabel}</span>
      </label>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
        <span data-role="total" style="color:#666">${t.totalUnknown}</span>
        <button data-role="count" style="padding:3px 10px;border-radius:6px;border:1px solid #ccc;background:#fff;color:#333;cursor:pointer;font-size:12px">${t.loadCount}</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button data-role="cancel" style="padding:7px 14px;border-radius:8px;border:1px solid #ccc;background:#fff;color:#111;cursor:pointer">${t.cancel}</button>
        <button data-role="ok" style="padding:7px 14px;border-radius:8px;border:none;background:#111;color:#fff;cursor:pointer">${t.export}</button>
      </div>`;
    panel.lang = detectLocale();
    overlay.appendChild(panel);

    const fromInput = panel.querySelector<HTMLInputElement>('[data-role="from"]')!;
    const toInput = panel.querySelector<HTMLInputElement>('[data-role="to"]')!;
    const attachmentsInput = panel.querySelector<HTMLInputElement>('[data-role="attachments"]')!;
    const errorBox = panel.querySelector<HTMLElement>('[data-role="error"]')!;
    const totalLabel = panel.querySelector<HTMLElement>('[data-role="total"]')!;
    const countButton = panel.querySelector<HTMLButtonElement>('[data-role="count"]')!;

    countButton.addEventListener("click", async () => {
      countButton.disabled = true;
      countButton.textContent = t.counting;
      try {
        const total = await countConversations(adapter, (n) => {
          totalLabel.textContent = t.totalCounting(n);
        });
        totalLabel.textContent = t.total(total);
        toInput.placeholder = String(total);
        countButton.remove();
      } catch (error) {
        console.error("[ai-chat-exporter] count failed", error);
        totalLabel.textContent = t.totalFailed;
        countButton.disabled = false;
        countButton.textContent = t.retry;
      }
    });

    const close = (result: ExportChoices | null) => {
      overlay.remove();
      resolve(result);
    };

    const submit = () => {
      const from = Number.parseInt(fromInput.value, 10);
      const to = toInput.value.trim() === "" ? undefined : Number.parseInt(toInput.value, 10);
      if (!Number.isInteger(from) || from < 1 || (to !== undefined && (!Number.isInteger(to) || to < from))) {
        errorBox.textContent = t.invalidRange;
        errorBox.style.display = "block";
        return;
      }
      close({ range: { from, to }, includeAttachments: attachmentsInput.checked });
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
  button.textContent = t.buttonExport;
  button.lang = detectLocale();
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
      setStatus(t.unsupportedPage);
      return;
    }
    const choices = await askChoices(adapter);
    if (!choices) return;
    button.disabled = true;
    try {
      await runExport(adapter, setStatus, choices);
    } catch (error) {
      console.error("[ai-chat-exporter]", error);
      setStatus(t.exportFailed);
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = t.buttonExport;
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

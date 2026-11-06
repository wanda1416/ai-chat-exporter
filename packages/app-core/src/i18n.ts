/**
 * Minimal in-page i18n: two locales, no dependency, no async loading.
 *
 * The UI is a single button plus one dialog, so a flat message table is enough.
 * Locale is picked from the browser/OS language (and the embedding page's
 * `lang`), so a Chinese environment gets Chinese without any setting.
 */

export type Locale = "en" | "zh-CN";

/** Every user-visible string; both locales must implement this exactly. */
export interface Messages {
  buttonExport: string;
  dialogTitle: string;
  dialogHint: string;
  attachmentsLabel: string;
  totalUnknown: string;
  totalCounting: (count: number) => string;
  total: (count: number) => string;
  totalFailed: string;
  loadCount: string;
  counting: string;
  retry: string;
  rangeToPlaceholder: string;
  cancel: string;
  export: string;
  invalidRange: string;
  unsupportedPage: string;
  exportFailed: string;
  noConversations: string;
  saved: (count: number) => string;
  filesSaved: (count: number) => string;
  filesSkipped: (count: number) => string;
  failed: (count: number) => string;
  /** Appended after the result summary; "。" for Chinese, "." for English. */
  summarySuffix: string;
  progressListing: (count: number) => string;
  progressFetching: (done: number, total: number, title: string) => string;
  progressAttachments: (done: number, total: number) => string;
  progressExporting: (done: number, total: number) => string;
  progressDone: (count: number) => string;
}

const en: Messages = {
  buttonExport: "Export all chats",
  dialogTitle: "Export conversations",
  dialogHint: "Range is 1-based and inclusive. Leave “to” empty to export to the end.",
  attachmentsLabel: "Include attachments (images & files)",
  totalUnknown: "Total: unknown",
  totalCounting: (count) => `Total: ${count}…`,
  total: (count) => `Total: ${count}`,
  totalFailed: "Total: failed — see console",
  loadCount: "Load count",
  counting: "Counting…",
  retry: "Retry",
  rangeToPlaceholder: "end",
  cancel: "Cancel",
  export: "Export",
  invalidRange: "Invalid range: “from” must be ≥ 1 and “to” must be ≥ “from”.",
  unsupportedPage: "Unsupported page.",
  exportFailed: "Export failed — see console.",
  noConversations: "No conversations exported.",
  saved: (count) => `Saved ${count} conversations`,
  filesSaved: (count) => `+${count} files`,
  filesSkipped: (count) => `${count} files skipped`,
  failed: (count) => `${count} failed`,
  summarySuffix: ".",
  progressListing: (count) => `Listing conversations… (${count})`,
  progressFetching: (done, total, title) => `Fetching ${done}/${total}: ${title}`,
  progressAttachments: (done, total) => `Downloading files ${done}/${total}…`,
  progressExporting: (done, total) => `Exporting ${done}/${total}…`,
  progressDone: (count) => `Done — ${count} conversations.`,
};

const zhCN: Messages = {
  buttonExport: "导出全部对话",
  dialogTitle: "导出对话",
  dialogHint: "区间从 1 开始、含首尾。留空“到”表示导出到末尾。",
  attachmentsLabel: "包含附件（图片与文件）",
  totalUnknown: "总数：未知",
  totalCounting: (count) => `总数：${count}…`,
  total: (count) => `总数：${count}`,
  totalFailed: "总数获取失败——详见控制台",
  loadCount: "统计总数",
  counting: "统计中…",
  retry: "重试",
  rangeToPlaceholder: "末尾",
  cancel: "取消",
  export: "导出",
  invalidRange: "区间无效：“从”需 ≥ 1，且“到”需 ≥ “从”。",
  unsupportedPage: "当前页面不受支持。",
  exportFailed: "导出失败——详见控制台。",
  noConversations: "没有导出任何对话。",
  saved: (count) => `已保存 ${count} 个对话`,
  filesSaved: (count) => `+${count} 个文件`,
  filesSkipped: (count) => `${count} 个文件已跳过`,
  failed: (count) => `${count} 个失败`,
  summarySuffix: "。",
  progressListing: (count) => `正在列出对话…（${count}）`,
  progressFetching: (done, total, title) => `正在拉取 ${done}/${total}：${title}`,
  progressAttachments: (done, total) => `正在下载文件 ${done}/${total}…`,
  progressExporting: (done, total) => `正在导出 ${done}/${total}…`,
  progressDone: (count) => `完成——共 ${count} 个对话。`,
};

/** Message tables, exposed so tests can assert both locales stay in sync. */
export const dictionaries: Record<Locale, Messages> = { en, "zh-CN": zhCN };

/**
 * Picks the UI locale.
 *
 * Order: explicit override (`window.__ACE_LOCALE__`) → browser languages →
 * the host page's `<html lang>`. Anything Chinese (`zh`, `zh-CN`, `zh-TW`…)
 * resolves to the Simplified table, which is the right call for this audience:
 * a Traditional-Chinese reader still reads it more comfortably than English.
 */
export function detectLocale(): Locale {
  if (typeof window !== "undefined") {
    const override = (window as { __ACE_LOCALE__?: string }).__ACE_LOCALE__;
    if (override === "en" || override === "zh-CN") return override;
    if (override === "zh" || override?.startsWith("zh")) return "zh-CN";
  }
  if (typeof navigator !== "undefined") {
    // Follow the user's own preference order: the first language we support wins.
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const language of languages) {
      if (typeof language !== "string" || !language) continue;
      if (/^zh(\b|-|_)/i.test(language)) return "zh-CN";
      if (/^en(\b|-|_)/i.test(language)) return "en";
    }
  }
  if (typeof document !== "undefined") {
    const lang = document.documentElement.lang;
    if (typeof lang === "string" && /^zh/i.test(lang)) return "zh-CN";
  }
  return "en";
}

/** The message table for the detected (or given) locale. */
export function messages(locale: Locale = detectLocale()): Messages {
  return dictionaries[locale];
}

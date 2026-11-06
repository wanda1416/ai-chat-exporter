import { afterEach, describe, expect, it, vi } from "vitest";
import { detectLocale, dictionaries, messages, type Locale } from "../src/i18n.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("in-page i18n", () => {
  it("falls back to English when there is no environment at all", () => {
    // Node 24 exposes a real `navigator` carrying the OS locale, so blank it out.
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("window", undefined);
    expect(detectLocale()).toBe("en");
  });

  it("picks Simplified Chinese for any zh browser locale", () => {
    vi.stubGlobal("navigator", { languages: ["zh-CN", "en-US"], language: "zh-CN" });
    expect(detectLocale()).toBe("zh-CN");

    vi.stubGlobal("navigator", { languages: ["zh-Hant-TW"], language: "zh-Hant-TW" });
    expect(detectLocale()).toBe("zh-CN");
  });

  it("picks English for non-Chinese browsers", () => {
    vi.stubGlobal("navigator", { languages: ["en-US", "zh-CN"], language: "en-US" });
    expect(detectLocale()).toBe("en");
    vi.stubGlobal("navigator", { languages: ["ja-JP"], language: "ja-JP" });
    expect(detectLocale()).toBe("en");
  });

  it("reads the host page's lang when the browser exposes nothing useful", () => {
    vi.stubGlobal("navigator", { languages: [], language: "" });
    vi.stubGlobal("document", { documentElement: { lang: "zh-TW" } });
    expect(detectLocale()).toBe("zh-CN");
  });

  it("honours an explicit override", () => {
    vi.stubGlobal("window", { __ACE_LOCALE__: "en" });
    vi.stubGlobal("navigator", { languages: ["zh-CN"], language: "zh-CN" });
    expect(detectLocale()).toBe("en");

    vi.stubGlobal("window", { __ACE_LOCALE__: "zh" });
    vi.stubGlobal("navigator", { languages: ["en-US"], language: "en-US" });
    expect(detectLocale()).toBe("zh-CN");
  });

  it("keeps both locales structurally identical", () => {
    const locales = Object.keys(dictionaries) as Locale[];
    expect(locales).toEqual(["en", "zh-CN"]);

    const english = dictionaries.en;
    const chinese = dictionaries["zh-CN"];
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());

    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      const enValue = english[key];
      const zhValue = chinese[key];
      expect(typeof zhValue).toBe(typeof enValue);
      if (typeof enValue === "string") {
        expect(zhValue).not.toBe("");
      }
    }
  });

  it("translates the visible strings", () => {
    expect(messages("en").buttonExport).toBe("Export all chats");
    expect(messages("zh-CN").buttonExport).toBe("导出全部对话");
    expect(messages("zh-CN").progressFetching(2, 5, "标题")).toBe("正在拉取 2/5：标题");
    expect(messages("zh-CN").saved(3)).toBe("已保存 3 个对话");
  });
});

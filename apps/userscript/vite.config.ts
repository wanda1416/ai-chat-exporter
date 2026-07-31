import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import monkey from "vite-plugin-monkey";

/**
 * Tampermonkey's built-in ESLint flags the bundled fflate code (repeated
 * `var i` declarations) with `no-redeclare`. Insert an eslint-disable
 * comment right after the userscript header to silence editor warnings.
 */
function eslintDisableBanner(): Plugin {
  return {
    name: "eslint-disable-banner",
    writeBundle(options) {
      const dir = options.dir ?? "dist";
      for (const file of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
        if (!file.endsWith(".user.js")) continue;
        const path = join(dir, file);
        const code = readFileSync(path, "utf8");
        if (code.includes("/* eslint-disable */")) continue;
        writeFileSync(
          path,
          code.replace(/^\/\/ ==\/UserScript==$/m, "// ==/UserScript==\n\n/* eslint-disable */"),
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [
    eslintDisableBanner(),
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: {
          "": "AI Chat 全部对话导出 / Export All Chats (Kimi, Gemini, Grok, DeepSeek & ChatGPT)",
          "zh-CN": "AI Chat 全部对话导出（Kimi、Gemini、Grok、DeepSeek & ChatGPT）",
        },
        namespace: "https://github.com/wanda1416/ai-chat-exporter",
        author: "wanda1416",
        description: {
          "": "Batch-export your Kimi, Gemini, Grok, DeepSeek & ChatGPT conversations to Markdown + JSON, zipped. Pick a range, one click — runs entirely in your browser, no data sent anywhere.",
          "zh-CN": "一键批量导出 Kimi / Gemini / Grok / DeepSeek / ChatGPT 全部对话为 Markdown + JSON 并打包 zip。支持导出区间选择，纯本地运行，数据不离开浏览器。",
        },
        license: "MIT",
        homepageURL: "https://github.com/wanda1416/ai-chat-exporter",
        supportURL: "https://github.com/wanda1416/ai-chat-exporter/issues",
        downloadURL:
          "https://raw.githubusercontent.com/wanda1416/ai-chat-exporter/master/apps/userscript/dist/ai-chat-exporter.user.js",
        updateURL:
          "https://raw.githubusercontent.com/wanda1416/ai-chat-exporter/master/apps/userscript/dist/ai-chat-exporter.user.js",
        match: [
          "https://www.kimi.com/*",
          "https://gemini.google.com/*",
          "https://grok.com/*",
          "https://chat.deepseek.com/*",
          "https://chatgpt.com/*",
        ],
        grant: "none",
        "run-at": "document-idle",
      },
      build: {
        fileName: "ai-chat-exporter.user.js",
      },
    }),
  ],
});

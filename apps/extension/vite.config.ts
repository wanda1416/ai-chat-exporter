import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

/**
 * Emits the MV3 manifest alongside the bundle so `version` stays in sync
 * with package.json. The content script runs in the MAIN world: it needs
 * page-context state (Gemini's `window.WIZ_global_data` XSRF token) and
 * same-origin fetch with cookies — the exact environment the userscript
 * shell runs in. No chrome.* APIs are used, so no permissions are needed.
 */
function emitManifest(): Plugin {
  return {
    name: "emit-manifest",
    writeBundle(options) {
      const manifest = {
        manifest_version: 3,
        name: "AI Chat Exporter (Kimi, Gemini, Grok, DeepSeek & ChatGPT)",
        version: pkg.version,
        description:
          "Batch-export your Kimi, Gemini, Grok, DeepSeek & ChatGPT conversations to Markdown + JSON, zipped. Runs entirely in your browser.",
        homepage_url: "https://github.com/wanda1416/ai-chat-exporter",
        content_scripts: [
          {
            matches: [
              "https://www.kimi.com/*",
              "https://gemini.google.com/*",
              "https://grok.com/*",
              "https://chat.deepseek.com/*",
              "https://chatgpt.com/*",
            ],
            js: ["content.js"],
            world: "MAIN",
            run_at: "document_idle",
          },
        ],
      };
      writeFileSync(
        join(options.dir ?? "dist", "manifest.json"),
        JSON.stringify(manifest, null, 2) + "\n",
      );
    },
  };
}

export default defineConfig({
  plugins: [emitManifest()],
  build: {
    lib: {
      entry: "src/content.ts",
      formats: ["iife"],
      name: "AceExtension",
      fileName: () => "content.js",
    },
    // Content scripts cannot load source maps from the page; keep output plain.
    sourcemap: false,
    target: "es2022",
  },
});

import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "AI Chat Exporter — Kimi",
        namespace: "https://github.com/wanda1416/ai-chat-exporter",
        description: "Batch-export your Kimi conversations to Markdown + JSON, zipped.",
        match: ["https://www.kimi.com/*"],
        grant: "none",
        "run-at": "document-idle",
      },
    }),
  ],
});

import type { Exporter, ExportedFile } from "@ace/core";
import { conversationBaseName } from "@ace/core";
import type { Conversation } from "@ace/schema";
import { renderMarkdown } from "./render.js";

/** Markdown exporter — human-readable, one .md file per conversation. */
export function markdownExporter(): Exporter {
  return {
    id: "markdown",
    extension: "md",
    export(conversation: Conversation): ExportedFile {
      return {
        path: `${conversation.platform}/${conversationBaseName(conversation)}.md`,
        content: renderMarkdown(conversation),
        mimeType: "text/markdown",
      };
    },
  };
}

export { renderMarkdown } from "./render.js";

import type { Exporter, ExportedFile } from "@ace/core";
import { conversationBaseName } from "@ace/core";
import type { Conversation } from "@ace/schema";

/**
 * JSON exporter — emits the conversation verbatim in the standard schema.
 * This is the lossless format third-party tools should consume.
 */
export function jsonExporter(): Exporter {
  return {
    id: "json",
    extension: "json",
    export(conversation: Conversation): ExportedFile {
      return {
        path: `${conversation.platform}/${conversationBaseName(conversation)}.json`,
        content: JSON.stringify(conversation, null, 2) + "\n",
        mimeType: "application/json",
      };
    },
  };
}

import type { Conversation, ContentPart, Message } from "@ace/schema";

const ROLE_HEADING: Record<Message["role"], string> = {
  user: "🧑 User",
  assistant: "🤖 Assistant",
  system: "⚙️ System",
};

function renderPart(part: ContentPart): string {
  switch (part.type) {
    case "text":
      return part.text;
    case "code":
      return "```" + (part.language ?? "") + "\n" + part.code + "\n```";
    case "table": {
      const header = `| ${part.headers.join(" | ")} |`;
      const divider = `| ${part.headers.map(() => "---").join(" | ")} |`;
      const rows = part.rows.map((row) => `| ${row.join(" | ")} |`);
      return [header, divider, ...rows].join("\n");
    }
    case "image":
      return `![${part.alt ?? ""}](${part.url ?? part.attachmentId ?? ""})`;
    case "file":
      return `📎 [${part.name ?? part.attachmentId}](${part.attachmentId})`;
  }
}

/**
 * Renders a single message, or `null` when it carries nothing to show.
 * Kimi's conversation tree includes an all-zero `system` root node with empty
 * `content`, no reasoning and no citations; rendering it would leave a bare,
 * dangling `## ⚙️ System` heading, so such empty messages are skipped.
 */
function renderMessage(message: Message): string | null {
  const blocks: string[] = [];

  if (message.reasoning) {
    blocks.push(
      "<details><summary>💭 Reasoning</summary>\n\n" + message.reasoning.content + "\n\n</details>",
    );
  }

  const body = message.content.map(renderPart).join("\n\n");
  if (body) blocks.push(body);

  if (message.citations?.length) {
    const items = message.citations.map((c, i) => {
      const label = c.title ?? c.url ?? `Source ${i + 1}`;
      return c.url ? `${i + 1}. [${label}](${c.url})` : `${i + 1}. ${label}`;
    });
    blocks.push("**Sources**\n\n" + items.join("\n"));
  }

  if (!blocks.length) return null;

  return [`## ${ROLE_HEADING[message.role]}`, ...blocks].join("\n\n");
}

/** Renders the full conversation to a Markdown document. */
export function renderMarkdown(conversation: Conversation): string {
  const metaBits = [
    `Platform: ${conversation.platform}`,
    conversation.model ? `Model: ${conversation.model}` : null,
    conversation.updatedAt ? `Updated: ${conversation.updatedAt}` : null,
  ].filter(Boolean);

  const parts: string[] = [`# ${conversation.title || conversation.id}`];
  if (metaBits.length) parts.push(`> ${metaBits.join(" · ")}`);
  for (const message of conversation.messages) {
    const rendered = renderMessage(message);
    if (rendered) parts.push(rendered);
  }

  if (conversation.attachments?.length) {
    const items = conversation.attachments.map((a) => {
      const label = a.name ?? a.id;
      return a.url ? `- [${label}](${a.url})` : `- ${label}`;
    });
    parts.push("## Attachments\n\n" + items.join("\n"));
  }

  return parts.join("\n\n") + "\n";
}

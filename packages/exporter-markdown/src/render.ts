import type { Attachment, Conversation, ContentPart, Message } from "@ace/schema";

const ROLE_HEADING: Record<Message["role"], string> = {
  user: "🧑 User",
  assistant: "🤖 Assistant",
  system: "⚙️ System",
};

/** Resolution context: platform (for relative paths) + attachments by id. */
interface RenderContext {
  platform: string;
  attachments: Map<string, Attachment>;
}

/**
 * Href for an attachment's downloaded bytes, relative to the Markdown file.
 * MD lives at `<platform>/markdown/x.md`, bytes at `<platform>/attachments/…`,
 * so a sibling-folder hop (`../attachments/…`) keeps links working offline.
 */
function localHref(attachment: Attachment | undefined, platform: string): string | undefined {
  const localPath = attachment?.localPath;
  if (!localPath) return undefined;
  const prefix = `${platform}/`;
  return localPath.startsWith(prefix) ? `../${localPath.slice(prefix.length)}` : localPath;
}

function renderPart(part: ContentPart, context: RenderContext): string {
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
    case "image": {
      const attachment = part.attachmentId ? context.attachments.get(part.attachmentId) : undefined;
      const href =
        localHref(attachment, context.platform) ??
        part.url ??
        attachment?.url ??
        part.attachmentId ??
        "";
      return `![${part.alt ?? ""}](${href})`;
    }
    case "file": {
      const attachment = context.attachments.get(part.attachmentId);
      const href = localHref(attachment, context.platform) ?? attachment?.url ?? part.attachmentId;
      return `📎 [${part.name ?? attachment?.name ?? part.attachmentId}](${href})`;
    }
  }
}

/**
 * Renders a single message, or `null` when it carries nothing to show.
 * Kimi's conversation tree includes an all-zero `system` root node with empty
 * `content`, no reasoning and no citations; rendering it would leave a bare,
 * dangling `## ⚙️ System` heading, so such empty messages are skipped.
 */
function renderMessage(message: Message, context: RenderContext): string | null {
  const blocks: string[] = [];

  if (message.reasoning) {
    blocks.push(
      "<details><summary>💭 Reasoning</summary>\n\n" + message.reasoning.content + "\n\n</details>",
    );
  }

  const body = message.content.map((part) => renderPart(part, context)).join("\n\n");
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
  const context: RenderContext = {
    platform: conversation.platform,
    attachments: new Map((conversation.attachments ?? []).map((a) => [a.id, a])),
  };
  for (const message of conversation.messages) {
    const rendered = renderMessage(message, context);
    if (rendered) parts.push(rendered);
  }

  if (conversation.attachments?.length) {
    const items = conversation.attachments.map((a) => {
      const label = a.name ?? a.id;
      const href = localHref(a, conversation.platform) ?? a.url;
      return href ? `- [${label}](${href})` : `- ${label}`;
    });
    parts.push("## Attachments\n\n" + items.join("\n"));
  }

  return parts.join("\n\n") + "\n";
}

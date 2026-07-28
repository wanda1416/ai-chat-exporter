import type { Conversation } from "@ace/schema";

/** Turns arbitrary text into a filesystem-safe slug. */
export function slugify(input: string, fallback = "untitled"): string {
  const slug = input
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]+/g, " ") // characters illegal in paths
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

/**
 * Builds a stable, human-readable base name (no extension) for a conversation,
 * e.g. "2024-01-15-project-kickoff". Exporters append their own extension and
 * the pipeline groups them under the platform folder.
 */
export function conversationBaseName(conversation: Conversation): string {
  const date = (conversation.createdAt ?? conversation.updatedAt ?? "").slice(0, 10);
  const title = slugify(conversation.title, conversation.id);
  return date ? `${date}-${title}` : title;
}

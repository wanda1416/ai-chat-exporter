import type { Conversation, ConversationMeta } from "@ace/schema";
import type { PlatformAdapter } from "@ace/core";
import { DeepSeekClient, type DeepSeekClientOptions } from "./client.js";
import { hasMore, lastSeqId, parseConversationList, PLATFORM, toConversation } from "./parse.js";

const MAX_PAGES = 1000; // safety valve against a mis-parsed cursor looping forever

/**
 * DeepSeek adapter (chat.deepseek.com). Enumerates chats via the paginated
 * fetch_page listing and fetches each conversation via history_messages (a
 * single call returning every message).
 *
 * The API is clean REST/JSON with Bearer auth — the token is read from
 * localStorage.userToken (see docs/blueprint.md §12). Messages form a tree
 * (`parent_id`) with edit/regenerate branches; the adapter emits only the
 * active path (from `current_message_id`). Reasoning traces (`thinking_content`)
 * map to the standard reasoning field.
 */
export class DeepSeekAdapter implements PlatformAdapter {
  readonly platform = PLATFORM;
  private readonly client: DeepSeekClient;
  private readonly metaCache = new Map<string, ConversationMeta>();

  constructor(options: DeepSeekClientOptions = {}) {
    this.client = new DeepSeekClient(options);
  }

  detect(): boolean {
    if (typeof location === "undefined") return false;
    return /(^|\.)chat\.deepseek\.com$/.test(location.hostname);
  }

  async *listConversations(): AsyncIterable<ConversationMeta> {
    let beforeSeqId: number | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.client.fetchPage(beforeSeqId);
      const metas = parseConversationList(data);
      for (const meta of metas) {
        this.metaCache.set(meta.id, meta);
        yield meta;
      }
      if (!hasMore(data) || metas.length === 0) break;
      const next = lastSeqId(data);
      if (next === undefined) break;
      beforeSeqId = next;
    }
  }

  async fetchConversation(id: string): Promise<Conversation> {
    const data = await this.client.historyMessages(id);
    const meta = this.metaCache.get(id);
    return toConversation(id, data, {
      title: meta?.title,
      createdAt: meta?.createdAt,
      updatedAt: meta?.updatedAt,
    });
  }
}

import type { Conversation, ConversationMeta } from "@ace/schema";
import type { PlatformAdapter } from "@ace/core";
import { ChatGPTClient, type ChatGPTClientOptions } from "./client.js";
import { nextOffset, parseConversationList, PLATFORM, toConversation } from "./parse.js";

const MAX_PAGES = 1000; // safety valve against a mis-parsed offset looping forever

/**
 * ChatGPT adapter (chatgpt.com). Enumerates chats via the offset/limit
 * conversations listing and fetches each conversation via the detail endpoint
 * (a single call returning the whole `mapping` tree).
 *
 * The API is clean REST/JSON with Bearer auth — the token comes from
 * /api/auth/session (see docs/blueprint.md §13). Messages form a tree
 * (`mapping` + `current_node`) with edit/regenerate branches and interleaved
 * system/tool nodes; the adapter emits only the visible active path.
 */
export class ChatGPTAdapter implements PlatformAdapter {
  readonly platform = PLATFORM;
  private readonly client: ChatGPTClient;
  private readonly metaCache = new Map<string, ConversationMeta>();

  constructor(options: ChatGPTClientOptions = {}) {
    this.client = new ChatGPTClient(options);
  }

  detect(): boolean {
    if (typeof location === "undefined") return false;
    return /(^|\.)chatgpt\.com$/.test(location.hostname);
  }

  async *listConversations(): AsyncIterable<ConversationMeta> {
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.client.listPage(offset);
      const metas = parseConversationList(data);
      for (const meta of metas) {
        this.metaCache.set(meta.id, meta);
        yield meta;
      }
      const next = nextOffset(data);
      if (next === undefined) break;
      offset = next;
    }
  }

  async fetchConversation(id: string): Promise<Conversation> {
    const data = await this.client.conversationDetail(id);
    const meta = this.metaCache.get(id);
    return toConversation(id, data, {
      title: meta?.title,
      createdAt: meta?.createdAt,
      updatedAt: meta?.updatedAt,
    });
  }
}

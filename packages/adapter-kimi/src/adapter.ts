import type { Conversation, ConversationMeta } from "@ace/schema";
import type { PlatformAdapter } from "@ace/core";
import { KimiClient, type KimiClientOptions } from "./client.js";
import { PLATFORM, parseFeeds, toConversation } from "./parse.js";

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGES = 1000; // safety valve against a mis-parsed token looping forever

/**
 * Kimi adapter. Enumerates chats via FeedService/ListFeeds and fetches each as
 * the standard schema via ChatService GetChat + ListMessages.
 *
 * ListFeeds pages with `page_token` / `nextPageToken` (verified against a live
 * capture — see docs/blueprint.md §8).
 */
export class KimiAdapter implements PlatformAdapter {
  readonly platform = PLATFORM;
  private readonly client: KimiClient;

  constructor(options: KimiClientOptions = {}) {
    this.client = new KimiClient(options);
  }

  detect(): boolean {
    if (typeof location === "undefined") return false;
    return /(^|\.)kimi\.com$/.test(location.hostname);
  }

  async *listConversations(): AsyncIterable<ConversationMeta> {
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await this.client.listFeeds({
        page_size: DEFAULT_PAGE_SIZE,
        filter_types: ["FEED_TYPE_CHAT", "FEED_TYPE_TASK"],
        include_pinned: true,
        ...(pageToken ? { page_token: pageToken } : {}),
      });

      const metas = parseFeeds(response);
      for (const meta of metas) yield meta;

      pageToken = response.nextPageToken;
      if (!pageToken || metas.length === 0) break;
    }
  }

  async fetchConversation(id: string): Promise<Conversation> {
    const [chat, messages] = await Promise.all([
      this.client.getChat(id),
      this.client.listMessages(id),
    ]);
    return toConversation(id, chat, messages);
  }
}

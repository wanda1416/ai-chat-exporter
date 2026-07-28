import type { Conversation, ConversationMeta } from "@ace/schema";
import type { PlatformAdapter } from "@ace/core";
import { GeminiClient, type GeminiClientOptions } from "./client.js";
import { nextPageToken, parseConversationList, PLATFORM, toConversation } from "./parse.js";

const MAX_PAGES = 1000; // safety valve against a mis-parsed token looping forever

/**
 * Gemini adapter. Enumerates chats via the `MaZiqc` batchexecute RPC and
 * fetches each conversation via `hNvQHb`.
 *
 * There is no clean JSON API: both calls speak Google's `batchexecute`
 * protocol and return deeply nested positional arrays (see docs/blueprint.md
 * §9). Titles are only exposed in the list, so they are carried over into the
 * fetched Conversation when available.
 */
export class GeminiAdapter implements PlatformAdapter {
  readonly platform = PLATFORM;
  private readonly client: GeminiClient;
  private readonly titles = new Map<string, string>();

  constructor(options: GeminiClientOptions = {}) {
    this.client = new GeminiClient(options);
  }

  detect(): boolean {
    if (typeof location === "undefined") return false;
    return /(^|\.)gemini\.google\.com$/.test(location.hostname);
  }

  async *listConversations(): AsyncIterable<ConversationMeta> {
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const payload = await this.client.listConversations(pageToken);
      const metas = parseConversationList(payload);
      for (const meta of metas) {
        this.titles.set(meta.id, meta.title);
        yield meta;
      }
      pageToken = nextPageToken(payload);
      if (!pageToken || metas.length === 0) break;
    }
  }

  async fetchConversation(id: string): Promise<Conversation> {
    const payload = await this.client.getConversation(id);
    return toConversation(id, payload, this.titles.get(id));
  }
}

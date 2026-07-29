import type { Conversation, ConversationMeta } from "@ace/schema";
import type { PlatformAdapter } from "@ace/core";
import { GeminiClient, type GeminiClientOptions } from "./client.js";
import {
  detailNextPageToken,
  detailTurns,
  nextPageToken,
  parseConversationList,
  PLATFORM,
  toConversation,
  turnResponseId,
} from "./parse.js";
import type { Json } from "./types.js";

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
    // The detail RPC paginates like the list: one page is newest-first turns,
    // payload[1] is the continuation token into older turns. Walk every page
    // so long conversations export in full, deduping by turn response id in
    // case pages overlap. Turns are reassembled into one payload-shaped array
    // and handed to `toConversation`, which sorts them oldest-first.
    const allTurns: unknown[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const payload = await this.client.getConversation(id, pageToken);
      const turns = detailTurns(payload);
      for (const turn of turns) {
        const key = turnResponseId(turn);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        allTurns.push(turn);
      }
      pageToken = detailNextPageToken(payload);
      if (!pageToken || turns.length === 0) break;
    }

    const combined: Json = [allTurns as Json, null, null, []];
    return toConversation(id, combined, this.titles.get(id));
  }
}

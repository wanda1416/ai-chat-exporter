import type { Conversation, ConversationMeta } from "@ace/schema";
import type { PlatformAdapter } from "@ace/core";
import { GrokClient, type GrokClientOptions } from "./client.js";
import { nextPageToken, parseConversationList, PLATFORM, toConversation } from "./parse.js";

const MAX_PAGES = 1000; // safety valve against a mis-parsed token looping forever

/**
 * Grok adapter (grok.com). Enumerates chats via the REST listing endpoint and
 * fetches each conversation via response-node (the ordered tree skeleton) +
 * load-responses (the message content).
 *
 * The API is clean REST/JSON with cookie auth — no token plumbing needed (see
 * docs/blueprint.md §11). Messages form a tree (`parentResponseId`), so the
 * adapter emits parentId/childrenIds like Kimi. Titles live only in the
 * listing, so they are carried over into the fetched Conversation.
 */
export class GrokAdapter implements PlatformAdapter {
  readonly platform = PLATFORM;
  private readonly client: GrokClient;
  private readonly metaCache = new Map<string, ConversationMeta>();

  constructor(options: GrokClientOptions = {}) {
    this.client = new GrokClient(options);
  }

  detect(): boolean {
    if (typeof location === "undefined") return false;
    return /(^|\.)grok\.com$/.test(location.hostname);
  }

  async *listConversations(): AsyncIterable<ConversationMeta> {
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await this.client.listConversations(pageToken);
      const metas = parseConversationList(response);
      for (const meta of metas) {
        this.metaCache.set(meta.id, meta);
        yield meta;
      }
      pageToken = nextPageToken(response);
      if (!pageToken || metas.length === 0) break;
    }
  }

  async fetchConversation(id: string): Promise<Conversation> {
    const nodes = await this.client.responseNodes(id);
    const responseIds = (nodes.responseNodes ?? [])
      .map((n) => n.responseId)
      .filter((rid): rid is string => Boolean(rid));
    const loaded = responseIds.length
      ? await this.client.loadResponses(id, responseIds)
      : { responses: [] };

    const meta = this.metaCache.get(id);
    return toConversation(id, nodes, loaded, {
      title: meta?.title,
      createdAt: meta?.createdAt,
      updatedAt: meta?.updatedAt,
    });
  }
}

import type { Conversation, ConversationMeta } from "@ace/schema";
import type { PlatformAdapter } from "@ace/core";
import { YuanbaoClient, type YuanbaoClientOptions } from "./client.js";
import {
  agentIdFromPath,
  DEFAULT_AGENT_ID,
  nextListCursor,
  parseConversationList,
  PLATFORM,
  toConversation,
} from "./parse.js";
import type { ConversationDetailResponse } from "./types.js";

const MAX_PAGES = 500; // safety valve against a non-decreasing listing cursor
const MAX_DETAIL_PAGES = 50; // long threads are walked backwards from the newest turn

export interface YuanbaoAdapterOptions extends YuanbaoClientOptions {
  /** Overrides the agent id detected from the URL (custom Yuanbao agents). */
  agentId?: string;
}

/**
 * Tencent Yuanbao adapter (yuanbao.tencent.com). Enumerates history via the
 * agent conversation listing and fetches each thread via the conversation
 * detail endpoint, paging backwards for long conversations.
 *
 * Both endpoints are cookie-authenticated POSTs served from the same origin, so
 * the pipeline's throttle (500 ms by default) doubles as anti-bot pacing — the
 * platform flags scripted bursts. See docs/blueprint.md §14.
 */
export class YuanbaoAdapter implements PlatformAdapter {
  readonly platform = PLATFORM;
  private readonly client: YuanbaoClient;
  private readonly explicitAgentId: string | undefined;
  private readonly metaCache = new Map<string, ConversationMeta>();

  constructor(options: YuanbaoAdapterOptions = {}) {
    this.client = new YuanbaoClient(options);
    this.explicitAgentId = options.agentId;
  }

  detect(): boolean {
    if (typeof location === "undefined") return false;
    return /(^|\.)yuanbao\.tencent\.com$/.test(location.hostname);
  }

  /** The agent whose history is exported: explicit → URL → the default agent. */
  private agentId(): string {
    if (this.explicitAgentId) return this.explicitAgentId;
    if (typeof location !== "undefined") {
      const fromUrl = agentIdFromPath(location.pathname);
      if (fromUrl) return fromUrl;
    }
    return DEFAULT_AGENT_ID;
  }

  async *listConversations(): AsyncIterable<ConversationMeta> {
    const agentId = this.agentId();
    const seen = new Set<string>();
    let cursor = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await this.client.listConversations(agentId, cursor);
      const metas = parseConversationList(response);
      if (!metas.length) break;

      for (const meta of metas) {
        if (seen.has(meta.id)) continue;
        seen.add(meta.id);
        this.metaCache.set(meta.id, meta);
        yield meta;
      }

      const next = nextListCursor(response);
      if (next === undefined || next <= 0) break;
      // The cursor must strictly decrease; anything else would loop forever.
      if (cursor !== 0 && next >= cursor) break;
      cursor = next;
    }
  }

  async fetchConversation(id: string): Promise<Conversation> {
    const agentId = this.agentId();
    const pages: ConversationDetailResponse[] = [];
    let offset = 0;

    for (let page = 0; page < MAX_DETAIL_PAGES; page++) {
      const detail = await this.client.conversationDetail(id, agentId, offset);
      pages.push(detail);
      const turns = detail.convs ?? [];
      if (!detail.hasMore || !turns.length) break;
      const oldestIndex = Math.min(
        ...turns.map((turn) => turn.index ?? Number.POSITIVE_INFINITY),
      );
      // `offset` returns turns older than that index, so it must keep shrinking.
      if (!Number.isFinite(oldestIndex) || oldestIndex <= 0 || oldestIndex <= offset) break;
      offset = oldestIndex;
    }

    const meta = this.metaCache.get(id);
    return toConversation(pages, {
      id,
      agentId,
      ...(meta?.title !== undefined ? { title: meta.title } : {}),
      ...(meta?.createdAt !== undefined ? { createdAt: meta.createdAt } : {}),
      ...(meta?.updatedAt !== undefined ? { updatedAt: meta.updatedAt } : {}),
    });
  }
}

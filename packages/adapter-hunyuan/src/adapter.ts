import type { Conversation, ConversationMeta } from "@ace/schema";
import type { PlatformAdapter } from "@ace/core";
import { HunyuanClient, type HunyuanClientOptions } from "./client.js";
import {
  agentIdFromPath,
  DEFAULT_AGENT_ID,
  hasMorePages,
  orderedTurns,
  parseConversationList,
  PLATFORM,
  toConversation,
} from "./parse.js";
import type { ConversationDetailResponse } from "./types.js";

const MAX_PAGES = 500; // safety valve against a non-advancing offset
const MAX_DETAIL_PAGES = 50; // long threads are walked backwards from the newest turn

export interface HunyuanAdapterOptions extends HunyuanClientOptions {
  /** Overrides the agent id detected from the URL. */
  agentId?: string;
}

/** Everything the listing knows that the detail endpoint does not return. */
interface CachedMeta extends ConversationMeta {
  chatModelId?: string;
  agentId?: string;
}

/**
 * Tencent Hunyuan AI Studio adapter (aistudio.tencent.com).
 *
 * Listing is offset/limit over `POST /chat/conversation/list`; the detail
 * endpoint (`POST /user/agent/conversation/v1/detail`) returns turns
 * newest-first and pages backwards using `offset` = smallest loaded index plus
 * `lastId` = that turn's `chatRecordId` (read from the web bundle's load-more
 * call, since a short account history never exercises it).
 *
 * The API sits on api.hunyuan.tencent.com and is called cross-origin with
 * cookies; the page's own CORS setup makes that work from the userscript /
 * extension context too. See docs/blueprint.md §15.
 */
export class HunyuanAdapter implements PlatformAdapter {
  readonly platform = PLATFORM;
  private readonly client: HunyuanClient;
  private readonly explicitAgentId: string | undefined;
  private readonly metaCache = new Map<string, CachedMeta>();

  constructor(options: HunyuanAdapterOptions = {}) {
    this.client = new HunyuanClient(options);
    this.explicitAgentId = options.agentId;
  }

  detect(): boolean {
    if (typeof location === "undefined") return false;
    return /(^|\.)(aistudio|hunyuan)\.tencent\.com$/.test(location.hostname);
  }

  private agentId(fallback?: string): string {
    if (this.explicitAgentId) return this.explicitAgentId;
    if (fallback) return fallback;
    if (typeof location !== "undefined") {
      const fromUrl = agentIdFromPath(location.pathname);
      if (fromUrl) return fromUrl;
    }
    return DEFAULT_AGENT_ID;
  }

  async *listConversations(): AsyncIterable<ConversationMeta> {
    const seen = new Set<string>();
    let offset = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await this.client.listConversations(offset);
      const pageSize = response.data?.length ?? 0;
      const metas = parseConversationList(response);

      let yielded = 0;
      for (const meta of metas) {
        if (seen.has(meta.id)) continue;
        seen.add(meta.id);
        yielded += 1;
        const source =
          response.data?.find((item) => item.id === meta.id) ??
          response.pinnedData?.find((item) => item.id === meta.id);
        this.metaCache.set(meta.id, {
          ...meta,
          ...(source?.chatModelId ? { chatModelId: source.chatModelId } : {}),
          ...(source?.agentId ? { agentId: source.agentId } : {}),
        });
        yield meta;
      }

      // A page that adds nothing new means the server stopped advancing.
      if (pageSize === 0 || yielded === 0 || !hasMorePages(response, offset)) break;
      offset += pageSize;
    }
  }

  async fetchConversation(id: string): Promise<Conversation> {
    const meta = this.metaCache.get(id);
    const agentId = this.agentId(meta?.agentId);
    const pages: ConversationDetailResponse[] = [];

    let offset = 0;
    let lastId: string | undefined;

    for (let page = 0; page < MAX_DETAIL_PAGES; page++) {
      const detail = await this.client.conversationDetail({
        conversationId: id,
        offset,
        ...(lastId ? { lastId } : {}),
        ...(meta?.chatModelId ? { chatModelId: meta.chatModelId } : {}),
        agentId,
      });
      pages.push(detail);

      const turns = detail.convs ?? [];
      if (!detail.hasMore || !turns.length) break;

      const oldest = orderedTurns(turns)[0];
      const nextOffset = oldest?.index ?? 0;
      const nextLastId = oldest?.chatRecordId;
      // Without a cursor the server cannot page back; stop rather than loop.
      const stalled = offset !== 0 && nextOffset >= offset;
      if (!nextLastId || nextOffset <= 0 || stalled) break;
      offset = nextOffset;
      lastId = nextLastId;
    }

    return toConversation(pages, {
      id,
      agentId,
      ...(meta?.title !== undefined ? { title: meta.title } : {}),
      ...(meta?.createdAt !== undefined ? { createdAt: meta.createdAt } : {}),
      ...(meta?.updatedAt !== undefined ? { updatedAt: meta.updatedAt } : {}),
      ...(meta?.chatModelId !== undefined ? { chatModelId: meta.chatModelId } : {}),
    });
  }
}

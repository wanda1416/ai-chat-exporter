import type { ConversationDetailResponse, ListConversationsResponse } from "./types.js";

/**
 * The API lives on its own host, not the page's: aistudio.tencent.com calls
 * api.hunyuan.tencent.com cross-origin with cookies and CORS allows it. Keep
 * this in sync if Tencent moves the gateway.
 */
const BASE_URL = "https://api.hunyuan.tencent.com/api/new-portal";
const DEFAULT_PAGE_SIZE = 40;
const DEFAULT_DETAIL_LIMIT = 40;

export interface HunyuanClientOptions {
  /** fetch implementation. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Page size for the conversation listing. Defaults to 40 (what the web UI uses). */
  pageSize?: number;
  /** Turns requested per detail call. Defaults to 40. */
  detailLimit?: number;
}

/** Parameters the detail endpoint accepts when walking backwards. */
export interface DetailParams {
  conversationId: string;
  /** 0 for the newest window; otherwise the smallest index already loaded. */
  offset?: number;
  /** `chatRecordId` of the oldest loaded turn — the server's continuation key. */
  lastId?: string;
  chatModelId?: string;
  agentId?: string;
}

/**
 * Thin JSON client for the two export endpoints. Auth is cookie-based and
 * cross-origin from aistudio.tencent.com; `x-source`/`x-requested-with` are sent
 * by the web UI but are not required (verified: the detail endpoint answers 200
 * without them).
 */
export class HunyuanClient {
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly detailLimit: number;

  constructor(options: HunyuanClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.detailLimit = options.detailLimit ?? DEFAULT_DETAIL_LIMIT;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/plain, */*",
        "x-source": "web",
        "x-requested-with": "XMLHttpRequest",
      },
      body: JSON.stringify(body ?? {}),
    });
    if (!response.ok) {
      throw new Error(`Hunyuan POST ${path} failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  /** One page of history. `offset` counts conversations, newest first. */
  listConversations(offset = 0): Promise<ListConversationsResponse> {
    return this.post<ListConversationsResponse>("/chat/conversation/list", {
      limit: this.pageSize,
      offset,
      modelTag: "all",
    });
  }

  /** One window of turns for a conversation. */
  conversationDetail(params: DetailParams): Promise<ConversationDetailResponse> {
    const body: Record<string, unknown> = {
      conversationId: params.conversationId,
      offset: params.offset ?? 0,
      limit: this.detailLimit,
    };
    if (params.lastId) body.lastId = params.lastId;
    if (params.chatModelId) body.chatModelId = params.chatModelId;
    if (params.agentId) body.agentId = params.agentId;
    return this.post<ConversationDetailResponse>(
      "/user/agent/conversation/v1/detail",
      body,
    );
  }
}

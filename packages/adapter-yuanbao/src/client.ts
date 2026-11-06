import type { ConversationDetailResponse, ListConversationsResponse } from "./types.js";

const BASE_URL = "https://yuanbao.tencent.com";
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_DETAIL_LIMIT = 50;

export interface YuanbaoClientOptions {
  /** fetch implementation. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Page size for the conversation listing. Defaults to 20. */
  pageSize?: number;
  /** Turns requested per detail call. Defaults to 50 (the API accepts 100). */
  detailLimit?: number;
}

/**
 * Thin JSON client for the two export endpoints. Auth is cookie-based: the
 * request must run in the logged-in yuanbao.tencent.com origin
 * (`credentials: "include"`), and no custom header or CSRF token is required.
 *
 * Verified 2026-11: same-origin POST with cookies is accepted for both
 * endpoints; the platform's anti-bot measures target scripted *volume*, so the
 * pipeline's throttle must stay enabled (see docs/blueprint.md §14).
 */
export class YuanbaoClient {
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly detailLimit: number;

  constructor(options: YuanbaoClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.detailLimit = options.detailLimit ?? DEFAULT_DETAIL_LIMIT;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    if (!response.ok) {
      throw new Error(`Yuanbao POST ${path} failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  /**
   * One page of the sidebar history, newest first. `lastRepliedAt` is the
   * cursor: 0 starts from the newest conversation, otherwise pass the smallest
   * `lastRepliedAt` of the previous page.
   */
  listConversations(agentId: string, lastRepliedAt = 0): Promise<ListConversationsResponse> {
    return this.post<ListConversationsResponse>("/api/user/agent/conversation/v3/list", {
      agent_id: agentId,
      page_size: this.pageSize,
      action: 1,
      last_replied_at: lastRepliedAt,
      top_time: 0,
    });
  }

  /**
   * One window of turns. `offset: 0` returns the newest `limit` turns; any
   * other `offset` returns the turns older than that index (verified semantics:
   * offset=4 → turns with index < 4), which is how long threads are walked.
   */
  conversationDetail(
    conversationId: string,
    agentId: string,
    offset = 0,
  ): Promise<ConversationDetailResponse> {
    return this.post<ConversationDetailResponse>("/api/user/agent/conversation/v1/detail", {
      conversationId,
      offset,
      limit: this.detailLimit,
      agentId,
    });
  }
}

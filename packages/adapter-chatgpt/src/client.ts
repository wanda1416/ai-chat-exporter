import type { ConversationDetail, ConversationsPage, SessionData } from "./types.js";

const BASE_URL = "https://chatgpt.com";
const DEFAULT_PAGE_SIZE = 28;

export interface ChatGPTClientOptions {
  /** fetch implementation. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Page size for the listing endpoint. Defaults to 28 (the web app's size). */
  pageSize?: number;
  /**
   * Bearer token override. When omitted, the token is read from
   * `GET /api/auth/session` (`accessToken`) — the same source the web app uses.
   */
  token?: string;
}

/**
 * Thin REST/JSON client for the listing and detail endpoints. Auth is a Bearer
 * token fetched from `/api/auth/session` (memoised for the run); requests run
 * in the logged-in chatgpt.com origin with `credentials: include`. Responses
 * are plain JSON (no envelope). See docs/blueprint.md §13.
 */
export class ChatGPTClient {
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly explicitToken?: string;
  private cachedToken?: string;

  constructor(options: ChatGPTClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.explicitToken = options.token;
  }

  /** Resolves the Bearer token from the override or the session endpoint. */
  private async token(): Promise<string | undefined> {
    if (this.explicitToken) return this.explicitToken;
    if (this.cachedToken) return this.cachedToken;
    try {
      const response = await this.fetchImpl(`${BASE_URL}/api/auth/session`, {
        method: "GET",
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (!response.ok) return undefined;
      const session = (await response.json()) as SessionData;
      this.cachedToken = session.accessToken || undefined;
      return this.cachedToken;
    } catch {
      return undefined;
    }
  }

  private async get<T>(path: string): Promise<T> {
    const token = await this.token();
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await this.fetchImpl(`${BASE_URL}${path}`, {
      method: "GET",
      credentials: "include",
      headers,
    });
    if (!response.ok) {
      throw new Error(`ChatGPT GET ${path} failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  /** One page of the sidebar history, starting at `offset`. */
  listPage(offset: number): Promise<ConversationsPage> {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(this.pageSize),
      order: "updated",
    });
    return this.get<ConversationsPage>(`/backend-api/conversations?${params.toString()}`);
  }

  /** The full mapping tree for a conversation (all branches, one round-trip). */
  conversationDetail(id: string): Promise<ConversationDetail> {
    return this.get<ConversationDetail>(`/backend-api/conversation/${encodeURIComponent(id)}`);
  }
}

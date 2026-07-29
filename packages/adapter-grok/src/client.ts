import type {
  ListConversationsResponse,
  LoadResponsesResponse,
  ResponseNodeResponse,
} from "./types.js";

const BASE_URL = "https://grok.com/rest/";
const DEFAULT_PAGE_SIZE = 30;

export interface GrokClientOptions {
  /** fetch implementation. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Page size for the listing endpoint. Defaults to 30. */
  pageSize?: number;
}

/**
 * Thin REST/JSON client for the three export endpoints. Auth is cookie-based
 * (the request must run in the logged-in grok.com origin, `credentials:
 * include`) — no Bearer token or custom header is required. See
 * docs/blueprint.md §11.
 */
export class GrokClient {
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;

  constructor(options: GrokClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${BASE_URL}${path}`, {
      method: "GET",
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Grok GET ${path} failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${BASE_URL}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    if (!response.ok) {
      throw new Error(`Grok POST ${path} failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  /** One page of the sidebar history. `pageToken` continues a previous page. */
  listConversations(pageToken?: string): Promise<ListConversationsResponse> {
    const params = new URLSearchParams({ pageSize: String(this.pageSize) });
    if (pageToken) params.set("pageToken", pageToken);
    return this.get<ListConversationsResponse>(`app-chat/conversations?${params.toString()}`);
  }

  /** The ordered message-tree skeleton (ids + sender + parent, no content). */
  responseNodes(conversationId: string): Promise<ResponseNodeResponse> {
    return this.get<ResponseNodeResponse>(
      `app-chat/conversations/${conversationId}/response-node`,
    );
  }

  /** The full content for the given response ids (order is NOT preserved). */
  loadResponses(conversationId: string, responseIds: string[]): Promise<LoadResponsesResponse> {
    return this.post<LoadResponsesResponse>(
      `app-chat/conversations/${conversationId}/load-responses`,
      { responseIds },
    );
  }
}

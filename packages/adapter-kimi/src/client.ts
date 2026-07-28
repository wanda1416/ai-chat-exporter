import type {
  GetChatResponse,
  ListFeedsResponse,
  ListMessagesResponse,
} from "./types.js";

const BASE_URL = "https://www.kimi.com/apiv2/";
const FEED_SERVICE = "kimi.gateway.feed.v1.FeedService";
const CHAT_SERVICE = "kimi.gateway.chat.v1.ChatService";

export interface KimiClientOptions {
  /** fetch implementation. Defaults to the global `fetch` (window/undici). */
  fetchImpl?: typeof fetch;
  /** Bearer token. Defaults to `localStorage.access_token` (userscript case). */
  token?: string;
  /** Value for the `x-language` header. Defaults to "zh-CN". */
  language?: string;
}

export interface ListFeedsRequest {
  page_size?: number;
  project_id?: string;
  filter_types?: string[];
  include_pinned?: boolean;
  /** Pagination token echoed from a previous page's `nextPageToken`. */
  page_token?: string;
}

/**
 * Thin ConnectRPC/JSON client for the three export endpoints. Auth is a JWT
 * Bearer token (NOT a cookie) — see docs/blueprint.md §8.
 */
export class KimiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly language: string;
  private readonly explicitToken: string | undefined;

  constructor(options: KimiClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.language = options.language ?? "zh-CN";
    this.explicitToken = options.token;
  }

  private resolveToken(): string {
    const token =
      this.explicitToken ?? globalThis.localStorage?.getItem("access_token") ?? undefined;
    if (!token) {
      throw new Error(
        "Kimi access token not found. Provide `token` or run where localStorage.access_token is set.",
      );
    }
    return token;
  }

  private async call<T>(service: string, method: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${BASE_URL}${service}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.resolveToken()}`,
        "x-msh-platform": "web",
        "x-language": this.language,
      },
      body: JSON.stringify(body ?? {}),
    });
    if (!response.ok) {
      throw new Error(`Kimi ${service}/${method} failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  listFeeds(request: ListFeedsRequest): Promise<ListFeedsResponse> {
    return this.call<ListFeedsResponse>(FEED_SERVICE, "ListFeeds", request);
  }

  getChat(chatId: string): Promise<GetChatResponse> {
    return this.call<GetChatResponse>(CHAT_SERVICE, "GetChat", { chat_id: chatId });
  }

  listMessages(chatId: string): Promise<ListMessagesResponse> {
    return this.call<ListMessagesResponse>(CHAT_SERVICE, "ListMessages", { chat_id: chatId });
  }
}

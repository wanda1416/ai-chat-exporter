import type { DeepSeekEnvelope, FetchPageData, HistoryMessagesData } from "./types.js";

const BASE_URL = "https://chat.deepseek.com/api/v0/";
const DEFAULT_PAGE_SIZE = 100;

export interface DeepSeekClientOptions {
  /** fetch implementation. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Page size for the listing endpoint. Defaults to 100. */
  pageSize?: number;
  /**
   * Bearer token override. When omitted, the token is read from
   * `localStorage.userToken` (`{ value }`) — the same source the web app uses.
   */
  token?: string;
}

/**
 * Thin REST/JSON client for the two export endpoints. Auth is a Bearer token
 * (from localStorage.userToken.value) sent on every call; requests run in the
 * logged-in chat.deepseek.com origin with `credentials: include`. Every
 * response is the uniform `{ data: { biz_data } }` envelope, unwrapped here.
 * See docs/blueprint.md §12.
 */
export class DeepSeekClient {
  private readonly fetchImpl: typeof fetch;
  private readonly pageSize: number;
  private readonly explicitToken?: string;

  constructor(options: DeepSeekClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.explicitToken = options.token;
  }

  /** Resolves the Bearer token from the override or localStorage. */
  private token(): string | undefined {
    if (this.explicitToken) return this.explicitToken;
    try {
      const raw = globalThis.localStorage?.getItem("userToken");
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as { value?: string };
      return parsed?.value || undefined;
    } catch {
      return undefined;
    }
  }

  private async get<T>(path: string): Promise<T> {
    const token = this.token();
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await this.fetchImpl(`${BASE_URL}${path}`, {
      method: "GET",
      credentials: "include",
      headers,
    });
    if (!response.ok) {
      throw new Error(`DeepSeek GET ${path} failed: ${response.status} ${response.statusText}`);
    }
    const envelope = (await response.json()) as DeepSeekEnvelope<T>;
    if (envelope.code !== 0 || envelope.data?.biz_code !== 0) {
      throw new Error(`DeepSeek GET ${path} error: ${envelope.msg || envelope.data?.biz_msg || "unknown"}`);
    }
    return (envelope.data?.biz_data ?? ({} as T)) as T;
  }

  /** One page of the sidebar history. `beforeSeqId` continues a previous page. */
  fetchPage(beforeSeqId?: number): Promise<FetchPageData> {
    const params = new URLSearchParams({ count: String(this.pageSize) });
    if (beforeSeqId !== undefined) params.set("before_seq_id", String(beforeSeqId));
    return this.get<FetchPageData>(`chat_session/fetch_page?${params.toString()}`);
  }

  /** The full message set for a conversation (all branches, one round-trip). */
  historyMessages(chatSessionId: string): Promise<HistoryMessagesData> {
    const params = new URLSearchParams({ chat_session_id: chatSessionId });
    return this.get<HistoryMessagesData>(`chat/history_messages?${params.toString()}`);
  }
}

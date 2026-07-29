import { extractRpcPayload } from "./parse.js";
import { RPC_DETAIL, RPC_LIST, type Json } from "./types.js";

const BATCHEXECUTE_URL = "https://gemini.google.com/_/BardChatUi/data/batchexecute";
const LIST_PAGE_SIZE = 20;
// Turns per detail page. The web UI requests 10 (it lazy-loads older turns on
// scroll); an export wants whole conversations, so ask for far more per call.
const DETAIL_PAGE_SIZE = 100;

/**
 * Ambient shape of `window.WIZ_global_data`, the bootstrap blob Gemini injects
 * into the page. We only read the three tokens the RPC needs.
 */
interface WizGlobalData {
  /** XSRF token, sent as the `at` form field. */
  SNlM0e?: string;
  /** Backend release label, sent as the `bl` query param. */
  cfb2h?: string;
  /** Frontend session id, sent as the `f.sid` query param. */
  FdrFJe?: string;
}

export interface GeminiClientOptions {
  /** fetch implementation. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** XSRF token (`at`). Defaults to `window.WIZ_global_data.SNlM0e`. */
  atToken?: string;
  /** Backend release (`bl`). Defaults to `window.WIZ_global_data.cfb2h`. */
  blVersion?: string;
  /** Frontend session id (`f.sid`). Defaults to `window.WIZ_global_data.FdrFJe`. */
  fSid?: string;
  /** UI language (`hl`). Defaults to "en". */
  language?: string;
}

/**
 * Thin `batchexecute` client for the two export RPCs. Auth is cookie-based
 * (the request must run in the logged-in gemini.google.com origin), plus the
 * `at` XSRF token lifted from the page — see docs/blueprint.md §9.
 */
export class GeminiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly language: string;
  private readonly explicitAt: string | undefined;
  private readonly explicitBl: string | undefined;
  private readonly explicitSid: string | undefined;
  private reqId: number;

  constructor(options: GeminiClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.language = options.language ?? "en";
    this.explicitAt = options.atToken;
    this.explicitBl = options.blVersion;
    this.explicitSid = options.fSid;
    this.reqId = Math.floor(Math.random() * 90000) + 10000;
  }

  private get wiz(): WizGlobalData {
    return (globalThis as { WIZ_global_data?: WizGlobalData }).WIZ_global_data ?? {};
  }

  private resolveAt(): string {
    const at = this.explicitAt ?? this.wiz.SNlM0e;
    if (!at) {
      throw new Error(
        "Gemini `at` token not found. Provide `atToken` or run where window.WIZ_global_data is set.",
      );
    }
    return at;
  }

  private async call(rpcid: string, innerPayload: Json): Promise<Json> {
    const url = new URL(BATCHEXECUTE_URL);
    url.searchParams.set("rpcids", rpcid);
    url.searchParams.set("source-path", "/app");
    const bl = this.explicitBl ?? this.wiz.cfb2h;
    const sid = this.explicitSid ?? this.wiz.FdrFJe;
    if (bl) url.searchParams.set("bl", bl);
    if (sid) url.searchParams.set("f.sid", sid);
    url.searchParams.set("hl", this.language);
    url.searchParams.set("_reqid", String((this.reqId += 100000)));
    url.searchParams.set("rt", "c");

    const envelope = [[[rpcid, JSON.stringify(innerPayload), null, "generic"]]];
    const body =
      `f.req=${encodeURIComponent(JSON.stringify(envelope))}` +
      `&at=${encodeURIComponent(this.resolveAt())}&`;

    const response = await this.fetchImpl(url.toString(), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
    });
    if (!response.ok) {
      throw new Error(`Gemini ${rpcid} failed: ${response.status} ${response.statusText}`);
    }
    return extractRpcPayload(await response.text(), rpcid);
  }

  /** One page of the sidebar history. `pageToken` continues a previous page. */
  listConversations(pageToken?: string): Promise<Json> {
    return this.call(RPC_LIST, [LIST_PAGE_SIZE, pageToken ?? null, [0, null, 1]]);
  }

  /**
   * One page of a conversation's turns, newest-first. Accepts ids with or
   * without `c_`. `pageToken` continues into older turns (same continuation
   * mechanism as the list RPC; token surfaces at payload[1]).
   */
  getConversation(conversationId: string, pageToken?: string): Promise<Json> {
    const cid = conversationId.startsWith("c_") ? conversationId : `c_${conversationId}`;
    return this.call(RPC_DETAIL, [cid, DETAIL_PAGE_SIZE, pageToken ?? null, 1, [0], [4], null, 1]);
  }
}

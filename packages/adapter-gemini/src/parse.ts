import type {
  ContentPart,
  Conversation,
  ConversationMeta,
  Message,
} from "@ace/schema";
import type { Json } from "./types.js";

export const PLATFORM = "gemini";

// --- Defensive accessors for the positional batchexecute arrays -------------

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asString = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;
const at = (v: unknown, i: number): unknown => (Array.isArray(v) ? v[i] : undefined);

/** Converts a `[seconds, nanos]` tuple into an ISO 8601 string. */
function isoFromTuple(tuple: unknown): string | undefined {
  const seconds = at(tuple, 0);
  if (typeof seconds !== "number") return undefined;
  return new Date(seconds * 1000).toISOString();
}

/** Strips the `c_` id prefix Gemini uses internally, for building URLs. */
function bareId(id: string): string {
  return id.startsWith("c_") ? id.slice(2) : id;
}

/**
 * The model label (e.g. "3.6 Flash") is the trailing plain string of a turn's
 * candidates block, sitting just before a `null,null,1,1` tail. Message ids
 * (`rc_`/`r_`/`c_`/`m_`) also appear here, so scan from the end and take the
 * first string that is not one of those ids.
 */
function findModel(candidatesBlock: unknown): string | undefined {
  const arr = asArray(candidatesBlock);
  for (let i = arr.length - 1; i >= 0; i--) {
    const s = asString(arr[i]);
    if (s && !/^(rc_|r_|c_|m_)/.test(s)) return s;
  }
  return undefined;
}

// --- Extracting an RPC payload out of the anti-JSON envelope ----------------

/**
 * Pulls one RPC's decoded payload out of a raw `batchexecute` response body.
 *
 * The response starts with the `)]}'` anti-JSON guard and is a stream of
 * length-prefixed JSON chunks; the useful chunk is
 * `[["wrb.fr","<rpcid>","<inner payload as a JSON string>",...]]`. We tolerate
 * bad/absent length prefixes by trying to parse each line independently.
 */
export function extractRpcPayload(rawBody: string, rpcid: string): Json {
  const body = rawBody.replace(/^\)\]\}'\s*/, "");
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("[")) continue;
    let chunk: unknown;
    try {
      chunk = JSON.parse(trimmed);
    } catch {
      continue;
    }
    for (const entry of asArray(chunk)) {
      if (
        Array.isArray(entry) &&
        entry[0] === "wrb.fr" &&
        entry[1] === rpcid &&
        typeof entry[2] === "string"
      ) {
        return JSON.parse(entry[2]) as Json;
      }
    }
  }
  throw new Error(`Gemini batchexecute response had no "${rpcid}" payload.`);
}

// --- List (MaZiqc) ----------------------------------------------------------

/** Maps a decoded MaZiqc payload into standard listing entries. */
export function parseConversationList(payload: Json): ConversationMeta[] {
  const items = asArray(at(payload, 2));
  const metas: ConversationMeta[] = [];
  for (const item of items) {
    const id = asString(at(item, 0));
    if (!id) continue;
    const meta: ConversationMeta = {
      id,
      platform: PLATFORM,
      title: asString(at(item, 1)) ?? "",
    };
    const createdAt = isoFromTuple(at(item, 5));
    if (createdAt) meta.createdAt = createdAt;
    metas.push(meta);
  }
  return metas;
}

/** The opaque token for the next page, or undefined when the list ends. */
export function nextPageToken(payload: Json): string | undefined {
  return asString(at(payload, 1));
}

// --- Detail (hNvQHb) --------------------------------------------------------

/** The turn array of one detail page. */
export function detailTurns(payload: Json): unknown[] {
  return asArray(at(payload, 0));
}

/**
 * Continuation token for *older* turns, or undefined when the conversation is
 * fully loaded. Lives at payload[1], mirroring the list RPC.
 */
export function detailNextPageToken(payload: Json): string | undefined {
  return asString(at(payload, 1));
}

/** A turn's stable response id (turn[0][1]), used to dedupe across pages. */
export function turnResponseId(turn: unknown): string | undefined {
  return asString(at(at(turn, 0), 1));
}

/** A turn's timestamp (turn[4] = [seconds, nanos]) as a sortable number. */
function turnTime(turn: unknown): number | undefined {
  const seconds = at(at(turn, 4), 0);
  if (typeof seconds !== "number") return undefined;
  const nanos = at(at(turn, 4), 1);
  return seconds + (typeof nanos === "number" ? nanos / 1e9 : 0);
}

/** Reads the selected candidate's markdown text out of a turn. */
function selectedMarkdown(candidatesBlock: unknown): string {
  const candidates = asArray(at(candidatesBlock, 0));
  const selectedId = asString(at(candidatesBlock, 3));
  const chosen =
    candidates.find((c) => asString(at(c, 0)) === selectedId) ?? candidates[0];
  return asString(at(at(chosen, 1), 0)) ?? "";
}

/** Turns one conversation turn into a user message + an assistant message. */
function parseTurn(turn: unknown): Message[] {
  const messages: Message[] = [];

  const userText = asString(at(at(at(turn, 2), 0), 0));
  const userId = asString(at(at(turn, 2), 4));
  if (userText) {
    const content: ContentPart[] = [{ type: "text", text: userText }];
    messages.push({ id: userId ?? `${asString(at(at(turn, 0), 1)) ?? "turn"}-user`, role: "user", content });
  }

  const candidatesBlock = at(turn, 3);
  const markdown = selectedMarkdown(candidatesBlock);
  const assistantId = asString(at(candidatesBlock, 3));
  if (markdown || assistantId) {
    const content: ContentPart[] = markdown ? [{ type: "text", text: markdown }] : [];
    const message: Message = {
      id: assistantId ?? `${asString(at(at(turn, 0), 1)) ?? "turn"}-assistant`,
      role: "assistant",
      content,
    };
    const timestamp = isoFromTuple(at(turn, 4));
    if (timestamp) message.timestamp = timestamp;
    const model = findModel(candidatesBlock);
    if (model) message.model = model;
    messages.push(message);
  }

  return messages;
}

/**
 * Assembles the standard Conversation from a decoded hNvQHb payload.
 *
 * The detail RPC carries no title (Gemini only exposes it in the list), so the
 * title is derived from the first user prompt unless one is supplied.
 */
export function toConversation(
  conversationId: string,
  payload: Json,
  title?: string,
): Conversation {
  // Live pages arrive newest-first (the web UI renders the tail of a chat
  // first); an export reads top-down, so reorder turns oldest-first by their
  // timestamp. Turns without one keep their relative position (stable sort).
  const turns = [...detailTurns(payload)].sort((a, b) => {
    const ta = turnTime(a);
    const tb = turnTime(b);
    return ta !== undefined && tb !== undefined ? ta - tb : 0;
  });
  const messages = turns.flatMap(parseTurn);

  const firstUserText = messages.find((m) => m.role === "user")?.content.find(
    (part): part is Extract<ContentPart, { type: "text" }> => part.type === "text",
  )?.text;
  const derivedTitle = firstUserText
    ? firstUserText.slice(0, 40) + (firstUserText.length > 40 ? "…" : "")
    : "Gemini conversation";

  const conversation: Conversation = {
    schemaVersion: "1",
    id: conversationId,
    platform: PLATFORM,
    title: title ?? derivedTitle,
    messages,
  };

  const model = messages.find((m) => m.model)?.model;
  if (model) conversation.model = model;

  const timestamps = messages.map((m) => m.timestamp).filter((t): t is string => Boolean(t));
  if (timestamps.length) {
    conversation.createdAt = timestamps[0];
    conversation.updatedAt = timestamps[timestamps.length - 1];
  }

  conversation.sourceUrl = `https://gemini.google.com/app/${bareId(conversationId)}`;
  return conversation;
}

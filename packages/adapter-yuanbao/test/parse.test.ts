import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Conversation } from "@ace/schema";
import {
  agentIdFromPath,
  nextListCursor,
  parseConversationList,
  toConversation,
  toIsoTime,
} from "../src/parse.js";
import type { ConversationDetailResponse, ListConversationsResponse } from "../src/types.js";

function loadFixture<T>(name: string): T {
  const url = new URL(`../fixtures/yuanbao/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as T;
}

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "naQivTmsDa";

/** Both windows of the same thread, newest window first (as the API returns). */
function loadPages(): ConversationDetailResponse[] {
  return [
    loadFixture<ConversationDetailResponse>("detail-v1.json"),
    loadFixture<ConversationDetailResponse>("detail-v1-older.json"),
  ];
}

describe("yuanbao adapter parsing (golden fixtures)", () => {
  it("maps a listing page into conversation metadata", () => {
    const payload = loadFixture<ListConversationsResponse>("list-v3.json");
    expect(parseConversationList(payload)).toMatchInlineSnapshot(`
      [
        {
          "createdAt": "2026-03-20T01:35:00.000Z",
          "id": "00000000-0000-4000-8000-000000000001",
          "platform": "yuanbao",
          "title": "How do tides form?",
          "updatedAt": "2026-03-20T01:38:35.000Z",
        },
        {
          "createdAt": "2026-02-12T04:13:20.000Z",
          "id": "00000000-0000-4000-8000-000000000002",
          "platform": "yuanbao",
          "title": "Quicksort in Rust",
          "updatedAt": "2026-02-12T04:19:38.000Z",
        },
        {
          "createdAt": "2026-02-05T19:58:20.000Z",
          "id": "00000000-0000-4000-8000-000000000003",
          "platform": "yuanbao",
          "title": "Why do towels stiffen?",
          "updatedAt": "2026-02-05T19:59:48.000Z",
        },
      ]
    `);
  });

  it("derives the next listing cursor from the smallest lastRepliedAt", () => {
    const payload = loadFixture<ListConversationsResponse>("list-v3.json");
    expect(nextListCursor(payload)).toBe(1770321588);
    expect(nextListCursor({ data: { list: [] } })).toBeUndefined();
  });

  it("assembles a Conversation from both detail windows", () => {
    const conversation = toConversation(loadPages(), {
      id: CONVERSATION_ID,
      agentId: AGENT_ID,
      title: "How do tides form?",
    });
    expect(conversation).toMatchSnapshot();
  });

  it("produces a schema-valid Conversation", () => {
    const conversation = toConversation(loadPages(), { id: CONVERSATION_ID, agentId: AGENT_ID });
    expect(() => Conversation.parse(conversation)).not.toThrow();
  });

  it("orders turns oldest-first and dedupes the page overlap", () => {
    const pages = loadPages();
    // Duplicate one turn across the boundary, as a paged fetch can.
    const overlapping: ConversationDetailResponse[] = [
      pages[0]!,
      { ...pages[1]!, convs: [...(pages[1]!.convs ?? []), ...(pages[0]!.convs ?? [])] },
    ];
    const conversation = toConversation(overlapping, { id: CONVERSATION_ID, agentId: AGENT_ID });
    expect(conversation.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(conversation.messages.map((m) => m.id)).toEqual([
      `${CONVERSATION_ID}_1`,
      `${CONVERSATION_ID}_2`,
      `${CONVERSATION_ID}_3`,
      `${CONVERSATION_ID}_4`,
    ]);
  });

  it("maps think blocks to reasoning and searchGuid docs to citations", () => {
    const conversation = toConversation(loadPages(), { id: CONVERSATION_ID, agentId: AGENT_ID });
    const assistant = conversation.messages[1]!;

    expect(assistant.reasoning).toEqual({
      content: "The user asks about tides, so the Moon's gravity is the key driver.",
      summary: "已深度思考（用时16秒）",
    });
    expect(assistant.citations).toEqual([
      {
        title: "Understanding Tides",
        url: "https://example.com/tides",
        snippet: "A primer on spring and neap tides.",
      },
      {
        title: "Tidal Forces",
        url: "https://example.com/tidal-forces",
        snippet: "The differential gravitational field across Earth's diameter.",
      },
    ]);
    expect(assistant.model).toBe("deep_seek_v3");
    // Reasoning/citations never leak into the plain text body.
    expect(assistant.content).toEqual([
      {
        type: "text",
        text: "Tides are caused by the Moon's and Sun's gravitational pull on the ocean.",
      },
    ]);
  });

  it("maps file blocks and conversation-level media into attachments", () => {
    const conversation = toConversation(loadPages(), { id: CONVERSATION_ID, agentId: AGENT_ID });
    const lastAssistant = conversation.messages[3]!;

    expect(lastAssistant.content).toEqual([
      { type: "text", text: "I saved the summary to a file for you." },
      { type: "file", attachmentId: "media-0000-0002", name: "tide-summary.txt" },
    ]);
    expect(lastAssistant.attachments).toEqual(["media-0000-0002"]);

    expect(conversation.attachments).toEqual([
      {
        id: "media-0000-0002",
        name: "tide-summary.txt",
        mimeType: "text/plain",
        sizeBytes: 144304,
        url: "https://hunyuan.tencent.com/api/resource/download?resourceId=00000000000000000000000000000002",
      },
      {
        id: "media-0000-0001",
        name: "tide-notes.txt",
        mimeType: "text/plain",
        sizeBytes: 2048,
        url: "https://hunyuan.tencent.com/api/resource/download?resourceId=00000000000000000000000000000001",
      },
    ]);
  });

  it("carries listing title/timestamps and builds the source URL", () => {
    const conversation = toConversation(loadPages(), {
      id: CONVERSATION_ID,
      agentId: AGENT_ID,
      title: "How do tides form?",
      createdAt: "2026-03-20T01:35:00.000Z",
      updatedAt: "2026-03-20T01:38:35.000Z",
    });
    expect(conversation.title).toBe("How do tides form?");
    expect(conversation.createdAt).toBe("2026-03-20T01:35:00.000Z");
    expect(conversation.updatedAt).toBe("2026-03-20T01:38:35.000Z");
    expect(conversation.model).toBe("hunyuan_gpt_175B_0404");
    expect(conversation.sourceUrl).toBe(
      `https://yuanbao.tencent.com/chat/${AGENT_ID}/${CONVERSATION_ID}`,
    );
  });

  it("falls back to the first user prompt when no title is supplied", () => {
    // The detail endpoint repeats the title, so strip it to exercise the fallback.
    const pages = loadPages().map((page) => ({ ...page, title: undefined }));
    const conversation = toConversation(pages, { id: CONVERSATION_ID, agentId: AGENT_ID });
    expect(conversation.title).toBe("How do tides form? I attached a chart.");
  });

  it("normalises second-, milli- and string-based timestamps", () => {
    expect(toIsoTime(1773970500)).toBe("2026-03-20T01:35:00.000Z");
    expect(toIsoTime(1773970500000)).toBe("2026-03-20T01:35:00.000Z");
    expect(toIsoTime("1773970500")).toBe("2026-03-20T01:35:00.000Z");
    expect(toIsoTime(0)).toBeUndefined();
    expect(toIsoTime(undefined)).toBeUndefined();
  });

  it("reads the agent id out of the chat path", () => {
    expect(agentIdFromPath(`/chat/${AGENT_ID}/${CONVERSATION_ID}`)).toBe(AGENT_ID);
    expect(agentIdFromPath(`/chat/${AGENT_ID}`)).toBe(AGENT_ID);
    expect(agentIdFromPath("/chat")).toBeUndefined();
    expect(agentIdFromPath("/")).toBeUndefined();
  });
});

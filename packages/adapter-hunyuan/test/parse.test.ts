import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Conversation } from "@ace/schema";
import {
  agentIdFromPath,
  conversationIdFromPath,
  hasMorePages,
  parseConversationList,
  toConversation,
  toIsoTime,
  toRole,
} from "../src/parse.js";
import type { ConversationDetailResponse, ListConversationsResponse } from "../src/types.js";

function loadFixture<T>(name: string): T {
  const url = new URL(`../fixtures/hunyuan/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as T;
}

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "HunyuanDefault";

/** Newest window first, then the older page — the order the adapter fetches. */
function loadPages(): ConversationDetailResponse[] {
  return [
    loadFixture<ConversationDetailResponse>("detail.json"),
    loadFixture<ConversationDetailResponse>("detail-older.json"),
  ];
}

describe("hunyuan adapter parsing (golden fixtures)", () => {
  it("maps a listing page (pinned first) into conversation metadata", () => {
    const payload = loadFixture<ListConversationsResponse>("list.json");
    expect(parseConversationList(payload)).toMatchInlineSnapshot(`
      [
        {
          "createdAt": "2026-02-05T19:58:20.000Z",
          "id": "00000000-0000-4000-8000-000000000003",
          "platform": "hunyuan",
          "title": "Pinned: release checklist",
          "updatedAt": "2026-02-05T19:59:48.000Z",
        },
        {
          "createdAt": "2026-03-20T01:35:00.000Z",
          "id": "00000000-0000-4000-8000-000000000001",
          "platform": "hunyuan",
          "title": "Hunyuan identity greeting",
          "updatedAt": "2026-03-20T01:38:35.000Z",
        },
        {
          "createdAt": "2026-02-12T04:13:20.000Z",
          "id": "00000000-0000-4000-8000-000000000002",
          "platform": "hunyuan",
          "title": "Quicksort in Rust",
          "updatedAt": "2026-02-12T04:19:38.000Z",
        },
      ]
    `);
  });

  it("tells when the listing has another page", () => {
    const payload = loadFixture<ListConversationsResponse>("list.json");
    expect(hasMorePages(payload, 0)).toBe(false); // totalCount 2, one page of 2 rows
    expect(hasMorePages({ totalCount: 5, data: [{}, {}] }, 0)).toBe(true);
    expect(hasMorePages({ data: [{}] }, 0)).toBe(true);
    expect(hasMorePages({ data: [] }, 0)).toBe(false);
  });

  it("assembles a Conversation from both detail windows", () => {
    const conversation = toConversation(loadPages(), {
      id: CONVERSATION_ID,
      agentId: AGENT_ID,
      title: "Hunyuan identity greeting",
      chatModelId: "hy4",
    });
    expect(conversation).toMatchSnapshot();
  });

  it("produces a schema-valid Conversation", () => {
    const conversation = toConversation(loadPages(), { id: CONVERSATION_ID, agentId: AGENT_ID });
    expect(() => Conversation.parse(conversation)).not.toThrow();
  });

  it("orders turns oldest-first and dedupes the page overlap", () => {
    const pages = loadPages();
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
  });

  it("maps thought blocks to reasoning (msg body, title as summary)", () => {
    const conversation = toConversation(loadPages(), { id: CONVERSATION_ID, agentId: AGENT_ID });
    const assistant = conversation.messages[1]!;

    expect(assistant.reasoning).toEqual({
      content: "The user asks about tides, so the Moon's gravity is the key driver.",
      summary: "已深度思考",
    });
    expect(assistant.content).toEqual([
      {
        type: "text",
        text: "Tides are caused by the Moon's and Sun's gravitational pull on the ocean.",
      },
    ]);
    expect(assistant.model).toBe("hy4");
  });

  it("maps searchGuid docs to citations and file blocks to attachments", () => {
    const conversation = toConversation(loadPages(), { id: CONVERSATION_ID, agentId: AGENT_ID });
    const lastAssistant = conversation.messages[3]!;

    expect(lastAssistant.citations).toEqual([
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
    expect(lastAssistant.content).toEqual([
      { type: "text", text: "I saved the summary to a file for you." },
      { type: "file", attachmentId: "media-0000-0002", name: "tide-summary.txt" },
    ]);
    expect(conversation.attachments?.map((a) => a.name)).toEqual([
      "tide-summary.txt",
      "tide-notes.txt",
    ]);
  });

  it("prefers the listing title and carries its timestamps", () => {
    const conversation = toConversation(loadPages(), {
      id: CONVERSATION_ID,
      agentId: AGENT_ID,
      title: "Hunyuan identity greeting",
      createdAt: "2026-03-20T01:35:00.000Z",
      updatedAt: "2026-03-20T01:38:35.000Z",
      chatModelId: "hy4",
    });
    // The detail endpoint returns an empty title, so the listing one must win.
    expect(conversation.title).toBe("Hunyuan identity greeting");
    expect(conversation.createdAt).toBe("2026-03-20T01:35:00.000Z");
    expect(conversation.updatedAt).toBe("2026-03-20T01:38:35.000Z");
    expect(conversation.model).toBe("hy4");
    expect(conversation.sourceUrl).toBe(
      `https://aistudio.tencent.com/chat/${AGENT_ID}/${CONVERSATION_ID}`,
    );
  });

  it("skips injected custom nodes and normalises timestamps", () => {
    expect(toRole("human")).toBe("user");
    expect(toRole("ai")).toBe("assistant");
    expect(toRole("custom")).toBeUndefined();

    const conversation = toConversation(
      [
        {
          convs: [
            { id: "x", speaker: "custom", index: 2, createTime: 1773970530 },
            { id: "y", speaker: "human", index: 1, createTime: 1773970500 },
          ],
        },
      ],
      { id: CONVERSATION_ID, agentId: AGENT_ID },
    );
    expect(conversation.messages.map((m) => m.id)).toEqual(["y"]);
    expect(toIsoTime(1773970500)).toBe("2026-03-20T01:35:00.000Z");
    expect(toIsoTime(1773970500000)).toBe("2026-03-20T01:35:00.000Z");
    expect(toIsoTime(0)).toBeUndefined();
  });

  it("reads agent and conversation ids out of the chat path", () => {
    expect(agentIdFromPath(`/chat/${AGENT_ID}/${CONVERSATION_ID}`)).toBe(AGENT_ID);
    expect(conversationIdFromPath(`/chat/${AGENT_ID}/${CONVERSATION_ID}`)).toBe(CONVERSATION_ID);
    expect(conversationIdFromPath(`/chat/${CONVERSATION_ID}`)).toBe(CONVERSATION_ID);
    expect(agentIdFromPath("/chat-history")).toBeUndefined();
  });
});

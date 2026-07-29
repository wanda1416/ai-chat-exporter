import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Conversation } from "@ace/schema";
import { nextPageToken, parseConversationList, toConversation } from "../src/parse.js";
import type {
  ListConversationsResponse,
  LoadResponsesResponse,
  ResponseNodeResponse,
} from "../src/types.js";

function loadFixture<T>(name: string): T {
  const url = new URL(`../fixtures/grok/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as T;
}

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";

describe("grok adapter parsing (golden fixtures)", () => {
  it("maps a listing page into conversation metadata", () => {
    const payload = loadFixture<ListConversationsResponse>("listConversations.json");
    expect(parseConversationList(payload)).toMatchInlineSnapshot(`
      [
        {
          "createdAt": "2026-07-01T10:00:00.000000Z",
          "id": "00000000-0000-4000-8000-000000000001",
          "platform": "grok",
          "title": "How do tides form?",
          "updatedAt": "2026-07-01T10:01:10.000Z",
        },
        {
          "createdAt": "2026-06-28T08:30:00.000000Z",
          "id": "00000000-0000-4000-8000-000000000002",
          "platform": "grok",
          "title": "Quicksort in Rust",
          "updatedAt": "2026-06-28T08:45:12.000Z",
        },
      ]
    `);
  });

  it("echoes the last conversationId as the next page cursor", () => {
    const payload = loadFixture<ListConversationsResponse>("listConversations.json");
    expect(nextPageToken(payload)).toBe("00000000-0000-4000-8000-000000000002");
    expect(nextPageToken({ conversations: [], nextPageToken: "" })).toBeUndefined();
  });

  it("assembles a Conversation from response-node + load-responses", () => {
    const nodes = loadFixture<ResponseNodeResponse>("responseNode.json");
    const loaded = loadFixture<LoadResponsesResponse>("loadResponses.json");
    const conversation = toConversation(CONVERSATION_ID, nodes, loaded, {
      title: "How do tides form?",
      createdAt: "2026-07-01T10:00:00.000000Z",
      updatedAt: "2026-07-01T10:01:10.000Z",
    });
    expect(conversation).toMatchSnapshot();
  });

  it("produces a schema-valid Conversation", () => {
    const nodes = loadFixture<ResponseNodeResponse>("responseNode.json");
    const loaded = loadFixture<LoadResponsesResponse>("loadResponses.json");
    const conversation = toConversation(CONVERSATION_ID, nodes, loaded);
    expect(() => Conversation.parse(conversation)).not.toThrow();
  });

  it("reorders out-of-order load-responses chronologically", () => {
    const nodes = loadFixture<ResponseNodeResponse>("responseNode.json");
    const loaded = loadFixture<LoadResponsesResponse>("loadResponses.json");
    // The fixture deliberately scrambles `responses` (assistant-first) to guard
    // the createTime sort — Grok does not return them in request order.
    const conversation = toConversation(CONVERSATION_ID, nodes, loaded);

    expect(conversation.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(conversation.messages[0].id).toBe("11111111-0000-4000-8000-000000000001");
    expect(conversation.messages[0].content).toEqual([
      { type: "text", text: "How do tides form? I attached a diagram." },
    ]);
    // Model is per-message and only carried on assistant turns.
    expect(conversation.messages[1].model).toBe("grok-3");
    expect(conversation.messages[0].model).toBeUndefined();
    // The conversation model is the last assistant's.
    expect(conversation.model).toBe("grok-4");
  });

  it("links the parent/children tree from parentResponseId", () => {
    const nodes = loadFixture<ResponseNodeResponse>("responseNode.json");
    const loaded = loadFixture<LoadResponsesResponse>("loadResponses.json");
    const conversation = toConversation(CONVERSATION_ID, nodes, loaded);
    const [u1, a1, u2, a2] = conversation.messages;

    // The root node has no parentResponseId key at all, so parentId is unset.
    expect(u1.parentId).toBeUndefined();
    expect(u1.childrenIds).toEqual([a1.id]);
    expect(a1.parentId).toBe(u1.id);
    expect(a1.childrenIds).toEqual([u2.id]);
    expect(a2.childrenIds).toBeUndefined();
  });

  it("dedupes cited web searches into citations and maps file attachments", () => {
    const nodes = loadFixture<ResponseNodeResponse>("responseNode.json");
    const loaded = loadFixture<LoadResponsesResponse>("loadResponses.json");
    const conversation = toConversation(CONVERSATION_ID, nodes, loaded);

    const lastAssistant = conversation.messages[3];
    expect(lastAssistant.citations).toEqual([
      {
        title: "Understanding Tides",
        url: "https://example.com/tides",
        snippet: "A primer on spring and neap tides.",
      },
    ]);

    expect(conversation.attachments).toEqual([
      {
        id: "asset-0000-0001",
        name: "tides-diagram.png",
        mimeType: "image/png",
        sizeBytes: 20480,
      },
    ]);
    expect(conversation.messages[0].attachments).toEqual(["asset-0000-0001"]);
  });

  it("falls back to the first user prompt when no title is supplied", () => {
    const nodes = loadFixture<ResponseNodeResponse>("responseNode.json");
    const loaded = loadFixture<LoadResponsesResponse>("loadResponses.json");
    const conversation = toConversation(CONVERSATION_ID, nodes, loaded);
    expect(conversation.title).toBe("How do tides form? I attached a diagram.");
    expect(conversation.sourceUrl).toBe(`https://grok.com/c/${CONVERSATION_ID}`);
  });
});

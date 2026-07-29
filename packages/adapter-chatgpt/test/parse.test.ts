import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Conversation } from "@ace/schema";
import { nextOffset, parseConversationList, toConversation } from "../src/parse.js";
import type { ConversationDetail, ConversationsPage } from "../src/types.js";

function loadFixture<T>(name: string): T {
  const url = new URL(`../fixtures/chatgpt/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as T;
}

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

describe("chatgpt adapter parsing (golden fixtures)", () => {
  it("maps a listing page into conversation metadata (ISO normalised)", () => {
    const payload = loadFixture<ConversationsPage>("conversations.json");
    expect(parseConversationList(payload)).toMatchInlineSnapshot(`
      [
        {
          "createdAt": "2026-07-11T19:20:54.123Z",
          "id": "11111111-1111-4111-8111-111111111111",
          "platform": "chatgpt",
          "title": "Song-era forms of address",
          "updatedAt": "2026-07-12T08:50:00.900Z",
        },
        {
          "createdAt": "2026-06-23T23:38:30.100Z",
          "id": "22222222-2222-4222-8222-222222222222",
          "platform": "chatgpt",
          "title": "Quicksort walkthrough",
          "updatedAt": "2026-07-10T23:44:08.000Z",
        },
      ]
    `);
  });

  it("advances the offset by the page size until total is reached", () => {
    const payload = loadFixture<ConversationsPage>("conversations.json");
    // offset 0 + 2 items = 2, and 2 < total(3), so another page follows.
    expect(nextOffset(payload)).toBe(2);
    // A page that lands at/over total, or comes back empty, ends the walk.
    expect(nextOffset({ items: [{ id: "x" }], total: 3, limit: 2, offset: 2 })).toBeUndefined();
    expect(nextOffset({ items: [], total: 3, limit: 2, offset: 2 })).toBeUndefined();
  });

  it("assembles a Conversation from the detail mapping", () => {
    const data = loadFixture<ConversationDetail>("conversation.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    expect(conversation).toMatchSnapshot();
  });

  it("produces a schema-valid Conversation", () => {
    const data = loadFixture<ConversationDetail>("conversation.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    expect(() => Conversation.parse(conversation)).not.toThrow();
  });

  it("walks the active path, keeping the tool image but dropping scaffolding", () => {
    const data = loadFixture<ConversationDetail>("conversation.json");
    // current_node = n-toolimg; the visible path is u1→a1→u2→toolimg. Excluded:
    // the system root, the web-search tool call (recipient "web"), the image
    // tool-call prompt (recipient "t2uay3k…"), the hidden tool status message,
    // and the abandoned regeneration (n-a2).
    const conversation = toConversation(CONVERSATION_ID, data);
    expect(conversation.messages.map((m) => m.id)).toEqual([
      "n-u1",
      "n-a1",
      "n-u2",
      "n-toolimg",
    ]);
    expect(conversation.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    for (const dropped of ["n-a2", "n-tool", "n-toolprompt", "n-toolstatus"]) {
      expect(conversation.messages.some((m) => m.id === dropped)).toBe(false);
    }
  });

  it("re-links parent/children linearly across the dropped nodes", () => {
    const data = loadFixture<ConversationDetail>("conversation.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    const [u1, a1, u2, img] = conversation.messages;

    // The first visible message roots the linear chain (parentId null).
    expect(u1.parentId).toBeNull();
    expect(u1.childrenIds).toEqual([a1.id]);
    // u2's raw parent is the web-search tool node, which was dropped — it
    // re-links to a1.
    expect(a1.childrenIds).toEqual([u2.id]);
    expect(u2.parentId).toBe(a1.id);
    // The tool image's raw parent chain (status → prompt) was dropped — it
    // re-links to u2.
    expect(img.parentId).toBe(u2.id);
    expect(img.childrenIds).toBeUndefined();
    // Timestamps are ISO-converted from float epoch seconds.
    expect(u1.timestamp).toBe("2026-07-11T19:20:54.500Z");
  });

  it("stamps assistant messages with their model slug (users left bare)", () => {
    const data = loadFixture<ConversationDetail>("conversation.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    const [u1, a1] = conversation.messages;
    expect(u1.model).toBeUndefined();
    expect(a1.model).toBe("gpt-4o");
    expect(conversation.model).toBe("gpt-4o");
  });

  it("dedupes grouped_webpages references into citations by url", () => {
    const data = loadFixture<ConversationDetail>("conversation.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    // The assistant cites the same url twice plus one unique — deduped to 2.
    expect(conversation.messages[1].citations).toEqual([
      { title: "Song Honorifics", url: "https://example.com/song" },
      { title: "Kinship Terms", url: "https://example.org/kinship" },
    ]);
  });

  it("collects uploaded files and generated images as attachments", () => {
    const data = loadFixture<ConversationDetail>("conversation.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    expect(conversation.attachments).toEqual([
      { id: "file-UP1", name: "song-titles.txt", sizeBytes: 2048, mimeType: "text/plain" },
      { id: "sediment://file_IMG1", sizeBytes: 512000 },
    ]);
    // The user upload is referenced by id from its message.
    expect(conversation.messages[0].attachments).toEqual(["file-UP1"]);
    // The generated image surfaces as an image content part on the tool turn
    // (mapped to the assistant role).
    expect(conversation.messages[3].role).toBe("assistant");
    expect(conversation.messages[3].content).toEqual([
      { type: "text", text: "Here is the illustration:" },
      { type: "image", attachmentId: "sediment://file_IMG1" },
    ]);
  });

  it("uses the detail title and builds the source url", () => {
    const data = loadFixture<ConversationDetail>("conversation.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    expect(conversation.title).toBe("Song-era forms of address");
    expect(conversation.sourceUrl).toBe(`https://chatgpt.com/c/${CONVERSATION_ID}`);
  });

  it("falls back to the first user prompt when the title is absent", () => {
    const data = loadFixture<ConversationDetail>("conversation.json");
    const stripped: ConversationDetail = { ...data, title: "" };
    const conversation = toConversation(CONVERSATION_ID, stripped);
    expect(conversation.title).toBe(
      "Summarize how Song-dynasty people addressed relatives. See the attached notes.",
    );
  });
});

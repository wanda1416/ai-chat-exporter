import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Conversation } from "@ace/schema";
import { hasMore, lastSeqId, parseConversationList, toConversation } from "../src/parse.js";
import type { FetchPageData, HistoryMessagesData } from "../src/types.js";

function loadFixture<T>(name: string): T {
  const url = new URL(`../fixtures/deepseek/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as T;
}

const CONVERSATION_ID = "00000000-0000-4000-8000-0000000000aa";

describe("deepseek adapter parsing (golden fixtures)", () => {
  it("maps a listing page into conversation metadata (epoch → ISO)", () => {
    const payload = loadFixture<FetchPageData>("fetchPage.json");
    expect(parseConversationList(payload)).toMatchInlineSnapshot(`
      [
        {
          "createdAt": "2026-07-20T08:47:18.043Z",
          "id": "00000000-0000-4000-8000-0000000000aa",
          "platform": "deepseek",
          "title": "Song-era forms of address",
          "updatedAt": "2026-07-20T08:50:00.973Z",
        },
        {
          "createdAt": "2026-06-23T23:38:30.103Z",
          "id": "00000000-0000-4000-8000-0000000000bb",
          "platform": "deepseek",
          "title": "Quicksort walkthrough",
          "updatedAt": "2026-07-10T23:44:08.022Z",
        },
      ]
    `);
  });

  it("derives the next-page cursor from the last session's seq_id", () => {
    const payload = loadFixture<FetchPageData>("fetchPage.json");
    expect(hasMore(payload)).toBe(true);
    expect(lastSeqId(payload)).toBe(205890248);
    expect(hasMore({ chat_sessions: [], has_more: false })).toBe(false);
    expect(lastSeqId({ chat_sessions: [] })).toBeUndefined();
  });

  it("assembles a Conversation from history_messages", () => {
    const data = loadFixture<HistoryMessagesData>("historyMessages.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    expect(conversation).toMatchSnapshot();
  });

  it("produces a schema-valid Conversation", () => {
    const data = loadFixture<HistoryMessagesData>("historyMessages.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    expect(() => Conversation.parse(conversation)).not.toThrow();
  });

  it("walks the active branch and drops the regenerated sibling", () => {
    const data = loadFixture<HistoryMessagesData>("historyMessages.json");
    // The array is scrambled ([3,1,5,2,4]) and message 4 is an abandoned
    // regeneration of message 5 (both parent 3). current_message_id=5, so the
    // visible path is 1→2→3→5 in order, and 4 must be excluded.
    const conversation = toConversation(CONVERSATION_ID, data);
    expect(conversation.messages.map((m) => m.id)).toEqual(["1", "2", "3", "5"]);
    expect(conversation.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(conversation.messages.some((m) => m.id === "4")).toBe(false);
  });

  it("maps thinking_content into the reasoning field (assistant only)", () => {
    const data = loadFixture<HistoryMessagesData>("historyMessages.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    const [u1, a1, , a2] = conversation.messages;

    expect(u1.reasoning).toBeUndefined();
    expect(a1.reasoning).toEqual({
      content: "The user wants a summary of Song kinship address; recall the sources.",
      summary: "Thought for 13s",
    });
    expect(a2.reasoning?.summary).toBe("Thought for 3s");
  });

  it("dedupes search_results into citations by url", () => {
    const data = loadFixture<HistoryMessagesData>("historyMessages.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    // The middle assistant cites the same url twice plus one unique — deduped to 2.
    expect(conversation.messages[1].citations).toEqual([
      {
        title: "Song Honorifics",
        url: "https://example.com/song",
        snippet: "How Song-era families addressed one another.",
      },
      {
        title: "Kinship Terms",
        url: "https://example.org/kinship",
        snippet: "A glossary of classical kinship terms.",
      },
    ]);
  });

  it("maps files into attachments referenced by the user message", () => {
    const data = loadFixture<HistoryMessagesData>("historyMessages.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    expect(conversation.attachments).toEqual([
      { id: "file-0000-0001", name: "song-titles.txt", sizeBytes: 2048 },
    ]);
    expect(conversation.messages[0].attachments).toEqual(["file-0000-0001"]);
  });

  it("links the parent/children tree along the active path", () => {
    const data = loadFixture<HistoryMessagesData>("historyMessages.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    const [u1, a1, u2, a2] = conversation.messages;

    // The root's parent_id is an explicit null, so parentId is null (not unset).
    expect(u1.parentId).toBeNull();
    expect(u1.childrenIds).toEqual([a1.id]);
    expect(a1.parentId).toBe(u1.id);
    expect(a1.childrenIds).toEqual([u2.id]);
    expect(a2.parentId).toBe(u2.id);
    expect(a2.childrenIds).toBeUndefined();
    // Timestamps are ISO-converted from float epoch seconds.
    expect(u1.timestamp).toBe("2026-07-20T08:47:50.500Z");
  });

  it("uses the session title and builds the source url", () => {
    const data = loadFixture<HistoryMessagesData>("historyMessages.json");
    const conversation = toConversation(CONVERSATION_ID, data);
    expect(conversation.title).toBe("Song-era forms of address");
    expect(conversation.sourceUrl).toBe(`https://chat.deepseek.com/a/chat/s/${CONVERSATION_ID}`);
  });

  it("falls back to the first user prompt when the title is absent", () => {
    const data = loadFixture<HistoryMessagesData>("historyMessages.json");
    const stripped: HistoryMessagesData = {
      ...data,
      chat_session: { ...data.chat_session, title: "" },
    };
    const conversation = toConversation(CONVERSATION_ID, stripped);
    expect(conversation.title).toBe(
      "Summarize how Song-dynasty people addressed relatives. See the attached notes.",
    );
  });
});

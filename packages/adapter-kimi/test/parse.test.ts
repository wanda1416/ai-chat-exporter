import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Conversation } from "@ace/schema";
import { parseFeeds, toConversation } from "../src/parse.js";
import type {
  GetChatResponse,
  ListFeedsResponse,
  ListMessagesResponse,
} from "../src/types.js";

function loadFixture<T>(name: string): T {
  const url = new URL(`../fixtures/kimi/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as T;
}

const CHAT_ID = "00000000-0000-4000-8000-000000000001";

describe("kimi adapter parsing (golden fixtures)", () => {
  it("maps ListFeeds into conversation metadata", () => {
    const feeds = loadFixture<ListFeedsResponse>("listFeeds.json");
    const metas = parseFeeds(feeds);
    expect(metas).toMatchInlineSnapshot(`
      [
        {
          "createdAt": "2026-07-20T08:15:30Z",
          "id": "00000000-0000-4000-8000-000000000001",
          "platform": "kimi",
          "title": "潮汐是怎么形成的",
          "updatedAt": "2026-07-20T08:17:02Z",
        },
        {
          "createdAt": "2026-07-19T12:00:00Z",
          "id": "00000000-0000-4000-8000-000000000002",
          "platform": "kimi",
          "title": "帮我写一个快速排序",
          "updatedAt": "2026-07-19T12:03:10Z",
        },
      ]
    `);
  });

  it("assembles a Conversation from GetChat + ListMessages", () => {
    const chat = loadFixture<GetChatResponse>("getChat.json");
    const messages = loadFixture<ListMessagesResponse>("listMessages.json");
    const conversation = toConversation(CHAT_ID, chat, messages);
    expect(conversation).toMatchSnapshot();
  });

  it("produces a schema-valid Conversation", () => {
    const chat = loadFixture<GetChatResponse>("getChat.json");
    const messages = loadFixture<ListMessagesResponse>("listMessages.json");
    const conversation = toConversation(CHAT_ID, chat, messages);
    expect(() => Conversation.parse(conversation)).not.toThrow();
  });

  it("skips tool blocks, dedupes citations, aggregates reasoning and derives the tree", () => {
    const chat = loadFixture<GetChatResponse>("getChat.json");
    const messages = loadFixture<ListMessagesResponse>("listMessages.json");
    const conversation = toConversation(CHAT_ID, chat, messages);

    const [root, answer, followup] = conversation.messages;

    // parentId → childrenIds is derived (Kimi omits childrenIds).
    expect(root.parentId).toBeNull();
    expect(root.childrenIds).toEqual(["msg-answer"]);
    expect(answer.childrenIds).toEqual(["msg-followup"]);
    expect(followup.childrenIds).toBeUndefined();

    // The assistant answer keeps only prose text (tool block dropped).
    expect(answer.content).toEqual([
      {
        type: "text",
        text: "潮汐主要由月球引力对地球不同位置的引力差造成，太阳引力起次要作用。",
      },
    ]);

    // think block → reasoning (content + summary).
    expect(answer.reasoning).toEqual({
      content: "用户在问潮汐成因，需要解释引力差与地月系统。",
      summary: "解释潮汐的引力成因",
    });

    // references → citations, deduped by url.
    expect(answer.citations).toEqual([
      {
        title: "潮汐 - 维基百科",
        url: "https://example.org/wiki/tide",
        snippet: "潮汐是海水在天体引力作用下的周期性涨落。",
      },
    ]);
  });
});

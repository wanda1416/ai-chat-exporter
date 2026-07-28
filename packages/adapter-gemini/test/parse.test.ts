import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Conversation } from "@ace/schema";
import {
  extractRpcPayload,
  nextPageToken,
  parseConversationList,
  toConversation,
} from "../src/parse.js";
import { RPC_LIST, type Json } from "../src/types.js";

function loadFixture(name: string): Json {
  const url = new URL(`../fixtures/gemini/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as Json;
}

const CONVERSATION_ID = "c_0000000000000001";

describe("gemini adapter parsing (golden fixtures)", () => {
  it("strips the anti-JSON envelope and returns the inner payload", () => {
    const payload = loadFixture("listConversations.json");
    // A minimal batchexecute envelope wrapping the decoded list payload.
    const raw =
      `)]}'\n\n` +
      `123\n` +
      JSON.stringify([["wrb.fr", RPC_LIST, JSON.stringify(payload), null, null, null, "generic"]]) +
      `\n26\n` +
      JSON.stringify([["e", 4, null, null, 100]]);

    expect(extractRpcPayload(raw, RPC_LIST)).toEqual(payload);
  });

  it("maps a MaZiqc page into conversation metadata", () => {
    const payload = loadFixture("listConversations.json");
    expect(parseConversationList(payload)).toMatchInlineSnapshot(`
      [
        {
          "createdAt": "2026-07-13T19:07:07.000Z",
          "id": "c_0000000000000001",
          "platform": "gemini",
          "title": "潮汐是怎么形成的",
        },
        {
          "createdAt": "2026-07-10T19:04:38.000Z",
          "id": "c_0000000000000002",
          "platform": "gemini",
          "title": "快速排序怎么实现",
        },
      ]
    `);
    expect(nextPageToken(payload)).toBe("PAGE_TOKEN_FIXTURE_002");
  });

  it("assembles a Conversation from an hNvQHb payload", () => {
    const payload = loadFixture("getConversation.json");
    const conversation = toConversation(CONVERSATION_ID, payload, "潮汐是怎么形成的");
    expect(conversation).toMatchSnapshot();
  });

  it("produces a schema-valid Conversation", () => {
    const payload = loadFixture("getConversation.json");
    const conversation = toConversation(CONVERSATION_ID, payload);
    expect(() => Conversation.parse(conversation)).not.toThrow();
  });

  it("flattens turns into linear user/assistant messages with model + markdown", () => {
    const payload = loadFixture("getConversation.json");
    const conversation = toConversation(CONVERSATION_ID, payload, "潮汐是怎么形成的");

    // Two turns -> four linear messages; Gemini web is not a branch tree, so
    // no parentId/childrenIds are emitted (contrast with the Kimi adapter).
    expect(conversation.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(conversation.messages.every((m) => m.parentId === undefined)).toBe(true);
    expect(conversation.messages.every((m) => m.childrenIds === undefined)).toBe(true);

    const [firstUser, firstAssistant] = conversation.messages;
    expect(firstUser.id).toBe("m_user_00000001");
    expect(firstUser.content).toEqual([
      { type: "text", text: "开源项目命名用 _ 还是 - 有什么讲究？" },
    ]);

    // The *selected* candidate's markdown wins (the empty comparison is dropped).
    expect(firstAssistant.id).toBe("rc_00000000000000b1");
    expect(firstAssistant.model).toBe("3.6 Flash");
    expect(firstAssistant.content).toEqual([
      {
        type: "text",
        text: "**结论**：仓库名/包名首选 `-`，代码里的模块名首选 `_`。\n\n- npm 生态统一用 `-`\n- Python 导入时必须用 `_`",
      },
    ]);

    // Title is carried from the list; conversation model + span are derived.
    expect(conversation.title).toBe("潮汐是怎么形成的");
    expect(conversation.model).toBe("3.6 Flash");
    expect(conversation.sourceUrl).toBe("https://gemini.google.com/app/0000000000000001");
  });

  it("derives a title from the first prompt when none is supplied", () => {
    const payload = loadFixture("getConversation.json");
    const conversation = toConversation(CONVERSATION_ID, payload);
    expect(conversation.title).toBe("开源项目命名用 _ 还是 - 有什么讲究？");
  });
});

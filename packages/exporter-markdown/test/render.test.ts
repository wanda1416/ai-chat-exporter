import { describe, expect, it } from "vitest";
import type { Conversation } from "@ace/schema";
import { renderMarkdown } from "../src/render.js";

function conversation(messages: Conversation["messages"]): Conversation {
  return {
    schemaVersion: "1",
    id: "c1",
    platform: "kimi",
    title: "Demo",
    updatedAt: "2026-07-28T00:00:00Z",
    messages,
  };
}

describe("renderMarkdown", () => {
  it("skips empty messages instead of leaving a dangling heading", () => {
    const md = renderMarkdown(
      conversation([
        // Kimi's all-zero system root node: empty content, no reasoning/citations.
        { id: "sys", role: "system", content: [] },
        { id: "u1", role: "user", content: [{ type: "text", text: "Hi" }] },
      ]),
    );

    expect(md).not.toContain("## ⚙️ System");
    expect(md).toContain("## 🧑 User");
    expect(md).toContain("Hi");
  });

  it("still renders a system message that has real content", () => {
    const md = renderMarkdown(
      conversation([{ id: "sys", role: "system", content: [{ type: "text", text: "You are helpful." }] }]),
    );

    expect(md).toContain("## ⚙️ System");
    expect(md).toContain("You are helpful.");
  });

  it("renders reasoning, citations, code and table blocks", () => {
    const md = renderMarkdown(
      conversation([
        {
          id: "a1",
          role: "assistant",
          content: [
            { type: "code", language: "ts", code: "const x = 1;" },
            { type: "table", headers: ["a", "b"], rows: [["1", "2"]] },
          ],
          reasoning: { content: "thinking…" },
          citations: [{ title: "Docs", url: "https://example.com" }],
        },
      ]),
    );

    expect(md).toContain("<details><summary>💭 Reasoning</summary>");
    expect(md).toContain("```ts\nconst x = 1;\n```");
    expect(md).toContain("| a | b |");
    expect(md).toContain("1. [Docs](https://example.com)");
  });
});

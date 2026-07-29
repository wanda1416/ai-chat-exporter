import { describe, expect, it } from "vitest";
import type { Attachment, Conversation, ConversationMeta } from "@ace/schema";
import type { AttachmentPayload, ExportedFile, PlatformAdapter } from "../src/index.js";
import { downloadAttachments, exportConversations } from "../src/index.js";

function makeConversation(attachments: Attachment[]): Conversation {
  return {
    schemaVersion: "1",
    id: "c1",
    platform: "kimi",
    title: "Demo",
    createdAt: "2026-07-01T00:00:00Z",
    messages: [],
    attachments,
  };
}

function makeAdapter(overrides: Partial<PlatformAdapter> = {}): PlatformAdapter {
  return {
    platform: "kimi",
    detect: () => true,
    // eslint-disable-next-line require-yield
    async *listConversations(): AsyncIterable<ConversationMeta> {},
    fetchConversation: () => Promise.reject(new Error("not used")),
    ...overrides,
  };
}

/** fetch stub serving fixed bytes with a content type. */
function fetchStub(bytes: Uint8Array, contentType = "image/png"): typeof fetch {
  return async () => new Response(bytes.slice(), { headers: { "content-type": contentType } });
}

describe("downloadAttachments", () => {
  it("downloads via Attachment.url, writes localPath and a binary file", async () => {
    const conversation = makeConversation([
      { id: "a1", name: "photo.png", url: "https://cdn.example.com/photo.png" },
    ]);
    const result = await downloadAttachments(conversation, makeAdapter(), {
      fetchImpl: fetchStub(new Uint8Array([1, 2, 3])),
      throttleMs: 0,
    });

    expect(result.saved).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.files[0]?.path).toBe("kimi/attachments/2026-07-01-Demo/photo.png");
    expect(result.files[0]?.content).toEqual(new Uint8Array([1, 2, 3]));
    expect(conversation.attachments?.[0]?.localPath).toBe(
      "kimi/attachments/2026-07-01-Demo/photo.png",
    );
  });

  it("prefers the adapter's fetchAttachment and derives the extension from mime", async () => {
    const conversation = makeConversation([{ id: "sediment://file_abc", sizeBytes: 3 }]);
    const adapter = makeAdapter({
      fetchAttachment: async (): Promise<AttachmentPayload> => ({
        bytes: new Uint8Array([9, 9, 9]),
        mimeType: "image/png",
      }),
    });
    const result = await downloadAttachments(conversation, adapter, { throttleMs: 0 });

    expect(result.saved).toBe(1);
    // scheme prefix stripped, extension from mime type
    expect(result.files[0]?.path).toBe("kimi/attachments/2026-07-01-Demo/file_abc.png");
    expect(conversation.attachments?.[0]?.mimeType).toBe("image/png");
  });

  it("skips oversized and unresolvable attachments without failing", async () => {
    const conversation = makeConversation([
      { id: "big", name: "big.bin", sizeBytes: 100, url: "https://x/big.bin" },
      { id: "no-source", name: "ghost.txt" },
      { id: "ok", name: "ok.txt", url: "https://x/ok.txt" },
    ]);
    const result = await downloadAttachments(conversation, makeAdapter(), {
      maxBytes: 10,
      throttleMs: 0,
      fetchImpl: fetchStub(new Uint8Array([1]), "text/plain"),
    });

    expect(result.saved).toBe(1);
    expect(result.skipped).toBe(2);
    expect(conversation.attachments?.[0]?.localPath).toBeUndefined();
    expect(conversation.attachments?.[2]?.localPath).toBe(
      "kimi/attachments/2026-07-01-Demo/ok.txt",
    );
  });

  it("dedupes colliding filenames within one conversation", async () => {
    const conversation = makeConversation([
      { id: "a", name: "pic.png", url: "https://x/1" },
      { id: "b", name: "pic.png", url: "https://x/2" },
    ]);
    const result = await downloadAttachments(conversation, makeAdapter(), {
      fetchImpl: fetchStub(new Uint8Array([1])),
      throttleMs: 0,
    });

    expect(result.files.map((f) => f.path)).toEqual([
      "kimi/attachments/2026-07-01-Demo/pic.png",
      "kimi/attachments/2026-07-01-Demo/pic-2.png",
    ]);
  });
});

describe("exportConversations with attachments", () => {
  it("streams attachment + export files through onFile and counts them", async () => {
    const meta: ConversationMeta = { id: "c1", platform: "kimi", title: "Demo" };
    const conversation = makeConversation([{ id: "a1", name: "photo.png" }]);
    const adapter = makeAdapter({
      async *listConversations() {
        yield meta;
      },
      fetchConversation: async () => conversation,
      fetchAttachment: async () => ({ bytes: new Uint8Array([7]), mimeType: "image/png" }),
    });

    const streamed: ExportedFile[] = [];
    const result = await exportConversations({
      adapter,
      exporters: [
        {
          id: "fake",
          extension: "txt",
          export: (c) => ({ path: `${c.platform}/fake.txt`, content: c.id, mimeType: "text/plain" }),
        },
      ],
      includeAttachments: true,
      throttleMs: 0,
      onFile: (file) => streamed.push(file),
    });

    // onFile streams everything; nothing accumulates in result.files.
    expect(result.files).toEqual([]);
    expect(result.attachmentsSaved).toBe(1);
    expect(result.attachmentsSkipped).toBe(0);
    expect(streamed.map((f) => f.path)).toEqual([
      "kimi/attachments/2026-07-01-Demo/photo.png",
      "kimi/fake.txt",
    ]);
    // exporters ran after the download, so localPath is already stamped
    expect(conversation.attachments?.[0]?.localPath).toBeDefined();
  });
});

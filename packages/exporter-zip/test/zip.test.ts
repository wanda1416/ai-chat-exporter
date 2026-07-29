import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { ZipSink, bundleZip } from "../src/index.js";

describe("ZipSink", () => {
  it("streams text + binary files into a valid ZIP blob", async () => {
    const sink = new ZipSink();
    sink.add({ path: "kimi/markdown/a.md", content: "# hello", mimeType: "text/markdown" });
    sink.add({
      path: "kimi/attachments/a/pic.png",
      content: new Uint8Array([137, 80, 78, 71]),
      mimeType: "image/png", // already compressed → STOREd, not deflated
    });

    const blob = await sink.finish();
    expect(blob.type).toBe("application/zip");

    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(strFromU8(entries["kimi/markdown/a.md"]!)).toBe("# hello");
    expect(entries["kimi/attachments/a/pic.png"]).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it("spills output into blob parts without corrupting the archive", async () => {
    // Tiny spill threshold forces the chunk → Blob wrapping path repeatedly.
    const sink = new ZipSink({ spillBytes: 16 });
    for (let i = 0; i < 20; i++) {
      sink.add({ path: `t/${i}.txt`, content: `file number ${i}`, mimeType: "text/plain" });
    }

    const entries = unzipSync(new Uint8Array(await (await sink.finish()).arrayBuffer()));
    expect(Object.keys(entries)).toHaveLength(20);
    expect(strFromU8(entries["t/7.txt"]!)).toBe("file number 7");
  });

  it("matches bundleZip output content", async () => {
    const files = [
      { path: "a.txt", content: "one", mimeType: "text/plain" },
      { path: "b.txt", content: "two", mimeType: "text/plain" },
    ];
    const fromSync = unzipSync(bundleZip(files));

    const sink = new ZipSink();
    for (const file of files) sink.add(file);
    const fromStream = unzipSync(new Uint8Array(await (await sink.finish()).arrayBuffer()));

    expect(Object.keys(fromStream).sort()).toEqual(Object.keys(fromSync).sort());
    expect(strFromU8(fromStream["a.txt"]!)).toBe("one");
  });
});

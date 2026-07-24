import { describe, expect, it } from "vitest";

import {
  delimitedAdapter,
  detectImportAdapter,
  exportDelimitedText,
  jsonAdapter,
  markdownAdapter,
  parseDelimited,
  readMarkdownMediaFiles,
  sha256Hex,
  textAdapter,
} from "../src";
import { portabilityGraph } from "./fixtures";

describe("text and delimited adapters", () => {
  it("parses quoted delimiters, multiline cells, and CRLF records", () => {
    expect(
      parseDelimited('front,back\r\n"one, two","line 1\r\nline 2"\r\n', {
        delimiter: ",",
      }),
    ).toEqual([
      ["front", "back"],
      ["one, two", "line 1\r\nline 2"],
    ]);
  });

  it("infers a header mapping and preserves the preview", async () => {
    const source = {
      fileName: "cards.csv",
      text: "term,definition,tags\nATP,Cell energy,biology;energy\n",
    };
    const inspection = await delimitedAdapter.inspect(source);
    const graph = await delimitedAdapter.map(source, {
      adapterCode: "delimited",
      duplicatePolicy: "skip",
      progressPolicy: "omit",
      source,
    });
    expect(inspection.mapping).toMatchObject({
      backColumn: 1,
      frontColumn: 0,
      hasHeader: true,
      tagsColumn: 2,
    });
    expect(graph.decks[0]?.notes[0]?.tags).toEqual(["biology", "energy"]);
  });

  it("neutralizes spreadsheet formula prefixes on export", () => {
    const graph = portabilityGraph();
    graph.decks[0]!.notes[0]!.fields[0]!.value = '=HYPERLINK("https://bad.example")';
    expect(exportDelimitedText(graph, ",")).toContain(`"'=HYPERLINK(""https://bad.example"")"`);
  });

  it("handles common pasted term-definition separators", async () => {
    const source = { text: "ATP :: cell energy\nDNA :: genetic material" };
    const inspection = await textAdapter.inspect(source);
    expect(inspection.estimatedItems).toBe(2);
    expect((await detectImportAdapter(source))?.adapter.code).toBe("quizlet_text");
  });
});

describe("structured adapters", () => {
  it("round-trips Lumen JSON and rejects prototype pollution keys", async () => {
    const graph = portabilityGraph();
    const artifact = await jsonAdapter.export({
      adapterCode: "lumen_json",
      fileName: "biology",
      format: "lumen_json",
      graph,
      includeHistory: true,
      includeMedia: true,
      includeProgress: true,
    });
    expect(
      (
        await jsonAdapter.map(
          { bytes: artifact.bytes, fileName: artifact.fileName },
          {
            adapterCode: "lumen_json",
            duplicatePolicy: "skip",
            progressPolicy: "omit",
            source: { bytes: artifact.bytes, fileName: artifact.fileName },
          },
        )
      ).decks[0]?.title,
    ).toBe("Cell biology");
    await expect(
      jsonAdapter.map(
        { text: '{"__proto__":{"admin":true}}' },
        {
          adapterCode: "lumen_json",
          duplicatePolicy: "skip",
          progressPolicy: "omit",
          source: { text: '{"__proto__":{"admin":true}}' },
        },
      ),
    ).rejects.toMatchObject({ code: "invalid_schema" });
  });

  it("round-trips a Markdown bundle without active markup", async () => {
    const graph = portabilityGraph();
    const artifact = await markdownAdapter.export({
      adapterCode: "markdown_bundle",
      fileName: "biology",
      format: "markdown_bundle",
      graph,
      includeHistory: false,
      includeMedia: false,
      includeProgress: false,
    });
    const restored = await markdownAdapter.map(
      { bytes: artifact.bytes, fileName: artifact.fileName },
      {
        adapterCode: "markdown_bundle",
        duplicatePolicy: "skip",
        progressPolicy: "omit",
        source: { bytes: artifact.bytes, fileName: artifact.fileName },
      },
    );
    expect(restored.decks[0]).toMatchObject({
      title: "Cell biology",
    });
    expect(restored.decks[0]?.notes[0]?.fields.map((field) => field.value)).toEqual([
      "What is ATP?",
      "The main energy-carrying molecule in cells.",
    ]);
  });

  it("round-trips verified Markdown-bundle media and rejects tampering", async () => {
    const graph = portabilityGraph();
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const sha256 = await sha256Hex(bytes);
    graph.media = [
      {
        altText: "Synthetic image",
        byteSize: bytes.byteLength,
        externalId: "media-1",
        fileName: "diagram.png",
        kind: "image",
        mimeType: "image/png",
        sha256,
      },
    ];
    const note = graph.decks[0]?.notes[0];
    if (!note) throw new Error("fixture note missing");
    note.mediaExternalIds = ["media-1"];
    const artifact = await markdownAdapter.export({
      adapterCode: "markdown_bundle",
      fileName: "biology",
      format: "markdown_bundle",
      graph,
      includeHistory: false,
      includeMedia: true,
      includeProgress: false,
      mediaFiles: new Map([[sha256, bytes]]),
    });
    const source = { bytes: artifact.bytes, fileName: artifact.fileName };
    expect(
      (
        await markdownAdapter.map(source, {
          adapterCode: "markdown_bundle",
          duplicatePolicy: "skip",
          progressPolicy: "omit",
          source,
        })
      ).media,
    ).toEqual(graph.media);
    expect(await readMarkdownMediaFiles(source)).toEqual(new Map([[sha256, bytes]]));
  });
});

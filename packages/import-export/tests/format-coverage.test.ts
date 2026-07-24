import { describe, expect, it, vi } from "vitest";

import {
  createPrintableHtml,
  delimitedAdapter,
  diagnosticsToCsv,
  exportDelimitedText,
  jsonAdapter,
  markdownAdapter,
  parseDelimited,
  parseTermDefinitionText,
  textAdapter,
} from "../src";
import { portabilityGraph } from "./fixtures";

describe("text and delimited format coverage", () => {
  it("supports custom card delimiters, headers, swapping, languages, tags, and stable IDs", async () => {
    const source = {
      fileName: "authorized-export.txt",
      text: 'term::definition||"café"::"boisson, chaude"',
    };
    const plan = {
      adapterCode: "quizlet_text",
      duplicatePolicy: "skip" as const,
      progressPolicy: "omit" as const,
      source,
      textMapping: {
        backLanguage: "fr",
        cardDelimiter: "||",
        fieldDelimiter: "::",
        frontBackSwapped: true,
        frontLanguage: "en",
        hasHeader: true,
        tags: ["languages", "unicode"],
      },
    };
    const first = await textAdapter.map(source, plan);
    const second = await textAdapter.map(source, plan);
    expect(first.decks[0]?.notes[0]).toMatchObject({
      fields: [
        { language: "en", value: "boisson, chaude" },
        { language: "fr", value: "café" },
      ],
      tags: ["languages", "unicode"],
    });
    expect(first.decks[0]?.notes[0]?.externalId).toBe(second.decks[0]?.notes[0]?.externalId);
    expect(first.provenance).toEqual(second.provenance);
  });

  it("handles BOM, semicolons, escaped quotes, custom fields, and malformed-row diagnostics", async () => {
    const source = {
      fileName: "cards.csv",
      text: '\uFEFFterm;definition;tags;Hint\n"ATP";"energy ""currency""";biology,energy;adenosine\nMissing back;;warning;none\n',
    };
    const inspection = await delimitedAdapter.inspect(source);
    const graph = await delimitedAdapter.map(source, {
      adapterCode: "delimited",
      duplicatePolicy: "skip",
      mapping: inspection.mapping,
      progressPolicy: "omit",
      source,
    });
    expect(inspection.mapping).toMatchObject({
      customFieldColumns: { Hint: 3 },
      delimiter: ";",
      hasHeader: true,
    });
    expect(graph.decks[0]?.notes[0]).toMatchObject({
      fields: expect.arrayContaining([{ key: "Hint", name: "Hint", value: "adenosine" }]),
      noteTypeCode: "custom-import",
      tags: ["biology", "energy"],
    });
    expect(graph.warnings).toEqual([
      expect.objectContaining({ code: "row_skipped", item: "Row 3" }),
    ]);
  });

  it("rejects malformed quotes and enforces parser row and column bounds", () => {
    expect(() => parseDelimited('"unclosed,back', { delimiter: "," })).toThrow("not closed");
    expect(() => parseDelimited("a,b,c\n", { delimiter: ",", maxColumns: 2 })).toThrow(
      "too many columns",
    );
    expect(() => parseDelimited("a,b\nc,d\n", { delimiter: ",", maxRows: 1 })).toThrow(
      "too many rows",
    );
  });

  it("round-trips exact CSV quoting and neutralizes formulas", async () => {
    const graph = portabilityGraph();
    const note = graph.decks[0]?.notes[0];
    const front = note?.fields[0];
    const back = note?.fields[1];
    if (!note || !front || !back) throw new Error("fixture note missing");
    note.fields[0] = {
      ...front,
      value: '=HYPERLINK("https://invalid.example","x,y")',
    };
    note.fields[1] = { ...back, value: 'line 1\n"line 2"' };
    const text = exportDelimitedText(graph, ",");
    const restored = await delimitedAdapter.map(
      { fileName: "round-trip.csv", text },
      {
        adapterCode: "delimited",
        duplicatePolicy: "skip",
        progressPolicy: "omit",
        source: { fileName: "round-trip.csv", text },
      },
    );
    expect(text).toContain(`"'=HYPERLINK(""https://invalid.example"",""x,y"")"`);
    expect(restored.decks[0]?.notes[0]?.fields[1]?.value).toBe('line 1\n"line 2"');
  });

  it("produces a minimized formula-safe diagnostic report", () => {
    const csv = diagnosticsToCsv([
      {
        code: "row_skipped",
        item: "=2+2",
        message: "@not executable",
        path: "row.3",
        severity: "warning",
      },
    ]);
    expect(csv).toContain(`"'=2+2"`);
    expect(csv).toContain(`"'@not executable"`);
    expect(csv).not.toContain("full source");
  });

  it("supports 100,000 bounded text rows without expanding the preview", () => {
    const text = Array.from(
      { length: 100_000 },
      (_, index) => `term-${String(index)}\tdefinition-${String(index)}`,
    ).join("\n");
    const parsed = parseTermDefinitionText(text);
    expect(parsed.notes).toHaveLength(100_000);
  }, 20_000);
});

describe("JSON, Markdown, execution, and printable coverage", () => {
  it("maps common Q/A JSON arrays, custom fields, and tags deterministically", async () => {
    const source = {
      fileName: "cards.json",
      text: JSON.stringify({
        cards: [
          { a: "Four", q: "2 + 2?", tags: "math;facts" },
          {
            fields: { Answer: "Mitochondria", Hint: "Organelle", Prompt: "Cell power?" },
            tags: ["biology"],
          },
        ],
        title: "Mixed JSON",
      }),
    };
    const graph = await jsonAdapter.map(source, {
      adapterCode: "lumen_json",
      duplicatePolicy: "skip",
      progressPolicy: "omit",
      source,
    });
    expect(graph.decks[0]?.title).toBe("Mixed JSON");
    expect(graph.decks[0]?.notes).toHaveLength(2);
    expect(graph.decks[0]?.notes[1]?.fields).toHaveLength(3);
    expect(graph.warnings[0]?.code).toBe("generic_json_mapping");
  });

  it("parses readable Markdown frontmatter and cloze syntax", async () => {
    const source = {
      fileName: "biology.md",
      text: `---
title: "Biology"
tags: ["science", "cells"]
---
# Biology
## Card 1
### Front
{{c1::ATP}} stores energy.
### Back
A nucleotide.
### Tags
energy, molecule
### Source
Synthetic fixture
`,
    };
    const graph = await markdownAdapter.map(source, {
      adapterCode: "markdown_bundle",
      duplicatePolicy: "skip",
      progressPolicy: "omit",
      source,
    });
    expect(graph.decks[0]).toMatchObject({
      tags: ["science", "cells"],
      title: "Biology",
    });
    expect(graph.decks[0]?.notes[0]?.generatedCards[0]?.kind).toBe("cloze");
  });

  it("honors cancellation before a sink write", async () => {
    const source = { text: "front\tback" };
    const writeGraph = vi.fn();
    const consume = async () => {
      for await (const _progress of textAdapter.execute(
        {
          adapterCode: "quizlet_text",
          duplicatePolicy: "skip",
          progressPolicy: "omit",
          source,
        },
        { isCancelled: () => true, writeGraph },
      )) {
        // Consume the adapter protocol until cancellation is observed.
      }
    };
    await expect(consume()).rejects.toMatchObject({ code: "cancelled" });
    expect(writeGraph).not.toHaveBeenCalled();
  });

  it("escapes active content and emits unclipped print structures", async () => {
    const graph = portabilityGraph();
    const note = graph.decks[0]?.notes[0];
    const front = note?.fields[0];
    if (!note || !front) throw new Error("fixture note missing");
    note.fields[0] = { ...front, value: '<img onerror="alert(1)">' };
    const artifact = await createPrintableHtml(graph, {
      includeAnswers: false,
      layout: "test",
    });
    const html = new TextDecoder().decode(artifact.bytes);
    expect(html).toContain("&lt;img onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain('<img onerror="alert(1)">');
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain('data-layout="test"');
    expect(html).toContain('aria-label="Answer space"');
  });
});

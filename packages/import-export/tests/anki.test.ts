import { describe, expect, it } from "vitest";

import {
  ankiAdapter,
  createZip,
  exportAnkiPackage,
  readAnkiMediaFiles,
  safeUnzip,
  sha256Hex,
} from "../src";
import { portabilityGraph } from "./fixtures";

describe("Anki package adapter", () => {
  it("writes a real SQLite package and round-trips notes and selected progress", async () => {
    const graph = portabilityGraph();
    const artifact = await exportAnkiPackage(graph, {
      fileName: "biology",
      includeProgress: true,
    });
    const files = safeUnzip(artifact.bytes);
    expect(new TextDecoder().decode(files.get("collection.anki2")?.slice(0, 16))).toBe(
      "SQLite format 3\u0000",
    );

    const source = { bytes: artifact.bytes, fileName: artifact.fileName };
    const inspection = await ankiAdapter.inspect(source);
    const restored = await ankiAdapter.map(source, {
      adapterCode: "anki_package",
      duplicatePolicy: "skip",
      progressPolicy: "import_if_empty",
      source,
    });
    expect(inspection.detectedFormat).toBe("anki_apkg");
    expect(restored.decks[0]?.title).toBe("Cell biology");
    expect(restored.decks[0]?.folderPath).toEqual(["Science"]);
    expect(restored.decks[0]?.notes[0]?.fields.map((field) => field.value)).toEqual([
      "What is ATP?",
      "The main energy-carrying molecule in cells.",
    ]);
    expect(restored.schedules).toHaveLength(1);
    expect(restored.reviews).toHaveLength(1);
  });

  it("does not import scheduling when the progress policy omits it", async () => {
    const artifact = await exportAnkiPackage(portabilityGraph(), {
      includeProgress: true,
    });
    const source = { bytes: artifact.bytes, fileName: "deck.apkg" };
    const restored = await ankiAdapter.map(source, {
      adapterCode: "anki_package",
      duplicatePolicy: "skip",
      progressPolicy: "omit",
      source,
    });
    expect(restored.schedules).toEqual([]);
    expect(restored.reviews).toEqual([]);
    expect(restored.loss).toEqual([
      expect.objectContaining({ feature: "anki_progress", policy: "omitted" }),
    ]);
  });

  it("preserves sibling cards, cloze/typed models, custom fields, tags, and Unicode", async () => {
    const graph = portabilityGraph();
    const first = graph.decks[0]?.notes[0];
    if (!first) throw new Error("fixture note missing");
    first.noteTypeCode = "basic_reversed";
    first.fields.push({ key: "Hint", name: "Hint", value: "Énergie ⚡" });
    first.tags = ["biology", "日本語"];
    first.generatedCards.push({
      active: true,
      externalId: "card-1-reverse",
      generationKey: "reverse",
      kind: "basic_reversed",
      ordinal: 1,
      templateKey: "reverse",
    });
    graph.decks[0]?.notes.push({
      externalId: "note-cloze",
      fields: [{ key: "Text", name: "Text", value: "{{c1::ATP}} stores energy." }],
      generatedCards: [
        {
          active: true,
          externalId: "card-cloze",
          generationKey: "cloze-1",
          kind: "cloze",
          ordinal: 0,
          templateKey: "cloze",
        },
      ],
      mediaExternalIds: [],
      noteTypeCode: "cloze",
      source: "",
      tags: ["cloze"],
    });
    graph.decks[0]?.notes.push({
      externalId: "note-typed",
      fields: [
        { key: "Front", name: "Front", value: "Spell mitochondria" },
        { key: "Back", name: "Back", value: "mitochondria" },
      ],
      generatedCards: [
        {
          active: true,
          externalId: "card-typed",
          generationKey: "typed",
          kind: "typed_answer",
          ordinal: 0,
          templateKey: "typed",
        },
      ],
      mediaExternalIds: [],
      noteTypeCode: "typed_answer",
      source: "",
      tags: ["typed"],
    });
    const artifact = await exportAnkiPackage(graph);
    const source = { bytes: artifact.bytes, fileName: "types.apkg" };
    const restored = await ankiAdapter.map(source, {
      adapterCode: "anki_package",
      duplicatePolicy: "skip",
      progressPolicy: "omit",
      source,
    });
    expect(restored.decks[0]?.notes).toHaveLength(3);
    expect(restored.decks[0]?.notes[0]).toMatchObject({
      tags: ["biology", "日本語"],
    });
    expect(restored.decks[0]?.notes[0]?.fields[2]?.value).toBe("Énergie ⚡");
    expect(restored.decks[0]?.notes[0]?.generatedCards).toHaveLength(2);
    expect(restored.decks[0]?.notes[1]?.generatedCards[0]?.kind).toBe("cloze");
    expect(
      restored.noteTypes.some((type) =>
        type.templates.some((template) => template.front.includes("type:Back")),
      ),
    ).toBe(true);
  });

  it("preserves verified image/audio relationships and the media map", async () => {
    const graph = portabilityGraph();
    const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const audio = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 0]);
    const imageHash = await sha256Hex(image);
    const audioHash = await sha256Hex(audio);
    graph.media = [
      {
        altText: "Synthetic image",
        byteSize: image.byteLength,
        externalId: "image-1",
        fileName: "cell.png",
        kind: "image",
        mimeType: "image/png",
        sha256: imageHash,
      },
      {
        altText: "Synthetic audio",
        byteSize: audio.byteLength,
        externalId: "audio-1",
        fileName: "spoken.mp3",
        kind: "audio",
        mimeType: "audio/mpeg",
        sha256: audioHash,
      },
    ];
    const note = graph.decks[0]?.notes[0];
    if (!note) throw new Error("fixture note missing");
    note.mediaExternalIds = ["image-1", "audio-1"];
    const artifact = await exportAnkiPackage(graph, {
      mediaFiles: new Map([
        [imageHash, image],
        [audioHash, audio],
      ]),
    });
    const source = { bytes: artifact.bytes, fileName: "media.apkg" };
    const restored = await ankiAdapter.map(source, {
      adapterCode: "anki_package",
      duplicatePolicy: "skip",
      progressPolicy: "omit",
      source,
    });
    expect(restored.media).toHaveLength(2);
    expect(restored.decks[0]?.notes[0]?.mediaExternalIds).toHaveLength(2);
    expect(await readAnkiMediaFiles(source)).toEqual(
      new Map([
        [imageHash, image],
        [audioHash, audio],
      ]),
    );
  });

  it("requires an explicit policy for unsupported interactive cards", async () => {
    const graph = portabilityGraph();
    const card = graph.decks[0]?.notes[0]?.generatedCards[0];
    if (!card) throw new Error("fixture card missing");
    card.kind = "diagram_hotspot";
    await expect(exportAnkiPackage(graph)).rejects.toMatchObject({
      code: "unsupported_archive",
    });
    const flattened = await exportAnkiPackage(graph, {
      unsupportedCardPolicy: "flatten",
    });
    expect(flattened.loss).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          count: 1,
          feature: "interactive_card_behavior",
          policy: "approximated",
        }),
      ]),
    );
    const omitted = await exportAnkiPackage(graph, {
      unsupportedCardPolicy: "omit",
    });
    expect(omitted.loss).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "interactive_card_behavior",
          policy: "omitted",
        }),
      ]),
    );
  });

  it("rejects missing, malformed, and corrupted collection data", async () => {
    const missing = createZip(new Map([["media", new TextEncoder().encode("{}")]]));
    await expect(
      ankiAdapter.inspect({ bytes: missing, fileName: "missing.apkg" }),
    ).rejects.toMatchObject({ code: "invalid_format" });

    const corrupt = createZip(
      new Map([
        ["collection.anki2", new TextEncoder().encode("SQLite format 3\u0000not-a-database")],
        ["media", new TextEncoder().encode("{}")],
      ]),
    );
    await expect(
      ankiAdapter.inspect({ bytes: corrupt, fileName: "corrupt.apkg" }),
    ).rejects.toMatchObject({ code: "sqlite_invalid" });

    const valid = await exportAnkiPackage(portabilityGraph());
    const files = new Map(safeUnzip(valid.bytes));
    files.set("media", new TextEncoder().encode('{"0":'));
    await expect(
      ankiAdapter.inspect({
        bytes: createZip(files),
        fileName: "malformed-media.apkg",
      }),
    ).rejects.toMatchObject({ code: "invalid_format" });
  });
});

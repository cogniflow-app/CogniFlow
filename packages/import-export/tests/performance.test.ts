import { describe, expect, it } from "vitest";

import {
  createLumenArchive,
  delimitedAdapter,
  encryptArchive,
  parseTermDefinitionText,
  readLumenArchive,
} from "../src";
import { portabilityGraph } from "./fixtures";

describe("portability performance budgets", () => {
  it("inspects and maps 10,000 CSV rows within the local CI budget", async () => {
    const text = [
      "term,definition,tags",
      ...Array.from(
        { length: 10_000 },
        (_, index) => `term-${String(index)},definition-${String(index)},tag-${String(index % 17)}`,
      ),
    ].join("\n");
    const source = { fileName: "ten-thousand.csv", text };
    const startedAt = performance.now();
    const inspection = await delimitedAdapter.inspect(source);
    const graph = await delimitedAdapter.map(source, {
      adapterCode: "delimited",
      duplicatePolicy: "skip",
      mapping: inspection.mapping,
      progressPolicy: "omit",
      source,
    });
    const durationMs = performance.now() - startedAt;
    expect(graph.decks[0]?.notes).toHaveLength(10_000);
    expect(inspection.sample.length).toBeLessThanOrEqual(10);
    expect(durationMs).toBeLessThan(5_000);
  });

  it("parses 100,000 text rows within the local CI budget", () => {
    const text = Array.from(
      { length: 100_000 },
      (_, index) => `term-${String(index)}\tdefinition-${String(index)}`,
    ).join("\n");
    const startedAt = performance.now();
    const parsed = parseTermDefinitionText(text);
    const durationMs = performance.now() - startedAt;
    expect(parsed.notes).toHaveLength(100_000);
    expect(durationMs).toBeLessThan(10_000);
  }, 20_000);

  it("creates, verifies, restores, and encrypts a 10,000-card archive within budget", async () => {
    const graph = portabilityGraph();
    const deck = graph.decks[0];
    const note = deck?.notes[0];
    if (!deck || !note) throw new Error("fixture note missing");
    deck.notes = Array.from({ length: 10_000 }, (_, index) => ({
      ...structuredClone(note),
      externalId: `note-${String(index)}`,
      fields: note.fields.map((field) => ({
        ...field,
        value: `${field.value} · ${String(index)}`,
      })),
      generatedCards: note.generatedCards.map((card) => ({
        ...card,
        externalId: `card-${String(index)}`,
      })),
    }));
    graph.reviews = [];
    graph.schedules = [];
    const startedAt = performance.now();
    const artifact = await createLumenArchive(graph);
    const restored = await readLumenArchive(artifact.bytes);
    const encrypted = await encryptArchive(artifact.bytes, "synthetic performance passphrase");
    const durationMs = performance.now() - startedAt;
    expect(restored.decks[0]?.notes).toHaveLength(10_000);
    expect(encrypted.byteLength).toBeGreaterThan(artifact.bytes.byteLength);
    expect(durationMs).toBeLessThan(20_000);
  }, 30_000);
});

import type {
  AdapterCapability,
  NormalizedDeck,
  NormalizedField,
  NormalizedGraph,
  NormalizedNote,
  PortabilityDiagnostic,
  PortabilityFormat,
} from "./schemas";

export const SIMPLE_CAPABILITIES: AdapterCapability = Object.freeze({
  customFields: false,
  folders: false,
  media: false,
  noteTypes: false,
  practice: false,
  publications: false,
  reviewHistory: false,
  schedules: false,
  settings: false,
  tags: true,
  templates: false,
});

export const STRUCTURED_CAPABILITIES: AdapterCapability = Object.freeze({
  customFields: true,
  folders: true,
  media: true,
  noteTypes: true,
  practice: true,
  publications: true,
  reviewHistory: true,
  schedules: true,
  settings: true,
  tags: true,
  templates: true,
});

export function graphNow(): string {
  // Import plans are pure and fingerprintable. The server records the actual
  // import time when it executes the plan.
  return "1970-01-01T00:00:00.000Z";
}

export function stableExternalId(namespace: string, ...values: readonly string[]) {
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(
    values.map((value) => value.normalize("NFKC").trim()).join("\u001f"),
  );
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `${namespace}:${hash.toString(16).padStart(16, "0")}`;
}

export function normalizedField(key: string, name: string, value: string): NormalizedField {
  return Object.freeze({ key, name, value: value.normalize("NFKC").trim() });
}

export function basicNote(input: {
  readonly back: string;
  readonly externalId?: string;
  readonly front: string;
  readonly source?: string;
  readonly tags?: readonly string[];
}): NormalizedNote {
  const tags = [
    ...new Set((input.tags ?? []).map((tag) => tag.normalize("NFKC").trim()).filter(Boolean)),
  ].slice(0, 100);
  return {
    ...(input.externalId ? { externalId: input.externalId } : {}),
    fields: [
      normalizedField("Front", "Front", input.front),
      normalizedField("Back", "Back", input.back),
    ],
    generatedCards: [
      {
        active: true,
        generationKey: "forward",
        kind: "basic",
        ordinal: 0,
        templateKey: "forward",
      },
    ],
    mediaExternalIds: [],
    noteTypeCode: "basic",
    source: input.source?.normalize("NFKC").trim() ?? "",
    tags,
  };
}

export function simpleGraph(input: {
  readonly adapter: string;
  readonly deckTitle: string;
  readonly diagnostics?: readonly PortabilityDiagnostic[];
  readonly format: PortabilityFormat;
  readonly notes: readonly NormalizedNote[];
  readonly sourceName?: string;
  readonly sourceSha256?: string;
}): NormalizedGraph {
  const deck: NormalizedDeck = {
    description: "",
    folderPath: [],
    notes: [...input.notes],
    sourceFormat: input.format,
    tags: [],
    title: input.deckTitle.normalize("NFKC").trim().slice(0, 180) || "Imported cards",
  };
  return {
    decks: [deck],
    folders: [],
    loss: [],
    mastery: [],
    media: [],
    noteTypes: [],
    practice: [],
    provenance: {
      adapter: input.adapter,
      createdAt: graphNow(),
      sourceFormat: input.format,
      ...(input.sourceName ? { sourceName: input.sourceName } : {}),
      ...(input.sourceSha256 ? { sourceSha256: input.sourceSha256 } : {}),
    },
    publications: [],
    reviews: [],
    revisions: [],
    schedules: [],
    schemaVersion: 1,
    settings: {},
    warnings: [...(input.diagnostics ?? [])],
  };
}

export function deckTitleFromFile(fileName: string | undefined, fallback = "Imported cards") {
  if (!fileName) return fallback;
  const base = fileName
    .replace(/\.[^.]+$/u, "")
    .normalize("NFKC")
    .trim();
  return base.slice(0, 180) || fallback;
}

export function countGraphItems(graph: NormalizedGraph): number {
  return graph.decks.reduce((total, deck) => total + deck.notes.length, 0);
}

import { PortabilityError } from "./errors";
import {
  type ExportAdapter,
  type ImportAdapter,
  type ImportProgress,
  type PortabilityInspection,
  normalizedGraphSchema,
  portabilitySourceSchema,
} from "./schemas";
import { canonicalJson, parseSafeJson, safeFileName, sha256Hex, sourceText } from "./safety";
import {
  STRUCTURED_CAPABILITIES,
  basicNote,
  countGraphItems,
  deckTitleFromFile,
  simpleGraph,
  stableExternalId,
} from "./shared";

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function firstString(row: Readonly<Record<string, unknown>>, keys: readonly string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function tags(row: Readonly<Record<string, unknown>>) {
  const value = row.tags;
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").slice(0, 100);
  }
  return typeof value === "string"
    ? value
        .split(/[;,]/u)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 100)
    : [];
}

function genericRows(value: unknown) {
  if (Array.isArray(value)) return value;
  const root = record(value);
  if (!root) return [];
  if (Array.isArray(root.cards)) return root.cards;
  if (Array.isArray(root.notes)) return root.notes;
  return [];
}

function genericJsonGraph(value: unknown, fileName?: string, destinationDeckTitle?: string) {
  const root = record(value);
  const rows = genericRows(value);
  const notes = rows.flatMap((item) => {
    const row = record(item);
    if (!row) return [];
    const fieldRecord = record(row.fields);
    const fieldArray = Array.isArray(row.fields)
      ? row.fields.flatMap((field) => {
          const parsed = record(field);
          return typeof parsed?.name === "string" && typeof parsed.value === "string"
            ? [{ key: parsed.name, name: parsed.name, value: parsed.value }]
            : [];
        })
      : fieldRecord
        ? Object.entries(fieldRecord).flatMap(([name, fieldValue]) =>
            typeof fieldValue === "string" ? [{ key: name, name, value: fieldValue }] : [],
          )
        : [];
    if (fieldArray.length >= 2) {
      return [
        {
          externalId:
            typeof row.id === "string"
              ? row.id
              : stableExternalId(
                  "json",
                  ...fieldArray.map((field) => `${field.key}\u001e${field.value}`),
                ),
          fields: fieldArray,
          generatedCards: [
            {
              active: true,
              generationKey: "forward",
              kind: typeof row.cardType === "string" ? row.cardType.slice(0, 80) : "custom",
              ordinal: 0,
              templateKey: "forward",
            },
          ],
          mediaExternalIds: [],
          noteTypeCode:
            typeof row.noteType === "string" ? row.noteType.slice(0, 120) : "generic-json",
          source: typeof row.source === "string" ? row.source : "",
          tags: tags(row),
        },
      ];
    }
    const front = firstString(row, ["front", "term", "question", "prompt", "q"]);
    const back = firstString(row, ["back", "definition", "answer", "meaning", "a"]);
    if (!front || !back) return [];
    return [
      basicNote({
        back,
        externalId: typeof row.id === "string" ? row.id : stableExternalId("json", front, back),
        front,
        source: typeof row.source === "string" ? row.source : "",
        tags: tags(row),
      }),
    ];
  });
  if (notes.length === 0) {
    throw new PortabilityError(
      "invalid_schema",
      "JSON must be a Lumen graph or contain Q/A cards with front/back-style fields.",
    );
  }
  const title =
    destinationDeckTitle ??
    (typeof root?.title === "string" ? root.title.slice(0, 180) : undefined) ??
    deckTitleFromFile(fileName, "JSON import");
  const graph = simpleGraph({
    adapter: "generic_qa_json",
    deckTitle: title,
    format: "lumen_json",
    notes,
    ...(fileName ? { sourceName: fileName } : {}),
  });
  return {
    ...graph,
    warnings: [
      {
        code: "generic_json_mapping",
        message:
          "Generic Q/A JSON was mapped to safe Lumen fields; review the preview before importing.",
        severity: "info" as const,
      },
    ],
  };
}

const jsonAdapterDefinition: ImportAdapter & ExportAdapter = {
  capabilities: STRUCTURED_CAPABILITIES,
  code: "lumen_json",
  formats: Object.freeze(["lumen_json"] as const),
  async detect(source) {
    const text = sourceText(portabilitySourceSchema.parse(source)).trimStart();
    if (!text.startsWith("{") && !text.startsWith("[")) return 0;
    try {
      const value = parseSafeJson(text);
      if (normalizedGraphSchema.safeParse(value).success) return 1;
      return genericRows(value).length > 0 ? 0.85 : 0.25;
    } catch {
      return 0.1;
    }
  },
  async *execute(plan, sink): AsyncIterable<ImportProgress> {
    const graph = await jsonAdapterDefinition.map(plan.source, plan);
    yield {
      completedItems: 0,
      diagnostics: graph.warnings,
      phase: "validate",
      totalItems: countGraphItems(graph),
    };
    if (await sink.isCancelled())
      throw new PortabilityError("cancelled", "The import was cancelled.");
    await sink.writeGraph(graph);
    yield {
      completedItems: countGraphItems(graph),
      diagnostics: graph.warnings,
      phase: "finalize",
      totalItems: countGraphItems(graph),
    };
  },
  async export(plan) {
    const bytes = new TextEncoder().encode(`${canonicalJson(plan.graph)}\n`);
    return {
      bytes,
      diagnostics: [],
      fileName: `${safeFileName(plan.fileName.replace(/\.[^.]+$/u, ""))}.json`,
      format: "lumen_json",
      loss: [],
      mimeType: "application/json",
      sha256: await sha256Hex(bytes),
    };
  },
  async inspect(source): Promise<PortabilityInspection> {
    const graph = await jsonAdapterDefinition.map(source, {
      adapterCode: "lumen_json",
      duplicatePolicy: "skip",
      progressPolicy: "omit",
      source,
    });
    return {
      adapterCode: "lumen_json",
      capabilities: STRUCTURED_CAPABILITIES,
      detectedFormat: "lumen_json",
      diagnostics: graph.warnings,
      estimatedItems: countGraphItems(graph),
      loss: graph.loss,
      sample: graph.decks.slice(0, 10).map((deck) => ({
        notes: deck.notes.length,
        title: deck.title,
      })),
    };
  },
  async map(source, plan) {
    const parsedSource = portabilitySourceSchema.parse(source);
    const value = parseSafeJson(sourceText(parsedSource));
    const parsed = normalizedGraphSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    return genericJsonGraph(value, parsedSource.fileName, plan.destinationDeckTitle);
  },
};

export const jsonAdapter: ImportAdapter & ExportAdapter = Object.freeze(jsonAdapterDefinition);

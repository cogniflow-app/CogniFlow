import { PortabilityError } from "./errors";
import type {
  DelimiterMapping,
  ExportAdapter,
  ExportPlan,
  ImportAdapter,
  ImportPlan,
  ImportProgress,
  NormalizedGraph,
  PortabilityDiagnostic,
  PortabilityFormat,
  PortabilitySource,
} from "./schemas";
import { delimiterMappingSchema, portabilitySourceSchema } from "./schemas";
import { safeFileName, sha256Hex, sourceText } from "./safety";
import {
  SIMPLE_CAPABILITIES,
  basicNote,
  countGraphItems,
  deckTitleFromFile,
  simpleGraph,
  stableExternalId,
} from "./shared";

export interface DelimitedParseOptions {
  readonly delimiter: "," | "\t" | ";" | "|";
  readonly maxColumns?: number;
  readonly maxFieldCharacters?: number;
  readonly maxRows?: number;
}

const DELIMITED_CAPABILITIES = Object.freeze({
  ...SIMPLE_CAPABILITIES,
  customFields: true,
});

export function parseDelimited(
  source: string,
  options: DelimitedParseOptions,
): readonly (readonly string[])[] {
  const maxRows = options.maxRows ?? 100_001;
  const maxColumns = options.maxColumns ?? 501;
  const maxFieldCharacters = options.maxFieldCharacters ?? 1_000_000;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;

  const pushField = () => {
    if (field.length > maxFieldCharacters) {
      throw new PortabilityError("archive_limit", "A delimited field exceeds the allowed size.");
    }
    row.push(field);
    field = "";
    afterQuote = false;
    if (row.length > maxColumns) {
      throw new PortabilityError("archive_limit", "A row has too many columns.");
    }
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
    if (rows.length > maxRows) {
      throw new PortabilityError("archive_limit", "The file has too many rows.");
    }
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source.charAt(index);
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (afterQuote && character !== options.delimiter && character !== "\r" && character !== "\n") {
      if (!/\s/u.test(character)) {
        throw new PortabilityError(
          "invalid_format",
          "Unexpected text appears after a closing quote.",
        );
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === options.delimiter) {
      pushField();
    } else if (character === "\n") {
      pushRow();
    } else if (character === "\r") {
      if (source[index + 1] === "\n") index += 1;
      pushRow();
    } else {
      field += character;
    }
  }
  if (quoted) throw new PortabilityError("invalid_format", "A quoted field is not closed.");
  if (field.length > 0 || row.length > 0) pushRow();
  return Object.freeze(
    rows
      .filter((candidate) => candidate.some((cell) => cell.length > 0))
      .map((candidate) => Object.freeze(candidate)),
  );
}

export function inferDelimiter(source: string): "," | "\t" | ";" | "|" {
  const candidates = [",", "\t", ";", "|"] as const;
  const sample = source.slice(0, 50_000);
  let best: { readonly delimiter: (typeof candidates)[number]; readonly score: number } = {
    delimiter: "\t",
    score: -1,
  };
  for (const delimiter of candidates) {
    try {
      const rows = parseDelimited(sample, { delimiter });
      const widths = rows.slice(0, 20).map((row) => row.length);
      const multi = widths.filter((width) => width >= 2).length;
      const mostCommon = Math.max(
        0,
        ...[...new Set(widths)].map(
          (width) => widths.filter((candidate) => candidate === width).length,
        ),
      );
      const score = multi * 10 + mostCommon;
      if (score > best.score) best = { delimiter, score };
    } catch {
      // Another candidate may still be valid.
    }
  }
  return best.delimiter;
}

const frontHeaders = new Set(["front", "term", "question", "prompt", "word"]);
const backHeaders = new Set(["back", "definition", "answer", "meaning"]);

export function inferDelimitedMapping(
  rows: readonly (readonly string[])[],
  delimiter: DelimiterMapping["delimiter"],
) {
  const first = rows[0] ?? [];
  const normalized = first.map((value) => value.normalize("NFKC").trim().toLowerCase());
  const front = normalized.findIndex((value) => frontHeaders.has(value));
  const back = normalized.findIndex((value) => backHeaders.has(value));
  const hasHeader = front >= 0 && back >= 0;
  const indexOf = (values: readonly string[]) =>
    normalized.findIndex((value) => values.includes(value));
  const optionalIndex = (value: number) => (value >= 0 ? value : undefined);
  const reserved = new Set(
    [
      front,
      back,
      indexOf(["deck", "set"]),
      indexOf(["id", "external_id", "external id"]),
      indexOf(["source", "citation"]),
      indexOf(["tags", "tag"]),
    ].filter((index) => index >= 0),
  );
  const customFieldColumns = Object.fromEntries(
    first.flatMap((label, index) =>
      hasHeader && label.trim() && !reserved.has(index)
        ? [[label.normalize("NFKC").trim().slice(0, 120), index]]
        : [],
    ),
  );
  return delimiterMappingSchema.parse({
    backColumn: hasHeader ? back : 1,
    ...(Object.keys(customFieldColumns).length > 0 ? { customFieldColumns } : {}),
    delimiter,
    ...(optionalIndex(indexOf(["deck", "set"])) === undefined
      ? {}
      : { deckColumn: optionalIndex(indexOf(["deck", "set"])) }),
    ...(optionalIndex(indexOf(["id", "external_id", "external id"])) === undefined
      ? {}
      : { externalIdColumn: optionalIndex(indexOf(["id", "external_id", "external id"])) }),
    frontColumn: hasHeader ? front : 0,
    hasHeader,
    ...(optionalIndex(indexOf(["source", "citation"])) === undefined
      ? {}
      : { sourceColumn: optionalIndex(indexOf(["source", "citation"])) }),
    ...(optionalIndex(indexOf(["tags", "tag"])) === undefined
      ? {}
      : { tagsColumn: optionalIndex(indexOf(["tags", "tag"])) }),
  });
}

function cell(row: readonly string[], index: number | undefined) {
  return index === undefined ? "" : (row[index] ?? "").normalize("NFKC").trim();
}

export function graphFromDelimitedRows(
  source: PortabilitySource,
  rows: readonly (readonly string[])[],
  mapping: DelimiterMapping,
  adapterCode: string,
  options: {
    readonly deckTitle?: string;
    readonly format?: PortabilityFormat;
  } = {},
): NormalizedGraph {
  const dataRows = mapping.hasHeader ? rows.slice(1) : rows;
  const diagnostics: PortabilityDiagnostic[] = [];
  const notes = dataRows.flatMap((row, index) => {
    const front = cell(row, mapping.frontColumn);
    const back = cell(row, mapping.backColumn);
    if (!front || !back) {
      diagnostics.push({
        code: "row_skipped",
        item: `Row ${String(index + (mapping.hasHeader ? 2 : 1))}`,
        message: "The row needs both a front and a back value.",
        severity: "warning" as const,
      });
      return [];
    }
    const tags = cell(row, mapping.tagsColumn)
      .split(/[;,]/u)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const note = basicNote({
      back,
      ...(cell(row, mapping.externalIdColumn)
        ? { externalId: cell(row, mapping.externalIdColumn) }
        : { externalId: stableExternalId("delimited", front, back) }),
      front,
      source: cell(row, mapping.sourceColumn),
      tags,
    });
    const customFields = Object.entries(mapping.customFieldColumns ?? {}).flatMap(
      ([name, column]) => {
        const value = cell(row, column);
        return value ? [{ key: name, name, value }] : [];
      },
    );
    return [
      customFields.length > 0
        ? {
            ...note,
            fields: [...note.fields, ...customFields],
            generatedCards: note.generatedCards.map((card) => ({
              ...card,
              kind: "custom",
            })),
            noteTypeCode: "custom-import",
          }
        : note,
    ];
  });
  return simpleGraph({
    adapter: adapterCode,
    deckTitle:
      options.deckTitle ??
      dataRows.map((row) => cell(row, mapping.deckColumn)).find(Boolean) ??
      deckTitleFromFile(source.fileName),
    diagnostics,
    format: options.format ?? (mapping.delimiter === "\t" ? "tsv" : "csv"),
    notes,
    ...(source.fileName ? { sourceName: source.fileName } : {}),
  });
}

function formulaSafe(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

function quoteCell(value: string, delimiter: string) {
  const safe = formulaSafe(value);
  return safe.includes(delimiter) || /["\r\n]/u.test(safe)
    ? `"${safe.replaceAll('"', '""')}"`
    : safe;
}

export function exportDelimitedText(graph: NormalizedGraph, delimiter: "," | "\t" | ";" | "|") {
  const output = [
    ["deck", "front", "back", "tags", "source", "external_id"]
      .map((value) => quoteCell(value, delimiter))
      .join(delimiter),
  ];
  for (const deck of graph.decks) {
    for (const note of deck.notes) {
      const front = note.fields.find((field) => /^(front|term|question|prompt)$/iu.test(field.key));
      const back = note.fields.find((field) =>
        /^(back|definition|answer|meaning)$/iu.test(field.key),
      );
      output.push(
        [
          deck.title,
          front?.value ?? note.fields[0]?.value ?? "",
          back?.value ?? note.fields[1]?.value ?? "",
          note.tags.join(";"),
          note.source,
          note.externalId ?? "",
        ]
          .map((value) => quoteCell(value, delimiter))
          .join(delimiter),
      );
    }
  }
  return `${output.join("\r\n")}\r\n`;
}

const delimitedAdapterDefinition: ImportAdapter & ExportAdapter = {
  capabilities: DELIMITED_CAPABILITIES,
  code: "delimited",
  formats: Object.freeze(["csv", "tsv"] as const),
  async detect(source) {
    const name = source.fileName?.toLowerCase() ?? "";
    if (name.endsWith(".csv") || name.endsWith(".tsv")) return 0.98;
    const text = sourceText(source).slice(0, 10_000);
    const delimiter = inferDelimiter(text);
    return parseDelimited(text, { delimiter, maxRows: 20 }).some((row) => row.length >= 2)
      ? 0.7
      : 0.1;
  },
  async *execute(plan: ImportPlan, sink): AsyncIterable<ImportProgress> {
    yield { completedItems: 0, diagnostics: [], phase: "validate", totalItems: null };
    if (await sink.isCancelled()) {
      throw new PortabilityError("cancelled", "The import was cancelled.");
    }
    const graph = await delimitedAdapterDefinition.map(plan.source, plan);
    yield {
      completedItems: 0,
      diagnostics: graph.warnings,
      phase: "write",
      totalItems: countGraphItems(graph),
    };
    await sink.writeGraph(graph);
    yield {
      completedItems: countGraphItems(graph),
      diagnostics: graph.warnings,
      phase: "finalize",
      totalItems: countGraphItems(graph),
    };
  },
  async export(plan) {
    const parsed = ExportPlanSchemaForRuntime.parse(plan);
    const delimiter = parsed.format === "tsv" ? "\t" : ",";
    const text = exportDelimitedText(parsed.graph, delimiter);
    const bytes = new TextEncoder().encode(text);
    return {
      bytes,
      diagnostics: [],
      fileName: `${safeFileName(parsed.fileName.replace(/\.[^.]+$/u, ""))}.${parsed.format}`,
      format: parsed.format,
      loss: [
        {
          count: parsed.graph.media.length,
          feature: "structured_features",
          message:
            "Delimited export preserves front, back, tags, source, deck, and external IDs only.",
          policy: "omitted" as const,
        },
      ].filter((item) => item.count > 0),
      mimeType: parsed.format === "tsv" ? "text/tab-separated-values" : "text/csv",
      sha256: await sha256Hex(bytes),
    };
  },
  async inspect(source) {
    const parsedSource = portabilitySourceSchema.parse(source);
    const text = sourceText(parsedSource);
    const delimiter = inferDelimiter(text);
    const rows = parseDelimited(text, { delimiter });
    const mapping = inferDelimitedMapping(rows, delimiter);
    return {
      adapterCode: "delimited",
      capabilities: DELIMITED_CAPABILITIES,
      detectedFormat: delimiter === "\t" ? "tsv" : "csv",
      diagnostics:
        rows.length === 0
          ? [
              {
                code: "empty_source",
                message: "No importable rows were found.",
                severity: "warning",
              },
            ]
          : [],
      estimatedItems: Math.max(0, rows.length - (mapping.hasHeader ? 1 : 0)),
      loss: [],
      mapping,
      sample: rows.slice(0, 10).map((row, index) => ({
        back: cell(row, mapping.backColumn),
        front: cell(row, mapping.frontColumn),
        row: index + 1,
      })),
    };
  },
  async map(source, plan) {
    const parsedSource = portabilitySourceSchema.parse(source);
    const text = sourceText(parsedSource);
    const delimiter = plan.mapping?.delimiter ?? inferDelimiter(text);
    const rows = parseDelimited(text, { delimiter });
    const mapping = plan.mapping ?? inferDelimitedMapping(rows, delimiter);
    return graphFromDelimitedRows(parsedSource, rows, mapping, "delimited", {
      ...(plan.destinationDeckTitle ? { deckTitle: plan.destinationDeckTitle } : {}),
    });
  },
};

export const delimitedAdapter: ImportAdapter & ExportAdapter = Object.freeze(
  delimitedAdapterDefinition,
);

// Kept local to avoid a circular type-only import in generated declaration builds.
const ExportPlanSchemaForRuntime = {
  parse(value: ExportPlan) {
    if (value.format !== "csv" && value.format !== "tsv") {
      throw new PortabilityError("invalid_format", "Choose CSV or TSV for delimited export.");
    }
    return value;
  },
};

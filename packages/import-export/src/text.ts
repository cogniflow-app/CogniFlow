import { PortabilityError } from "./errors";
import type {
  ExportAdapter,
  ImportAdapter,
  ImportProgress,
  PortabilityDiagnostic,
  PortabilityInspection,
  TextMapping,
} from "./schemas";
import { portabilitySourceSchema, textMappingSchema } from "./schemas";
import { safeFileName, sha256Hex, sourceText } from "./safety";
import {
  SIMPLE_CAPABILITIES,
  basicNote,
  countGraphItems,
  deckTitleFromFile,
  simpleGraph,
  stableExternalId,
} from "./shared";

const separators = ["\t", ",", ";", " :: ", "|"] as const;

function bestSeparator(text: string) {
  const lines = text
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .slice(0, 100);
  const ranked = separators
    .map((separator) => ({
      count: lines.filter((line) => line.includes(separator)).length,
      separator,
    }))
    .sort((left, right) => right.count - left.count);
  const best = ranked[0] ?? { count: 0, separator: "\t" as const };
  return {
    confidence: lines.length === 0 ? 0 : best.count / lines.length,
    separator: best.separator,
  };
}

function parseRows(text: string, fieldDelimiter: string, cardDelimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const pushField = () => {
    row.push(field.normalize("NFKC").trim());
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some(Boolean)) rows.push(row);
    row = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (text.startsWith(fieldDelimiter, index)) {
      pushField();
      index += fieldDelimiter.length - 1;
    } else if (text.startsWith(cardDelimiter, index)) {
      pushRow();
      index += cardDelimiter.length - 1;
    } else if (cardDelimiter === "\n" && character === "\r" && text[index + 1] === "\n") {
      pushRow();
      index += 1;
    } else {
      field += character;
    }
  }
  if (quoted) {
    throw new PortabilityError("invalid_format", "A quoted text field is not closed.");
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

export function parseTermDefinitionText(text: string, mappingInput?: Partial<TextMapping>) {
  if (text.length > 20_000_000) {
    throw new PortabilityError("archive_limit", "The pasted text exceeds the allowed size.");
  }
  const detected = bestSeparator(text);
  const mapping = textMappingSchema.parse({
    cardDelimiter: mappingInput?.cardDelimiter ?? "\n",
    fieldDelimiter: mappingInput?.fieldDelimiter ?? detected.separator,
    frontBackSwapped: mappingInput?.frontBackSwapped ?? false,
    hasHeader: mappingInput?.hasHeader ?? false,
    ...(mappingInput?.backLanguage ? { backLanguage: mappingInput.backLanguage } : {}),
    ...(mappingInput?.frontLanguage ? { frontLanguage: mappingInput.frontLanguage } : {}),
    tags: mappingInput?.tags ?? [],
  });
  const diagnostics: PortabilityDiagnostic[] = [];
  const notes = [];
  const rows = parseRows(text, mapping.fieldDelimiter, mapping.cardDelimiter);
  const dataRows = mapping.hasHeader ? rows.slice(1) : rows;
  const expectedWidth = dataRows.find((row) => row.length >= 2)?.length ?? 2;
  for (const [index, row] of dataRows.entries()) {
    if (row.length < 2) {
      diagnostics.push({
        code: "line_skipped",
        item: `Card ${String(index + 1)}`,
        message: "Use one term and definition per line with a consistent separator.",
        severity: "warning" as const,
      });
      continue;
    }
    if (row.length !== expectedWidth) {
      diagnostics.push({
        code: "inconsistent_field_count",
        item: `Card ${String(index + 1)}`,
        message: `This card has ${String(row.length)} fields; most cards have ${String(expectedWidth)}.`,
        severity: "warning",
      });
    }
    const front = row[mapping.frontBackSwapped ? 1 : 0] ?? "";
    const back = row[mapping.frontBackSwapped ? 0 : 1] ?? "";
    if (!front || !back) continue;
    const note = basicNote({
      back,
      externalId: stableExternalId("text", front, back),
      front,
      tags: mapping.tags,
    });
    notes.push({
      ...note,
      fields: note.fields.map((field, fieldIndex) => ({
        ...field,
        ...(fieldIndex === 0 && mapping.frontLanguage
          ? { language: mapping.frontLanguage }
          : fieldIndex === 1 && mapping.backLanguage
            ? { language: mapping.backLanguage }
            : {}),
      })),
    });
    if (notes.length > 100_000) {
      throw new PortabilityError("archive_limit", "The pasted text has too many cards.");
    }
  }
  return {
    confidence: detected.confidence,
    diagnostics,
    mapping,
    notes,
    separator: mapping.fieldDelimiter,
  };
}

const textAdapterDefinition: ImportAdapter & ExportAdapter = {
  capabilities: SIMPLE_CAPABILITIES,
  code: "quizlet_text",
  formats: Object.freeze(["plain_text", "quizlet_text"] as const),
  async detect(source) {
    const parsed = portabilitySourceSchema.parse(source);
    const result = parseTermDefinitionText(sourceText(parsed).slice(0, 100_000));
    return result.notes.length > 0 ? 0.65 : 0.05;
  },
  async *execute(plan, sink): AsyncIterable<ImportProgress> {
    const graph = await textAdapterDefinition.map(plan.source, plan);
    yield {
      completedItems: 0,
      diagnostics: graph.warnings,
      phase: "validate",
      totalItems: countGraphItems(graph),
    };
    if (await sink.isCancelled()) {
      throw new PortabilityError("cancelled", "The import was cancelled.");
    }
    await sink.writeGraph(graph);
    yield {
      completedItems: countGraphItems(graph),
      diagnostics: graph.warnings,
      phase: "finalize",
      totalItems: countGraphItems(graph),
    };
  },
  async export(plan) {
    const lines: string[] = [];
    for (const deck of plan.graph.decks) {
      for (const note of deck.notes) {
        const front = note.fields.find((field) =>
          /^(front|term|question|prompt)$/iu.test(field.key),
        );
        const back = note.fields.find((field) =>
          /^(back|definition|answer|meaning)$/iu.test(field.key),
        );
        lines.push(
          `${(front?.value ?? note.fields[0]?.value ?? "").replaceAll(/\r?\n/gu, " ")}\t${(
            back?.value ??
            note.fields[1]?.value ??
            ""
          ).replaceAll(/\r?\n/gu, " ")}`,
        );
      }
    }
    const bytes = new TextEncoder().encode(`${lines.join("\n")}\n`);
    return {
      bytes,
      diagnostics: [],
      fileName: `${safeFileName(plan.fileName.replace(/\.[^.]+$/u, ""))}.txt`,
      format: "plain_text",
      loss: [
        {
          count: countGraphItems(plan.graph),
          feature: "structured_features",
          message: "Plain text preserves only one front and one back value per note.",
          policy: "omitted",
        },
      ],
      mimeType: "text/plain; charset=utf-8",
      sha256: await sha256Hex(bytes),
    };
  },
  async inspect(source): Promise<PortabilityInspection> {
    const parsed = portabilitySourceSchema.parse(source);
    const result = parseTermDefinitionText(sourceText(parsed));
    return {
      adapterCode: "quizlet_text",
      capabilities: SIMPLE_CAPABILITIES,
      detectionConfidence: result.confidence,
      detectedFormat: "quizlet_text",
      diagnostics: result.diagnostics,
      estimatedItems: result.notes.length,
      loss: [],
      sample: result.notes.slice(0, 10).map((note, index) => ({
        back: note.fields[1]?.value ?? "",
        front: note.fields[0]?.value ?? "",
        row: index + 1,
      })),
      textMapping: result.mapping,
    };
  },
  async map(source, plan) {
    const parsed = portabilitySourceSchema.parse(source);
    const result = parseTermDefinitionText(sourceText(parsed), plan.textMapping);
    return simpleGraph({
      adapter: "quizlet_text",
      deckTitle: plan.destinationDeckTitle ?? deckTitleFromFile(parsed.fileName),
      diagnostics: result.diagnostics,
      format: "quizlet_text",
      notes: result.notes,
      ...(parsed.fileName ? { sourceName: parsed.fileName } : {}),
    });
  },
};

export const textAdapter: ImportAdapter & ExportAdapter = Object.freeze(textAdapterDefinition);

import readExcelFile from "read-excel-file/universal";

import { graphFromDelimitedRows, inferDelimitedMapping } from "./delimited";
import { PortabilityError } from "./errors";
import type {
  DelimiterMapping,
  ImportAdapter,
  ImportPlan,
  ImportProgress,
  PortabilityDiagnostic,
  PortabilityLoss,
  PortabilitySource,
  SpreadsheetMapping,
} from "./schemas";
import { portabilitySourceSchema, spreadsheetMappingSchema } from "./schemas";
import { countGraphItems } from "./shared";
import { safeUnzip } from "./zip";

const XLSX_MAX_SHEETS = 32;
const XLSX_MAX_ROWS_PER_SHEET = 100_001;
const XLSX_MAX_TOTAL_ROWS = 250_000;
const XLSX_MAX_COLUMNS = 501;
const XLSX_MAX_CELLS = 1_000_000;
const XLSX_MAX_FIELD_CHARACTERS = 1_000_000;
const XLSX_MAX_PREVIEW_CHARACTERS = 500;

const XLSX_CAPABILITIES = Object.freeze({
  customFields: true,
  folders: false,
  media: false,
  noteTypes: true,
  practice: false,
  publications: false,
  reviewHistory: false,
  schedules: false,
  settings: false,
  tags: true,
  templates: false,
});

interface ParsedSheet {
  readonly columnCount: number;
  readonly mapping: SpreadsheetMapping;
  readonly name: string;
  readonly rows: readonly (readonly string[])[];
}

interface WorkbookPreflight {
  readonly diagnostics: readonly PortabilityDiagnostic[];
  readonly loss: readonly PortabilityLoss[];
}

function extension(fileName: string | undefined) {
  return fileName?.split(".").at(-1)?.toLowerCase() ?? "";
}

function countXmlTag(xml: string, tag: string) {
  let count = 0;
  let cursor = 0;
  const prefix = `<${tag}`;
  while ((cursor = xml.indexOf(prefix, cursor)) >= 0) {
    const next = xml.charAt(cursor + prefix.length);
    if (next === ">" || next === "/" || /\s/u.test(next)) count += 1;
    cursor += prefix.length;
  }
  return count;
}

function columnNumber(label: string) {
  let value = 0;
  for (const character of label.toUpperCase()) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value;
}

function validateCellReference(reference: string, label: string) {
  const match = /^([A-Z]+)([1-9]\d*)$/iu.exec(reference);
  if (!match) {
    throw new PortabilityError("invalid_format", `A worksheet contains an invalid ${label}.`);
  }
  const columnLabel = match[1] ?? "";
  const row = Number(match[2]);
  if (
    columnLabel.length > 3 ||
    columnNumber(columnLabel) > XLSX_MAX_COLUMNS ||
    !Number.isSafeInteger(row) ||
    row > XLSX_MAX_ROWS_PER_SHEET
  ) {
    throw new PortabilityError(
      "archive_limit",
      "A worksheet exceeds the supported row or column limit.",
    );
  }
}

function inspectWorksheetXml(bytes: Uint8Array) {
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PortabilityError("invalid_encoding", "A worksheet contains invalid XML text.");
  }
  const cellCount = countXmlTag(xml, "c");
  const rowCount = countXmlTag(xml, "row");
  if (cellCount > XLSX_MAX_CELLS) {
    throw new PortabilityError("archive_limit", "The workbook contains too many populated cells.");
  }
  if (rowCount > XLSX_MAX_ROWS_PER_SHEET) {
    throw new PortabilityError("archive_limit", "A worksheet contains too many rows.");
  }
  const referencePattern = /<c\b[^>]*\br="([^"]+)"/giu;
  for (const match of xml.matchAll(referencePattern)) {
    validateCellReference(match[1] ?? "", "cell reference");
  }
  const rowReferencePattern = /<row\b[^>]*\br="([^"]+)"/giu;
  for (const match of xml.matchAll(rowReferencePattern)) {
    const row = Number(match[1]);
    if (!/^[1-9]\d*$/u.test(match[1] ?? "")) {
      throw new PortabilityError(
        "invalid_format",
        "A worksheet contains an invalid row reference.",
      );
    }
    if (!Number.isSafeInteger(row) || row > XLSX_MAX_ROWS_PER_SHEET) {
      throw new PortabilityError("archive_limit", "A worksheet exceeds the supported row limit.");
    }
  }
  const dimensionPattern = /<dimension\b[^>]*\bref="([^"]+)"/giu;
  for (const match of xml.matchAll(dimensionPattern)) {
    const references = (match[1] ?? "").split(":");
    if (references.length > 2) {
      throw new PortabilityError(
        "invalid_format",
        "A worksheet contains an invalid dimension reference.",
      );
    }
    for (const reference of references) {
      validateCellReference(reference, "dimension reference");
    }
  }
  const formulaCount = countXmlTag(xml, "f");
  return { cellCount, formulaCount };
}

function preflightWorkbook(bytes: Uint8Array): WorkbookPreflight {
  const files = safeUnzip(bytes, {
    maxEntries: 1024,
    maxExpandedBytes: 128 * 1024 * 1024,
  });
  const contentTypesBytes = files.get("[Content_Types].xml");
  if (!contentTypesBytes || !files.has("xl/workbook.xml")) {
    throw new PortabilityError(
      "invalid_format",
      "The file is not a supported Excel .xlsx workbook.",
    );
  }
  const contentTypes = new TextDecoder().decode(contentTypesBytes);
  if (
    /macroEnabled|vbaProject/iu.test(contentTypes) ||
    [...files.keys()].some((path) => /(?:^|\/)vbaProject\.bin$/iu.test(path))
  ) {
    throw new PortabilityError(
      "invalid_format",
      "Macro-enabled workbooks are not supported. Save a copy as .xlsx and try again.",
    );
  }
  const worksheets = [...files.entries()].filter(([path]) =>
    /^xl\/worksheets\/[^/]+\.xml$/u.test(path),
  );
  if (worksheets.length === 0 || worksheets.length > XLSX_MAX_SHEETS) {
    throw new PortabilityError(
      "archive_limit",
      worksheets.length === 0
        ? "The workbook does not contain a readable worksheet."
        : "The workbook contains too many worksheets.",
    );
  }
  let cells = 0;
  let formulas = 0;
  for (const [, worksheet] of worksheets) {
    const inspected = inspectWorksheetXml(worksheet);
    cells += inspected.cellCount;
    formulas += inspected.formulaCount;
    if (cells > XLSX_MAX_CELLS) {
      throw new PortabilityError(
        "archive_limit",
        "The workbook contains too many populated cells.",
      );
    }
  }
  const embeddedMedia = [...files.keys()].filter((path) => /^xl\/media\/[^/]+$/u.test(path)).length;
  const charts = [...files.keys()].filter((path) => /^xl\/charts\/[^/]+\.xml$/u.test(path)).length;
  const comments = [...files.keys()].filter((path) =>
    /^xl\/comments[^/]*\.xml$/u.test(path),
  ).length;
  const externalLinks = [...files.keys()].filter((path) =>
    /^xl\/externalLinks\/[^/]+\.xml$/u.test(path),
  ).length;
  const diagnostics: PortabilityDiagnostic[] = [];
  const loss: PortabilityLoss[] = [];
  if (formulas > 0) {
    diagnostics.push({
      code: "spreadsheet_formula_cached_value",
      item: `${String(formulas)} formula cell${formulas === 1 ? "" : "s"}`,
      message:
        "Formulas are never executed. Only cached values saved in the workbook can be imported.",
      severity: "warning",
    });
    loss.push({
      count: formulas,
      feature: "spreadsheet_formulas",
      message: "Formula expressions are not preserved; cached values are imported when available.",
      policy: "approximated",
    });
  }
  if (externalLinks > 0) {
    diagnostics.push({
      code: "spreadsheet_external_links_ignored",
      item: `${String(externalLinks)} external link${externalLinks === 1 ? "" : "s"}`,
      message: "External workbook links are not opened or followed.",
      severity: "warning",
    });
  }
  if (embeddedMedia + charts + comments > 0) {
    loss.push({
      count: embeddedMedia + charts + comments,
      feature: "spreadsheet_embedded_objects",
      message: "Embedded images, charts, and comments are not included in card content.",
      policy: "omitted",
    });
  }
  return { diagnostics, loss };
}

function exactArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    if (value.length > XLSX_MAX_FIELD_CHARACTERS) {
      throw new PortabilityError("archive_limit", "A spreadsheet cell exceeds the allowed size.");
    }
    return value.normalize("NFKC").trim();
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new PortabilityError(
        "invalid_format",
        "A spreadsheet cell contains an invalid number.",
      );
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) {
    if (!Number.isFinite(value.valueOf())) {
      throw new PortabilityError("invalid_format", "A spreadsheet cell contains an invalid date.");
    }
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  throw new PortabilityError("invalid_format", "A spreadsheet cell type is not supported.");
}

function spreadsheetMapping(
  name: string,
  rows: readonly (readonly string[])[],
): SpreadsheetMapping {
  const mapping = inferDelimitedMapping(rows, ",");
  const { delimiter: _delimiter, ...columns } = mapping;
  return spreadsheetMappingSchema.parse({ ...columns, sheetName: name });
}

function delimitedMapping(mapping: SpreadsheetMapping): DelimiterMapping {
  const { sheetName: _sheetName, ...columns } = mapping;
  return { ...columns, delimiter: "," };
}

function sampleRows(sheet: ParsedSheet) {
  const mapping = sheet.mapping;
  const start = mapping.hasHeader ? 1 : 0;
  const preview = (value: string) =>
    value.length > XLSX_MAX_PREVIEW_CHARACTERS
      ? `${value.slice(0, XLSX_MAX_PREVIEW_CHARACTERS - 1)}…`
      : value;
  return sheet.rows.slice(start, start + 10).map((row, index) => ({
    back: preview(row[mapping.backColumn] ?? ""),
    front: preview(row[mapping.frontColumn] ?? ""),
    row: index + start + 1,
  }));
}

function estimatedItems(sheet: ParsedSheet) {
  return Math.max(0, sheet.rows.length - (sheet.mapping.hasHeader ? 1 : 0));
}

async function parseWorkbook(source: PortabilitySource) {
  const parsed = portabilitySourceSchema.parse(source);
  if (!parsed.bytes) {
    throw new PortabilityError("invalid_format", "Choose an Excel .xlsx workbook.");
  }
  const suffix = extension(parsed.fileName);
  if (suffix && suffix !== "xlsx") {
    throw new PortabilityError(
      "invalid_format",
      "Only .xlsx workbooks are supported. Export the spreadsheet as .xlsx first.",
    );
  }
  const preflight = preflightWorkbook(parsed.bytes);
  let workbook: readonly {
    readonly data: readonly (readonly unknown[])[];
    readonly sheet: string;
  }[];
  try {
    workbook = await readExcelFile(exactArrayBuffer(parsed.bytes), { trim: true });
  } catch {
    throw new PortabilityError(
      "invalid_format",
      "The Excel workbook is malformed or uses an unsupported feature.",
    );
  }
  if (workbook.length === 0 || workbook.length > XLSX_MAX_SHEETS) {
    throw new PortabilityError("archive_limit", "The workbook has an invalid worksheet count.");
  }
  let totalRows = 0;
  const names = new Set<string>();
  const sheets: ParsedSheet[] = workbook.map((sheet) => {
    const name = sheet.sheet.normalize("NFKC").trim();
    if (!name || name.length > 120 || names.has(name)) {
      throw new PortabilityError("invalid_format", "Worksheet names must be unique and readable.");
    }
    names.add(name);
    totalRows += sheet.data.length;
    if (sheet.data.length > XLSX_MAX_ROWS_PER_SHEET || totalRows > XLSX_MAX_TOTAL_ROWS) {
      throw new PortabilityError("archive_limit", "The workbook contains too many rows.");
    }
    const rows = sheet.data.map((row) => {
      if (row.length > XLSX_MAX_COLUMNS) {
        throw new PortabilityError("archive_limit", "A worksheet has too many columns.");
      }
      return Object.freeze(row.map(cellText));
    });
    const columnCount = Math.max(0, ...rows.map((row) => row.length));
    return Object.freeze({
      columnCount,
      mapping: spreadsheetMapping(name, rows),
      name,
      rows: Object.freeze(rows),
    });
  });
  return { ...preflight, sheets: Object.freeze(sheets) };
}

const spreadsheetAdapterDefinition: ImportAdapter = {
  capabilities: XLSX_CAPABILITIES,
  code: "xlsx",
  formats: Object.freeze(["xlsx"] as const),
  async detect(source) {
    if (extension(source.fileName) === "xlsx") return 0.99;
    if (!source.bytes) return 0;
    try {
      const files = safeUnzip(source.bytes, {
        maxEntries: 1024,
        maxExpandedBytes: 128 * 1024 * 1024,
      });
      return files.has("[Content_Types].xml") && files.has("xl/workbook.xml") ? 0.9 : 0;
    } catch {
      return 0;
    }
  },
  async *execute(plan: ImportPlan, sink): AsyncIterable<ImportProgress> {
    yield { completedItems: 0, diagnostics: [], phase: "validate", totalItems: null };
    if (await sink.isCancelled()) {
      throw new PortabilityError("cancelled", "The import was cancelled.");
    }
    const graph = await spreadsheetAdapterDefinition.map(plan.source, plan);
    const totalItems = countGraphItems(graph);
    yield {
      completedItems: 0,
      diagnostics: graph.warnings,
      phase: "write",
      totalItems,
    };
    await sink.writeGraph(graph);
    yield {
      completedItems: totalItems,
      diagnostics: graph.warnings,
      phase: "finalize",
      totalItems,
    };
  },
  async inspect(source) {
    const parsed = await parseWorkbook(source);
    const selected = parsed.sheets.find((sheet) => estimatedItems(sheet) > 0) ?? parsed.sheets[0];
    if (!selected) {
      throw new PortabilityError("invalid_format", "The workbook has no readable worksheet.");
    }
    const diagnostics = [...parsed.diagnostics];
    if (parsed.sheets.length > 1) {
      diagnostics.push({
        code: "spreadsheet_sheet_selection",
        item: `${String(parsed.sheets.length)} worksheets`,
        message: "Choose one worksheet to import. Other worksheets remain unchanged.",
        severity: "info",
      });
    }
    if (estimatedItems(selected) === 0) {
      diagnostics.push({
        code: "empty_source",
        item: selected.name,
        message: "The selected worksheet has no importable rows.",
        severity: "warning",
      });
    }
    return {
      adapterCode: "xlsx",
      capabilities: XLSX_CAPABILITIES,
      detectedFormat: "xlsx",
      diagnostics,
      estimatedItems: estimatedItems(selected),
      loss: [...parsed.loss],
      sample: sampleRows(selected),
      spreadsheet: {
        selectedSheet: selected.name,
        sheets: parsed.sheets.map((sheet) => ({
          columnCount: sheet.columnCount,
          estimatedItems: estimatedItems(sheet),
          mapping: sheet.mapping,
          name: sheet.name,
          rowCount: sheet.rows.length,
          sample: sampleRows(sheet),
        })),
      },
    };
  },
  async map(source, plan) {
    const parsed = await parseWorkbook(source);
    const mapping =
      plan.spreadsheetMapping ??
      parsed.sheets.find((sheet) => estimatedItems(sheet) > 0)?.mapping ??
      parsed.sheets[0]?.mapping;
    if (!mapping) {
      throw new PortabilityError("invalid_format", "The workbook has no readable worksheet.");
    }
    const sheet = parsed.sheets.find((candidate) => candidate.name === mapping.sheetName);
    if (!sheet) {
      throw new PortabilityError("invalid_format", "The selected worksheet is unavailable.");
    }
    const graph = graphFromDelimitedRows(source, sheet.rows, delimitedMapping(mapping), "xlsx", {
      deckTitle: plan.destinationDeckTitle ?? sheet.name,
      format: "xlsx",
    });
    return {
      ...graph,
      loss: [...parsed.loss, ...graph.loss],
      warnings: [...parsed.diagnostics, ...graph.warnings],
    };
  },
};

export const spreadsheetAdapter: ImportAdapter = Object.freeze(spreadsheetAdapterDefinition);

export const XLSX_IMPORT_LIMITS = Object.freeze({
  maxCells: XLSX_MAX_CELLS,
  maxColumns: XLSX_MAX_COLUMNS,
  maxFieldCharacters: XLSX_MAX_FIELD_CHARACTERS,
  maxRowsPerSheet: XLSX_MAX_ROWS_PER_SHEET,
  maxSheets: XLSX_MAX_SHEETS,
  maxTotalRows: XLSX_MAX_TOTAL_ROWS,
});

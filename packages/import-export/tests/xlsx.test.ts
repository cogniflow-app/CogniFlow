import { describe, expect, it } from "vitest";

import {
  detectImportAdapter,
  exportablePortabilityFormatSchema,
  spreadsheetAdapter,
  type SpreadsheetMapping,
} from "../src";
import { createSyntheticXlsxFixture } from "./xlsx-fixture";

function workbook() {
  return createSyntheticXlsxFixture([
    {
      name: "Biology",
      rows: [
        ["Term", "Definition", "Tags"],
        ["ATP", "Cellular energy carrier", "biology;energy"],
        ["DNA", "Genetic material", "biology"],
      ],
    },
    {
      name: "Chemistry",
      rows: [
        ["Question", "Answer", "Hint"],
        ["Atomic number of oxygen?", { cached: 8, formula: "4+4" }, "Periodic table"],
        ["Water formula?", "H₂O", "Common compound"],
      ],
    },
  ]);
}

describe("XLSX workbook import", () => {
  it("keeps XLSX import-only", () => {
    expect(exportablePortabilityFormatSchema.safeParse("xlsx").success).toBe(false);
  });

  it("detects Excel files, inspects every bounded worksheet, and reports cached formulas", async () => {
    const source = {
      bytes: workbook(),
      fileName: "google-sheets-export.xlsx",
    };
    expect((await detectImportAdapter(source))?.adapter.code).toBe("xlsx");
    const inspection = await spreadsheetAdapter.inspect(source);
    expect(inspection).toMatchObject({
      adapterCode: "xlsx",
      detectedFormat: "xlsx",
      estimatedItems: 2,
      spreadsheet: {
        selectedSheet: "Biology",
        sheets: [
          {
            columnCount: 3,
            estimatedItems: 2,
            mapping: {
              backColumn: 1,
              frontColumn: 0,
              hasHeader: true,
              sheetName: "Biology",
              tagsColumn: 2,
            },
            name: "Biology",
            rowCount: 3,
          },
          {
            columnCount: 3,
            estimatedItems: 2,
            name: "Chemistry",
            rowCount: 3,
          },
        ],
      },
    });
    expect(inspection.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "spreadsheet_formula_cached_value" }),
        expect.objectContaining({ code: "spreadsheet_sheet_selection" }),
      ]),
    );
    expect(inspection.loss).toEqual(
      expect.arrayContaining([expect.objectContaining({ feature: "spreadsheet_formulas" })]),
    );
  });

  it("imports the explicitly selected worksheet with inferred custom fields and stable values", async () => {
    const source = { bytes: workbook(), fileName: "cards.xlsx" };
    const inspection = await spreadsheetAdapter.inspect(source);
    const chemistry = inspection.spreadsheet?.sheets.find(
      (sheet) => sheet.name === "Chemistry",
    )?.mapping;
    if (!chemistry) throw new Error("Synthetic worksheet mapping is missing.");
    const graph = await spreadsheetAdapter.map(source, {
      adapterCode: "xlsx",
      destinationDeckTitle: "Imported chemistry",
      duplicatePolicy: "skip",
      progressPolicy: "omit",
      source,
      spreadsheetMapping: chemistry,
    });
    expect(graph.decks[0]).toMatchObject({
      sourceFormat: "xlsx",
      title: "Imported chemistry",
    });
    expect(graph.decks[0]?.notes).toHaveLength(2);
    expect(graph.decks[0]?.notes[0]).toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({ key: "Front", value: "Atomic number of oxygen?" }),
        expect.objectContaining({ key: "Back", value: "8" }),
        expect.objectContaining({ key: "Hint", value: "Periodic table" }),
      ]),
      noteTypeCode: "custom-import",
    });
  });

  it("bounds inspection previews without truncating imported card content", async () => {
    const longTerm = "Pneumonoultramicroscopicsilicovolcanoconiosis".repeat(16);
    const bytes = createSyntheticXlsxFixture([
      {
        name: "Long content",
        rows: [
          ["Term", "Definition"],
          [longTerm, "A deliberately long synthetic workbook value"],
        ],
      },
    ]);
    const source = { bytes, fileName: "long-content.xlsx" };
    const inspection = await spreadsheetAdapter.inspect(source);
    expect(String(inspection.sample[0]?.front)).toHaveLength(500);
    expect(String(inspection.sample[0]?.front)).toMatch(/…$/u);

    const graph = await spreadsheetAdapter.map(source, {
      adapterCode: "xlsx",
      duplicatePolicy: "skip",
      progressPolicy: "omit",
      source,
    });
    expect(graph.decks[0]?.notes[0]?.fields[0]?.value).toBe(longTerm);
  });

  it("fails closed for macro content, unsafe dimensions, and an unknown worksheet", async () => {
    const macro = createSyntheticXlsxFixture(
      [
        {
          name: "Cards",
          rows: [
            ["Front", "Back"],
            ["A", "B"],
          ],
        },
      ],
      { "xl/vbaProject.bin": new Uint8Array([1, 2, 3]) },
    );
    await expect(
      spreadsheetAdapter.inspect({ bytes: macro, fileName: "macro.xlsx" }),
    ).rejects.toThrow("Macro-enabled");

    const oversized = createSyntheticXlsxFixture(
      [
        {
          name: "Cards",
          rows: [
            ["Front", "Back"],
            ["A", "B"],
          ],
        },
      ],
      {
        "xl/worksheets/sheet1.xml": new TextEncoder().encode(
          '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="XFD1048576" t="inlineStr"><is><t>unsafe</t></is></c></row></sheetData></worksheet>',
        ),
      },
    );
    await expect(
      spreadsheetAdapter.inspect({ bytes: oversized, fileName: "oversized.xlsx" }),
    ).rejects.toThrow("row or column limit");

    const sparseDimension = createSyntheticXlsxFixture(
      [{ name: "Cards", rows: [["Front", "Back"]] }],
      {
        "xl/worksheets/sheet1.xml": new TextEncoder().encode(
          '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:XFD1048576"/><sheetData/></worksheet>',
        ),
      },
    );
    await expect(
      spreadsheetAdapter.inspect({
        bytes: sparseDimension,
        fileName: "sparse-dimension.xlsx",
      }),
    ).rejects.toThrow("row or column limit");

    const overwideReference = createSyntheticXlsxFixture(
      [{ name: "Cards", rows: [["Front", "Back"]] }],
      {
        "xl/worksheets/sheet1.xml": new TextEncoder().encode(
          '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="AAAA1" t="inlineStr"><is><t>unsafe</t></is></c></row></sheetData></worksheet>',
        ),
      },
    );
    await expect(
      spreadsheetAdapter.inspect({
        bytes: overwideReference,
        fileName: "overwide-reference.xlsx",
      }),
    ).rejects.toThrow("row or column limit");

    const source = { bytes: workbook(), fileName: "cards.xlsx" };
    const missing: SpreadsheetMapping = {
      backColumn: 1,
      frontColumn: 0,
      hasHeader: true,
      sheetName: "Missing",
    };
    await expect(
      spreadsheetAdapter.map(source, {
        adapterCode: "xlsx",
        duplicatePolicy: "skip",
        progressPolicy: "omit",
        source,
        spreadsheetMapping: missing,
      }),
    ).rejects.toThrow("selected worksheet is unavailable");
  });
});

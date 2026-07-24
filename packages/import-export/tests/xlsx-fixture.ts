import { createZip } from "../src/zip";

export type SyntheticXlsxCell =
  | boolean
  | number
  | string
  | null
  | {
      readonly cached: boolean | number | string;
      readonly formula: string;
    };

export interface SyntheticXlsxSheet {
  readonly name: string;
  readonly rows: readonly (readonly SyntheticXlsxCell[])[];
}

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnLabel(index: number) {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    value -= 1;
    output = String.fromCharCode(65 + (value % 26)) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

function cellXml(cell: SyntheticXlsxCell, rowIndex: number, columnIndex: number) {
  if (cell === null) return "";
  const reference = `${columnLabel(columnIndex)}${String(rowIndex + 1)}`;
  if (typeof cell === "object") {
    const cached = cell.cached;
    const type =
      typeof cached === "string" ? ' t="str"' : typeof cached === "boolean" ? ' t="b"' : "";
    const value = typeof cached === "boolean" ? (cached ? "1" : "0") : xml(String(cached));
    return `<c r="${reference}"${type}><f>${xml(cell.formula)}</f><v>${value}</v></c>`;
  }
  if (typeof cell === "string") {
    return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`;
  }
  if (typeof cell === "boolean") {
    return `<c r="${reference}" t="b"><v>${cell ? "1" : "0"}</v></c>`;
  }
  return `<c r="${reference}"><v>${String(cell)}</v></c>`;
}

function worksheetXml(sheet: SyntheticXlsxSheet) {
  const columnCount = Math.max(1, ...sheet.rows.map((row) => row.length));
  const end = `${columnLabel(columnCount - 1)}${String(Math.max(1, sheet.rows.length))}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${end}"/>
  <sheetData>
    ${sheet.rows
      .map(
        (row, rowIndex) =>
          `<row r="${String(rowIndex + 1)}">${row
            .map((cell, columnIndex) => cellXml(cell, rowIndex, columnIndex))
            .join("")}</row>`,
      )
      .join("")}
  </sheetData>
</worksheet>`;
}

export function createSyntheticXlsxFixture(
  sheets: readonly SyntheticXlsxSheet[],
  extraFiles: Readonly<Record<string, Uint8Array>> = {},
) {
  const encoder = new TextEncoder();
  const worksheetOverrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${String(index + 1)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  const workbookSheets = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${xml(sheet.name)}" sheetId="${String(index + 1)}" r:id="rId${String(index + 1)}"/>`,
    )
    .join("");
  const worksheetRelationships = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${String(index + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${String(index + 1)}.xml"/>`,
    )
    .join("");
  const files = new Map<string, Uint8Array>([
    [
      "[Content_Types].xml",
      encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${worksheetOverrides}
</Types>`),
    ],
    [
      "_rels/.rels",
      encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    ],
    [
      "xl/workbook.xml",
      encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets}</sheets>
</workbook>`),
    ],
    [
      "xl/_rels/workbook.xml.rels",
      encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${worksheetRelationships}
  <Relationship Id="rId${String(sheets.length + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    ],
    [
      "xl/styles.xml",
      encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="0"/>
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`),
    ],
    ...sheets.map(
      (sheet, index) =>
        [
          `xl/worksheets/sheet${String(index + 1)}.xml`,
          encoder.encode(worksheetXml(sheet)),
        ] as const,
    ),
    ...Object.entries(extraFiles),
  ]);
  return createZip(files);
}

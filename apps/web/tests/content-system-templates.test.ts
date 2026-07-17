// @vitest-environment node

import { compileTemplate } from "@lumen/domain";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface SeededTemplate {
  readonly back: string;
  readonly front: string;
  readonly typeCode: string;
}

function seededTemplates(): readonly SeededTemplate[] {
  const migration = readFileSync(
    new URL("../../../supabase/migrations/20260716000000_content_schema.sql", import.meta.url),
    "utf8",
  );
  const insert = migration.indexOf("insert into public.card_templates (");
  const values = migration.indexOf("from (values", insert);
  const end = migration.indexOf(") as template(", values);
  if (insert < 0 || values < 0 || end < 0)
    throw new Error("System template seed block is missing.");
  const source = migration.slice(values, end);
  const rows: SeededTemplate[] = [];
  const rowPattern =
    /\(\s*'([^']+)'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*\d+\s*,\s*(?:null|'(?:[^']|'')*')\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*(?:null|'(?:[^']|'')*')\s*,\s*'[^']+'\s*\)/gu;
  for (const match of source.matchAll(rowPattern)) {
    const typeCode = match[1];
    const front = match[2];
    const back = match[3];
    if (!typeCode || front === undefined || back === undefined) continue;
    rows.push({
      back: back.replaceAll("''", "'"),
      front: front.replaceAll("''", "'"),
      typeCode,
    });
  }
  return rows;
}

describe("database-seeded safe templates", () => {
  it("keeps every system front and back compatible with the audited domain compiler", () => {
    const templates = seededTemplates();

    expect(templates).toHaveLength(20);
    for (const template of templates) {
      expect(() => compileTemplate(template.front), `${template.typeCode} front`).not.toThrow();
      expect(() => compileTemplate(template.back), `${template.typeCode} back`).not.toThrow();
    }
    expect(templates.some((template) => template.back.includes("{{FrontSide}}"))).toBe(true);
    expect(templates.some((template) => template.back.includes("{{#if Extra}}"))).toBe(true);
    expect(JSON.stringify(templates)).not.toContain("{{front_side}}");
    expect(JSON.stringify(templates)).not.toContain("{{if:");
  });
});

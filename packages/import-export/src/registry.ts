import type { ExportAdapter, ImportAdapter, PortabilitySource } from "./schemas";
import { ankiAdapter } from "./anki";
import { archiveAdapter } from "./archive-adapter";
import { delimitedAdapter } from "./delimited";
import { jsonAdapter } from "./json";
import { markdownAdapter } from "./markdown";
import { textAdapter } from "./text";
import { spreadsheetAdapter } from "./xlsx";

export const importAdapters: readonly ImportAdapter[] = Object.freeze([
  archiveAdapter,
  ankiAdapter,
  jsonAdapter,
  markdownAdapter,
  spreadsheetAdapter,
  delimitedAdapter,
  textAdapter,
]);

export const exportAdapters: readonly ExportAdapter[] = Object.freeze([
  archiveAdapter,
  {
    capabilities: ankiAdapter.capabilities,
    code: ankiAdapter.code,
    formats: ankiAdapter.formats,
    async export(plan) {
      return ankiAdapter.export(plan);
    },
  },
  jsonAdapter,
  markdownAdapter,
  delimitedAdapter,
  textAdapter,
]);

export async function detectImportAdapter(source: PortabilitySource) {
  const scored = await Promise.all(
    importAdapters.map(async (adapter) => ({
      adapter,
      // Keep format sniffers isolated: a text parser rejecting binary input
      // must not prevent the XLSX sniffer from examining the same source.
      confidence: await adapter.detect(source).catch(() => 0),
    })),
  );
  return (
    scored.sort(
      (left, right) =>
        right.confidence - left.confidence || left.adapter.code.localeCompare(right.adapter.code),
    )[0] ?? null
  );
}

export function getImportAdapter(code: string) {
  return importAdapters.find((adapter) => adapter.code === code) ?? null;
}

export function getExportAdapter(code: string) {
  return exportAdapters.find((adapter) => adapter.code === code) ?? null;
}

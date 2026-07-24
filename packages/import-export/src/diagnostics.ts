import type { PortabilityDiagnostic } from "./schemas";

function spreadsheetSafe(value: string) {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

function csvCell(value: string) {
  const safe = spreadsheetSafe(value.replaceAll(/\u0000/gu, ""));
  return `"${safe.replaceAll('"', '""')}"`;
}

/**
 * Produces a minimized, content-free report suitable for downloading from an
 * import result. Diagnostic messages are already bounded by the runtime schema.
 */
export function diagnosticsToCsv(diagnostics: readonly PortabilityDiagnostic[]) {
  const rows = [
    ["severity", "code", "item", "path", "reason"],
    ...diagnostics.map((diagnostic) => [
      diagnostic.severity,
      diagnostic.code,
      diagnostic.item ?? "",
      diagnostic.path ?? "",
      diagnostic.message,
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

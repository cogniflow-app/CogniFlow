import type { ExportArtifact, NormalizedGraph } from "./schemas";
import { safeFileName, sha256Hex } from "./safety";

function html(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function createPrintableHtml(
  graph: NormalizedGraph,
  options: {
    readonly fileName?: string;
    readonly includeAnswers?: boolean;
    readonly layout?: "cards" | "list" | "test";
  } = {},
): Promise<ExportArtifact> {
  const layout = options.layout ?? "cards";
  const includeAnswers = options.includeAnswers ?? true;
  const sections = graph.decks
    .map((deck) => {
      const cards = deck.notes
        .map((note, index) => {
          const front = note.fields.find((field) =>
            /^(front|term|question|prompt)$/iu.test(field.key),
          );
          const back = note.fields.find((field) =>
            /^(back|definition|answer|meaning)$/iu.test(field.key),
          );
          return `<article class="card">
  <p class="number">Card ${String(index + 1)}</p>
  <h2>${html(front?.value ?? note.fields[0]?.value ?? "")}</h2>
  ${includeAnswers ? `<div class="answer">${html(back?.value ?? note.fields[1]?.value ?? "")}</div>` : '<div class="answer-space" aria-label="Answer space"></div>'}
  ${note.source ? `<p class="source">Source: ${html(note.source)}</p>` : ""}
</article>`;
        })
        .join("\n");
      return `<section class="deck"><header><h1>${html(deck.title)}</h1><p>${html(deck.description)}</p></header>${cards}</section>`;
    })
    .join("\n");
  const document = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Lumen printable study material</title>
<style>
@page { margin: 14mm; size: auto; }
* { box-sizing: border-box; }
body { color: #172033; font: 12pt/1.45 system-ui, sans-serif; margin: 0; }
.deck > header { break-after: avoid; border-bottom: 2px solid #172033; margin-bottom: 8mm; }
.deck > header h1 { font-size: 22pt; margin: 0 0 2mm; }
.card { border: 1px solid #9aa4b5; border-radius: 3mm; break-inside: avoid; margin: 0 0 5mm; padding: 5mm; }
.number,.source { color: #566176; font-size: 9pt; margin: 0 0 2mm; }
.card h2 { font-size: 14pt; margin: 0 0 4mm; white-space: pre-wrap; }
.answer { border-top: 1px solid #ccd2dc; padding-top: 4mm; white-space: pre-wrap; }
.answer-space { border-bottom: 1px solid #9aa4b5; height: 24mm; }
body[data-layout="list"] .card { border-width: 0 0 1px; border-radius: 0; padding-inline: 0; }
body[data-layout="test"] .answer { display: none; }
@media screen { body { margin: 24px auto; max-width: 900px; padding: 16px; } }
</style></head><body data-layout="${layout}">${sections}</body></html>`;
  const bytes = new TextEncoder().encode(document);
  return {
    bytes,
    diagnostics: [],
    fileName: `${safeFileName(options.fileName ?? "lumen-print")}.html`,
    format: "print_html",
    loss: [],
    mimeType: "text/html; charset=utf-8",
    sha256: await sha256Hex(bytes),
  };
}

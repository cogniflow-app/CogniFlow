import { PortabilityError } from "./errors";
import type {
  ExportAdapter,
  ImportAdapter,
  ImportProgress,
  NormalizedGraph,
  NormalizedNote,
  PortabilityInspection,
  PortabilitySource,
} from "./schemas";
import { normalizedGraphSchema, portabilitySourceSchema } from "./schemas";
import { canonicalJson, parseSafeJson, safeFileName, sha256Hex, sourceText } from "./safety";
import {
  SIMPLE_CAPABILITIES,
  basicNote,
  countGraphItems,
  deckTitleFromFile,
  simpleGraph,
  stableExternalId,
} from "./shared";
import { createZip, safeUnzip } from "./zip";

interface MarkdownDocument {
  readonly body: string;
  readonly frontMatter: Readonly<Record<string, unknown>>;
}

function parseFrontMatter(source: string): MarkdownDocument {
  const normalized = source.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return { body: normalized, frontMatter: {} };
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0 || end > 20_000) {
    throw new PortabilityError("invalid_format", "Markdown front matter is not closed.");
  }
  const header = normalized.slice(4, end);
  const frontMatter: Record<string, unknown> = {};
  for (const [index, line] of header.split("\n").entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator < 1) {
      throw new PortabilityError(
        "invalid_format",
        `Markdown front matter line ${String(index + 1)} is invalid.`,
      );
    }
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (
      !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/u.test(key) ||
      ["__proto__", "constructor", "prototype"].includes(key)
    ) {
      throw new PortabilityError("invalid_schema", "Markdown front matter contains an unsafe key.");
    }
    if (raw.startsWith("[") && raw.endsWith("]")) {
      const value = parseSafeJson(raw, 20_000);
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new PortabilityError(
          "invalid_schema",
          "Markdown front matter arrays may contain only strings.",
        );
      }
      frontMatter[key] = value;
    } else {
      frontMatter[key] = raw.replace(/^["']|["']$/gu, "").slice(0, 2000);
    }
  }
  return { body: normalized.slice(end + 5), frontMatter };
}

function section(source: string, heading: string, nextHeadings: readonly string[]) {
  const marker = `### ${heading}\n`;
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const contentStart = start + marker.length;
  const ends = nextHeadings
    .map((next) => source.indexOf(`### ${next}\n`, contentStart))
    .filter((value) => value >= 0);
  const end = ends.length > 0 ? Math.min(...ends) : source.length;
  return source.slice(contentStart, end).trim();
}

function parseDeckMarkdown(source: string, fileName?: string) {
  const parsed = parseFrontMatter(source);
  const title =
    typeof parsed.frontMatter.title === "string"
      ? parsed.frontMatter.title.slice(0, 180)
      : deckTitleFromFile(fileName);
  const notes: NormalizedNote[] = [];
  const chunks = parsed.body.split(/^## Card(?:\s+\d+)?\s*$/gmu).slice(1);
  for (const chunk of chunks) {
    const front = section(chunk, "Front", ["Back", "Tags", "Source"]);
    const back = section(chunk, "Back", ["Tags", "Source"]);
    if (!front || !back) continue;
    const tags = section(chunk, "Tags", ["Source"])
      .split(/[,\n]/u)
      .map((tag) => tag.replace(/^[-*]\s*/u, "").trim())
      .filter(Boolean);
    const sourceValue = section(chunk, "Source", []);
    const note = basicNote({
      back,
      externalId: stableExternalId("markdown", front, back),
      front,
      source: sourceValue,
      tags,
    });
    notes.push(
      /\{\{c\d+::[\s\S]+?\}\}/iu.test(`${front}\n${back}`)
        ? {
            ...note,
            generatedCards: note.generatedCards.map((card) => ({
              ...card,
              generationKey: "cloze-1",
              kind: "cloze",
              templateKey: "cloze",
            })),
            noteTypeCode: "cloze",
          }
        : note,
    );
  }
  const frontMatterTags = parsed.frontMatter.tags;
  const tags = (
    Array.isArray(frontMatterTags)
      ? frontMatterTags
      : typeof frontMatterTags === "string"
        ? frontMatterTags.split(/[;,]/u)
        : []
  )
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 100);
  return { notes, tags, title };
}

async function markdownForGraph(
  graph: NormalizedGraph,
  mediaFiles?: ReadonlyMap<string, Uint8Array>,
) {
  const files = new Map<string, Uint8Array>();
  const encoder = new TextEncoder();
  const verifiedMedia: NormalizedGraph["media"][number][] = [];
  for (const media of graph.media) {
    const bytes = mediaFiles?.get(media.sha256);
    if (bytes && bytes.byteLength === media.byteSize && (await sha256Hex(bytes)) === media.sha256) {
      verifiedMedia.push(media);
      files.set(`media/files/${media.sha256}`, new Uint8Array(bytes));
    }
  }
  const verifiedIds = new Set(verifiedMedia.map((media) => media.externalId));
  const bundledGraph = normalizedGraphSchema.parse({
    ...graph,
    decks: graph.decks.map((deck) => ({
      ...deck,
      notes: deck.notes.map((note) => ({
        ...note,
        mediaExternalIds: note.mediaExternalIds.filter((id) => verifiedIds.has(id)),
      })),
    })),
    media: verifiedMedia,
  });
  const index: string[] = ["# Lumen Markdown export", "", "Decks:"];
  for (const [deckIndex, deck] of bundledGraph.decks.entries()) {
    const file = `decks/${String(deckIndex + 1).padStart(4, "0")}-${safeFileName(deck.title)}.md`;
    index.push(`- [${deck.title}](${file})`);
    const lines = [
      "---",
      `title: ${JSON.stringify(deck.title)}`,
      `sourceFormat: ${JSON.stringify(deck.sourceFormat)}`,
      `tags: ${JSON.stringify(deck.tags)}`,
      "---",
      "",
      `# ${deck.title}`,
      "",
      deck.description,
      "",
    ];
    for (const [noteIndex, note] of deck.notes.entries()) {
      const front = note.fields.find((field) => /^(front|term|question|prompt)$/iu.test(field.key));
      const back = note.fields.find((field) =>
        /^(back|definition|answer|meaning)$/iu.test(field.key),
      );
      lines.push(
        `## Card ${String(noteIndex + 1)}`,
        "",
        "### Front",
        front?.value ?? note.fields[0]?.value ?? "",
        "",
        "### Back",
        back?.value ?? note.fields[1]?.value ?? "",
        "",
        "### Tags",
        note.tags.join(", "),
        "",
        "### Source",
        note.source,
        "",
      );
    }
    files.set(file, encoder.encode(`${lines.join("\n")}\n`));
  }
  files.set("README.md", encoder.encode(`${index.join("\n")}\n`));
  files.set("lumen.graph.json", encoder.encode(`${canonicalJson(bundledGraph)}\n`));
  return {
    files,
    omittedMedia: graph.media.length - verifiedMedia.length,
  };
}

const MARKDOWN_CAPABILITIES = Object.freeze({ ...SIMPLE_CAPABILITIES, folders: true });

const markdownAdapterDefinition: ImportAdapter & ExportAdapter = {
  capabilities: MARKDOWN_CAPABILITIES,
  code: "markdown_bundle",
  formats: Object.freeze(["markdown_bundle"] as const),
  async detect(source) {
    if (source.fileName?.toLowerCase().endsWith(".md")) return 0.9;
    if (source.fileName?.toLowerCase().endsWith(".zip")) {
      try {
        return [...safeUnzip(source.bytes ?? new Uint8Array()).keys()].some((name) =>
          name.endsWith(".md"),
        )
          ? 0.8
          : 0;
      } catch {
        return 0;
      }
    }
    return sourceText(portabilitySourceSchema.parse(source)).includes("### Front") ? 0.65 : 0.1;
  },
  async *execute(plan, sink): AsyncIterable<ImportProgress> {
    const graph = await markdownAdapterDefinition.map(plan.source, plan);
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
    const bundle = await markdownForGraph(plan.graph, plan.mediaFiles);
    const bytes = createZip(bundle.files);
    return {
      bytes,
      diagnostics: [],
      fileName: `${safeFileName(plan.fileName.replace(/\.(?:md|zip)$/u, ""))}.markdown.zip`,
      format: "markdown_bundle",
      loss:
        bundle.omittedMedia > 0
          ? [
              {
                count: bundle.omittedMedia,
                feature: "media",
                message:
                  "Media without supplied verified bytes was omitted from the Markdown bundle.",
                policy: "omitted" as const,
              },
            ]
          : [],
      mimeType: "application/zip",
      sha256: await sha256Hex(bytes),
    };
  },
  async inspect(source): Promise<PortabilityInspection> {
    const graph = await markdownAdapterDefinition.map(source, {
      adapterCode: "markdown_bundle",
      duplicatePolicy: "skip",
      progressPolicy: "omit",
      source,
    });
    return {
      adapterCode: "markdown_bundle",
      capabilities: MARKDOWN_CAPABILITIES,
      detectedFormat: "markdown_bundle",
      diagnostics: graph.warnings,
      estimatedItems: countGraphItems(graph),
      loss: graph.loss,
      sample: graph.decks.slice(0, 10).map((deck) => ({
        cards: deck.notes.length,
        title: deck.title,
      })),
    };
  },
  async map(source, plan) {
    const parsed = portabilitySourceSchema.parse(source);
    const zipFiles =
      parsed.bytes && /\.(?:zip|mdzip)$/iu.test(parsed.fileName ?? "")
        ? safeUnzip(parsed.bytes)
        : null;
    const exactGraph = zipFiles?.get("lumen.graph.json");
    if (exactGraph) {
      const parsedGraph = normalizedGraphSchema.safeParse(
        parseSafeJson(new TextDecoder("utf-8", { fatal: true }).decode(exactGraph)),
      );
      if (!parsedGraph.success) {
        throw new PortabilityError(
          "invalid_schema",
          "The machine-restorable Markdown graph is invalid.",
        );
      }
      const expectedMediaPaths = new Set(
        parsedGraph.data.media.map((media) => `media/files/${media.sha256}`),
      );
      const actualMediaPaths = [...(zipFiles?.keys() ?? [])].filter((path) =>
        path.startsWith("media/files/"),
      );
      if (
        actualMediaPaths.length !== expectedMediaPaths.size ||
        actualMediaPaths.some((path) => !expectedMediaPaths.has(path))
      ) {
        throw new PortabilityError(
          "checksum_mismatch",
          "The Markdown media inventory does not match its descriptors.",
        );
      }
      for (const media of parsedGraph.data.media) {
        const bytes = zipFiles?.get(`media/files/${media.sha256}`);
        if (
          !bytes ||
          bytes.byteLength !== media.byteSize ||
          (await sha256Hex(bytes)) !== media.sha256
        ) {
          throw new PortabilityError(
            "checksum_mismatch",
            "A Markdown media file does not match its descriptor.",
          );
        }
      }
      return parsedGraph.data;
    }
    const documents = zipFiles
      ? [...zipFiles.entries()]
          .filter(([name]) => name.toLowerCase().endsWith(".md") && name !== "README.md")
          .map(([name, bytes]) => ({
            fileName: name,
            text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          }))
      : [{ fileName: parsed.fileName, text: sourceText(parsed) }];
    const parsedDecks = documents.map((document) =>
      parseDeckMarkdown(document.text, document.fileName),
    );
    if (parsedDecks.length === 1) {
      const only = parsedDecks[0];
      if (!only) {
        throw new PortabilityError("invalid_format", "The Markdown document is empty.");
      }
      const graph = simpleGraph({
        adapter: "markdown_bundle",
        deckTitle: plan.destinationDeckTitle ?? only.title,
        format: "markdown_bundle",
        notes: only.notes,
        ...(parsed.fileName ? { sourceName: parsed.fileName } : {}),
      });
      return {
        ...graph,
        decks: graph.decks.map((deck) => ({ ...deck, tags: only.tags })),
      };
    }
    const seed = simpleGraph({
      adapter: "markdown_bundle",
      deckTitle: "Markdown import",
      format: "markdown_bundle",
      notes: [],
      ...(parsed.fileName ? { sourceName: parsed.fileName } : {}),
    });
    return {
      ...seed,
      decks: parsedDecks.map((deck) => ({
        description: "",
        folderPath: [],
        notes: deck.notes,
        sourceFormat: "markdown_bundle",
        tags: deck.tags,
        title: deck.title,
      })),
    };
  },
};

export const markdownAdapter: ImportAdapter & ExportAdapter =
  Object.freeze(markdownAdapterDefinition);

export async function readMarkdownMediaFiles(source: PortabilitySource) {
  if (!source.bytes) return new Map<string, Uint8Array>();
  const files = safeUnzip(source.bytes);
  const graphBytes = files.get("lumen.graph.json");
  if (!graphBytes) return new Map<string, Uint8Array>();
  const graph = normalizedGraphSchema.parse(
    parseSafeJson(new TextDecoder("utf-8", { fatal: true }).decode(graphBytes)),
  );
  const mediaFiles = new Map<string, Uint8Array>();
  for (const media of graph.media) {
    const bytes = files.get(`media/files/${media.sha256}`);
    if (
      !bytes ||
      bytes.byteLength !== media.byteSize ||
      (await sha256Hex(bytes)) !== media.sha256
    ) {
      throw new PortabilityError(
        "checksum_mismatch",
        "A Markdown media file does not match its descriptor.",
      );
    }
    mediaFiles.set(media.sha256, new Uint8Array(bytes));
  }
  return mediaFiles;
}

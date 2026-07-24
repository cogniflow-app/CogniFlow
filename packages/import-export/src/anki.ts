import { sanitizeTemplateMarkup } from "@lumen/domain";
import initSqlJs, { type Database, type QueryExecResult } from "sql.js";

import { PortabilityError } from "./errors";
import type {
  ExportArtifact,
  ExportAdapter,
  ImportAdapter,
  ImportProgress,
  NormalizedDeck,
  NormalizedGeneratedCard,
  NormalizedGraph,
  NormalizedMedia,
  NormalizedNote,
  NormalizedNoteType,
  PortabilityInspection,
  PortabilitySource,
  ProgressImportPolicy,
} from "./schemas";
import { portabilitySourceSchema } from "./schemas";
import { parseSafeJson, safeFileName, sha1Hex, sha256Hex } from "./safety";
import { STRUCTURED_CAPABILITIES, countGraphItems, graphNow } from "./shared";
import { createZip, safeUnzip } from "./zip";

const SQLITE_HEADER = new TextEncoder().encode("SQLite format 3\0");
const MAX_NOTES = 100_000;
const MAX_CARDS = 500_000;
const MAX_REVIEWS = 2_000_000;
let sqlitePromise: Promise<Awaited<ReturnType<typeof initSqlJs>>> | null = null;

async function sqlite() {
  sqlitePromise ??= initSqlJs();
  return sqlitePromise;
}

function sqliteBytes(files: ReadonlyMap<string, Uint8Array>) {
  for (const name of ["collection.anki21", "collection.anki2"]) {
    const bytes = files.get(name);
    if (bytes) return { bytes, name };
  }
  if (files.has("collection.anki21b")) {
    throw new PortabilityError(
      "unsupported_archive",
      "This package uses Anki's compressed collection format. Export again with “Support older Anki versions” enabled.",
    );
  }
  throw new PortabilityError(
    "invalid_format",
    "The package does not contain collection.anki2 or collection.anki21.",
  );
}

function assertSqliteHeader(bytes: Uint8Array) {
  if (
    bytes.byteLength < SQLITE_HEADER.byteLength ||
    !SQLITE_HEADER.every((value, index) => bytes[index] === value)
  ) {
    throw new PortabilityError("sqlite_invalid", "The Anki collection is not a SQLite database.");
  }
}

type SqlRow = Readonly<Record<string, number | string | Uint8Array | null>>;

function resultRows(results: readonly QueryExecResult[]): readonly SqlRow[] {
  const result = results[0];
  if (!result) return [];
  return result.values.map((values) =>
    Object.freeze(
      Object.fromEntries(result.columns.map((column, index) => [column, values[index] ?? null])),
    ),
  );
}

function staticRows(database: Database, sql: string): readonly SqlRow[] {
  return resultRows(database.exec(sql));
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function ownRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function parseJsonRecord(text: string): Readonly<Record<string, unknown>> {
  return ownRecord(parseSafeJson(text, 5_000_000)) ?? {};
}

function decodeEntities(value: string) {
  const entities: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/giu, (match, entity: string) => {
    if (entity.startsWith("#x")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isSafeInteger(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isSafeInteger(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return entities[entity.toLowerCase()] ?? match;
  });
}

function ankiHtmlToText(value: string) {
  const withoutActive = value
    .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
    .replaceAll(/<!--[\s\S]*?-->/gu, "");
  const breaks = withoutActive
    .replaceAll(/<br\s*\/?>/giu, "\n")
    .replaceAll(/<\/(?:div|p|li|tr|h[1-6])>/giu, "\n");
  return decodeEntities(breaks.replaceAll(/<[^>]*>/gu, ""))
    .replaceAll(/\r\n?/gu, "\n")
    .replaceAll(/[ \t]+\n/gu, "\n")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .normalize("NFKC")
    .trim();
}

function referencedMediaNames(fields: readonly string[]) {
  const names = new Set<string>();
  for (const field of fields) {
    for (const match of field.matchAll(/\[sound:([^\]\r\n]{1,255})\]/giu)) {
      if (match[1]) names.add(match[1]);
    }
    for (const match of field.matchAll(
      /<(?:img|audio|source)\b[^>]*\bsrc=["']([^"']{1,255})["']/giu,
    )) {
      if (match[1] && !/^[a-z][a-z0-9+.-]*:/iu.test(match[1])) names.add(match[1]);
    }
  }
  return names;
}

function mediaKindAndMime(bytes: Uint8Array, fileName: string) {
  const starts = (...values: readonly number[]) =>
    values.every((value, index) => bytes[index] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return { kind: "image" as const, mimeType: "image/png" };
  if (starts(0xff, 0xd8, 0xff)) return { kind: "image" as const, mimeType: "image/jpeg" };
  if (new TextDecoder().decode(bytes.subarray(0, 6)).startsWith("GIF8")) {
    return { kind: "image" as const, mimeType: "image/gif" };
  }
  if (
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
  ) {
    return { kind: "image" as const, mimeType: "image/webp" };
  }
  if (starts(0x49, 0x44, 0x33) || starts(0xff, 0xfb) || starts(0xff, 0xf3)) {
    return { kind: "audio" as const, mimeType: "audio/mpeg" };
  }
  if (new TextDecoder().decode(bytes.subarray(0, 4)) === "OggS") {
    return { kind: "audio" as const, mimeType: "audio/ogg" };
  }
  if (
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WAVE"
  ) {
    return { kind: "audio" as const, mimeType: "audio/wav" };
  }
  const extension = fileName.split(".").pop()?.toLowerCase();
  return {
    kind: "other" as const,
    mimeType: extension === "svg" ? "image/svg+xml" : "application/octet-stream",
  };
}

function safeTemplate(value: string) {
  return String(sanitizeTemplateMarkup(value));
}

function safeTemplateCss(value: string) {
  return value
    .replaceAll(/\/\*[\s\S]*?\*\//gu, "")
    .replaceAll(/@(?:import|namespace|charset)\b[^;]*;?/giu, "")
    .replaceAll(/url\s*\([^)]*\)/giu, "")
    .replaceAll(/(?:expression|behavior)\s*:[^;}]+[;}]/giu, "")
    .replaceAll(/:global\s*\([^)]*\)/giu, "")
    .replaceAll(/(?:^|\})\s*(?:html|body|:root|\*)\s*\{[^\}]*\}/giu, "")
    .slice(0, 20_000)
    .trim();
}

function normalizedNoteTypes(models: Readonly<Record<string, unknown>>) {
  const output: NormalizedNoteType[] = [];
  let sanitizationCount = 0;
  for (const [externalId, modelValue] of Object.entries(models)) {
    const model = ownRecord(modelValue);
    if (!model) continue;
    const fields = Array.isArray(model.flds)
      ? model.flds
          .map(ownRecord)
          .map((field) => stringValue(field?.name))
          .filter(Boolean)
          .slice(0, 200)
      : [];
    const rawCss = stringValue(model.css);
    const css = safeTemplateCss(rawCss);
    if (css !== rawCss.trim()) sanitizationCount += 1;
    const templates = Array.isArray(model.tmpls)
      ? model.tmpls
          .map(ownRecord)
          .flatMap((template, ordinal) =>
            template
              ? (() => {
                  const rawBack = stringValue(template.afmt);
                  const rawFront = stringValue(template.qfmt);
                  const back = safeTemplate(rawBack);
                  const front = safeTemplate(rawFront);
                  if (back !== rawBack || front !== rawFront) sanitizationCount += 1;
                  return [
                    {
                      back,
                      ...(css ? { css } : {}),
                      externalId: String(numberValue(template.ord, ordinal)),
                      front,
                      name: stringValue(template.name, `Card ${String(ordinal + 1)}`).slice(0, 120),
                      ordinal,
                      templateKey: `anki-${String(numberValue(template.ord, ordinal))}`,
                    },
                  ];
                })()
              : [],
          )
          .slice(0, 100)
      : [];
    output.push({
      code: `anki:${externalId}`,
      externalId,
      fieldNames: fields,
      name: stringValue(model.name, `Anki note type ${externalId}`).slice(0, 180),
      templates,
    });
  }
  return { noteTypes: output, sanitizationCount };
}

function deckDefinition(
  decks: Readonly<Record<string, unknown>>,
  externalId: string,
): { readonly folderPath: readonly string[]; readonly title: string } {
  const deck = ownRecord(decks[externalId]);
  const fullName = stringValue(deck?.name, `Anki deck ${externalId}`);
  const parts = fullName
    .split("::")
    .map((part) => part.normalize("NFKC").trim())
    .filter(Boolean);
  return {
    folderPath: Object.freeze(parts.slice(0, -1)),
    title: (parts.at(-1) ?? fullName).slice(0, 180),
  };
}

function ensureRecognizedTables(database: Database) {
  const tables = new Set(
    staticRows(
      database,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('col','notes','cards','revlog') ORDER BY name",
    ).map((row) => stringValue(row.name)),
  );
  if (!tables.has("col") || !tables.has("notes") || !tables.has("cards")) {
    throw new PortabilityError(
      "sqlite_invalid",
      "The SQLite file does not contain a recognized Anki collection schema.",
    );
  }
  return tables;
}

function boundedCount(database: Database, table: "cards" | "notes" | "revlog", limit: number) {
  const sql = {
    cards: "SELECT count(*) AS count FROM cards",
    notes: "SELECT count(*) AS count FROM notes",
    revlog: "SELECT count(*) AS count FROM revlog",
  }[table];
  const count = numberValue(staticRows(database, sql)[0]?.count);
  if (count > limit) {
    throw new PortabilityError("archive_limit", `The Anki package has too many ${table}.`);
  }
  return count;
}

async function parseAnkiPackage(
  source: PortabilitySource,
  progressPolicy: ProgressImportPolicy,
): Promise<NormalizedGraph> {
  const parsed = portabilitySourceSchema.parse(source);
  if (!parsed.bytes)
    throw new PortabilityError("invalid_format", "An Anki package must be uploaded.");
  const files = safeUnzip(parsed.bytes);
  const collection = sqliteBytes(files);
  assertSqliteHeader(collection.bytes);
  const SQL = await sqlite();
  const database = new SQL.Database(collection.bytes);
  try {
    database.exec("PRAGMA query_only = ON; PRAGMA trusted_schema = OFF;");
    const tables = ensureRecognizedTables(database);
    boundedCount(database, "notes", MAX_NOTES);
    boundedCount(database, "cards", MAX_CARDS);
    if (tables.has("revlog")) boundedCount(database, "revlog", MAX_REVIEWS);
    const col = staticRows(database, "SELECT models, decks FROM col LIMIT 1")[0];
    if (!col)
      throw new PortabilityError("sqlite_invalid", "The Anki collection metadata is missing.");
    const models = parseJsonRecord(stringValue(col.models, "{}"));
    const decks = parseJsonRecord(stringValue(col.decks, "{}"));
    const { noteTypes, sanitizationCount } = normalizedNoteTypes(models);
    const noteTypeByExternalId = new Map(
      noteTypes.map((noteType) => [noteType.externalId, noteType]),
    );
    const mediaManifestBytes = files.get("media");
    const mediaManifest = mediaManifestBytes
      ? parseJsonRecord(new TextDecoder("utf-8", { fatal: true }).decode(mediaManifestBytes))
      : {};
    const media: NormalizedMedia[] = [];
    const mediaExternalIdByName = new Map<string, string>();
    for (const [entryName, fileNameValue] of Object.entries(mediaManifest)) {
      if (typeof fileNameValue !== "string") continue;
      const bytes = files.get(entryName);
      if (!bytes) continue;
      const sha256 = await sha256Hex(bytes);
      const externalId = `anki-media:${entryName}`;
      const detected = mediaKindAndMime(bytes, fileNameValue);
      media.push({
        altText: "",
        byteSize: bytes.byteLength,
        externalId,
        fileName: fileNameValue.slice(0, 255),
        kind: detected.kind,
        mimeType: detected.mimeType,
        sha256,
      });
      mediaExternalIdByName.set(fileNameValue, externalId);
    }
    const cardRows = staticRows(
      database,
      "SELECT id,nid,did,ord,type,queue,due,ivl,factor,reps,lapses FROM cards ORDER BY id LIMIT 500001",
    );
    const cardsByNote = new Map<string, readonly SqlRow[]>();
    for (const card of cardRows) {
      const noteId = String(numberValue(card.nid));
      cardsByNote.set(noteId, [...(cardsByNote.get(noteId) ?? []), card]);
    }
    const deckNotes = new Map<string, NormalizedNote[]>();
    const noteRows = staticRows(
      database,
      "SELECT id,mid,flds,tags,mod FROM notes ORDER BY id LIMIT 100001",
    );
    for (const noteRow of noteRows) {
      const noteId = String(numberValue(noteRow.id));
      const modelId = String(numberValue(noteRow.mid));
      const model = noteTypeByExternalId.get(modelId);
      const rawFields = stringValue(noteRow.flds).split("\u001f").slice(0, 200);
      const fieldNames =
        model?.fieldNames ?? rawFields.map((_, index) => `Field ${String(index + 1)}`);
      const cards = cardsByNote.get(noteId) ?? [];
      const deckId = String(numberValue(cards[0]?.did));
      const generatedCards: NormalizedGeneratedCard[] = cards.map((card, index) => ({
        active: numberValue(card.queue) >= 0,
        externalId: String(numberValue(card.id)),
        generationKey: `anki-${String(numberValue(card.ord, index))}`,
        kind: modelId && ownRecord(models[modelId])?.type === 1 ? "cloze" : "custom",
        ordinal: numberValue(card.ord, index),
        templateKey: `anki-${String(numberValue(card.ord, index))}`,
      }));
      const mediaExternalIds = [...referencedMediaNames(rawFields)]
        .map((name) => mediaExternalIdByName.get(name))
        .filter((value): value is string => value !== undefined);
      const normalized: NormalizedNote = {
        externalId: noteId,
        fields: rawFields.map((value, index) => ({
          key: fieldNames[index] ?? `Field_${String(index + 1)}`,
          name: fieldNames[index] ?? `Field ${String(index + 1)}`,
          value: ankiHtmlToText(value),
        })),
        generatedCards,
        lineageId: `anki:${noteId}`,
        mediaExternalIds,
        modifiedAt: new Date(numberValue(noteRow.mod) * 1000).toISOString(),
        noteTypeCode: model?.code ?? `anki:${modelId}`,
        source: "",
        tags: stringValue(noteRow.tags).trim().split(/\s+/u).filter(Boolean).slice(0, 100),
      };
      deckNotes.set(deckId, [...(deckNotes.get(deckId) ?? []), normalized]);
    }
    const normalizedDecks: NormalizedDeck[] = [...deckNotes.entries()].map(([deckId, notes]) => {
      const definition = deckDefinition(decks, deckId);
      return {
        description: "",
        externalId: deckId,
        folderPath: [...definition.folderPath],
        lineageId: `anki:${deckId}`,
        notes,
        sourceFormat: parsed.fileName?.toLowerCase().endsWith(".colpkg")
          ? "anki_colpkg"
          : "anki_apkg",
        tags: [],
        title: definition.title,
      };
    });
    const schedules =
      progressPolicy === "omit"
        ? []
        : cardRows.map((card) => ({
            algorithm: "anki_import",
            cardExternalId: String(numberValue(card.id)),
            dueAt: null,
            learnerExternalId: "selected_learner",
            state: String(numberValue(card.type)),
            values: {
              due: numberValue(card.due),
              factor: numberValue(card.factor),
              interval: numberValue(card.ivl),
              lapses: numberValue(card.lapses),
              queue: numberValue(card.queue),
              repetitions: numberValue(card.reps),
            },
          }));
    const reviews =
      progressPolicy === "omit" || !tables.has("revlog")
        ? []
        : staticRows(
            database,
            "SELECT id,cid,ease,ivl,lastIvl,factor,time,type FROM revlog ORDER BY id LIMIT 2000001",
          ).map((review) => ({
            cardExternalId: String(numberValue(review.cid)),
            durationMs: Math.max(0, Math.min(numberValue(review.time), 86_400_000)),
            externalId: String(numberValue(review.id)),
            learnerExternalId: "selected_learner",
            rating:
              ["unknown", "again", "hard", "good", "easy"][numberValue(review.ease)] ?? "unknown",
            reviewedAt: new Date(numberValue(review.id)).toISOString(),
            values: {
              factor: numberValue(review.factor),
              interval: numberValue(review.ivl),
              lastInterval: numberValue(review.lastIvl),
              type: numberValue(review.type),
            },
          }));
    return {
      decks: normalizedDecks,
      folders: [],
      loss:
        progressPolicy === "omit" && (cardRows.length > 0 || tables.has("revlog"))
          ? [
              {
                count: cardRows.length,
                feature: "anki_progress",
                message: "Anki scheduling and review history were omitted by the selected policy.",
                policy: "omitted",
              },
            ]
          : [],
      mastery: [],
      media,
      noteTypes,
      practice: [],
      provenance: {
        adapter: "anki_package",
        createdAt: graphNow(),
        sourceFormat: parsed.fileName?.toLowerCase().endsWith(".colpkg")
          ? "anki_colpkg"
          : "anki_apkg",
        ...(parsed.fileName ? { sourceName: parsed.fileName } : {}),
        sourceSha256: await sha256Hex(parsed.bytes),
      },
      publications: [],
      reviews,
      revisions: [],
      schedules,
      schemaVersion: 1,
      settings: {},
      warnings: [
        ...(collection.name === "collection.anki21"
          ? [
              {
                code: "modern_plain_sqlite",
                message:
                  "The plain collection.anki21 database was read through the safe query set.",
                severity: "info" as const,
              },
            ]
          : []),
        ...(sanitizationCount > 0
          ? [
              {
                code: "anki_active_template_content_stripped",
                item: `${String(sanitizationCount)} template or style block(s)`,
                message:
                  "Scripts, event handlers, network CSS, global selectors, or other unsafe template behavior was stripped.",
                severity: "warning" as const,
              },
            ]
          : []),
      ],
    };
  } catch (error) {
    if (error instanceof PortabilityError) throw error;
    throw new PortabilityError("sqlite_invalid", "The Anki collection could not be read safely.");
  } finally {
    database.close();
  }
}

export async function readAnkiMediaFiles(source: PortabilitySource) {
  const parsed = portabilitySourceSchema.parse(source);
  if (!parsed.bytes)
    throw new PortabilityError("invalid_format", "An Anki package must be uploaded.");
  const files = safeUnzip(parsed.bytes);
  const manifestBytes = files.get("media");
  if (!manifestBytes) return new Map<string, Uint8Array>();
  const manifest = parseJsonRecord(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  const mediaFiles = new Map<string, Uint8Array>();
  for (const [entryName, fileName] of Object.entries(manifest)) {
    if (typeof fileName !== "string") continue;
    const bytes = files.get(entryName);
    if (!bytes) continue;
    mediaFiles.set(await sha256Hex(bytes), new Uint8Array(bytes));
  }
  return mediaFiles;
}

interface AnkiModel {
  readonly id: number;
  readonly fieldNames: readonly string[];
  readonly name: string;
  readonly templates: readonly {
    readonly answer: string;
    readonly name: string;
    readonly question: string;
  }[];
  readonly type: 0 | 1;
}

function ankiModels(graph: NormalizedGraph, nowSeconds: number) {
  const models = new Map<string, AnkiModel>();
  for (const deck of graph.decks) {
    for (const note of deck.notes) {
      const signature = `${note.noteTypeCode}\0${note.fields.map((field) => field.name).join("\0")}`;
      if (!models.has(signature)) {
        const first = note.fields[0]?.name ?? "Front";
        const second = note.fields[1]?.name ?? first;
        const kind = note.generatedCards[0]?.kind ?? note.noteTypeCode;
        const isCloze = kind === "cloze" || note.noteTypeCode === "cloze";
        const isTyped = kind === "typed_answer" || note.noteTypeCode === "typed_answer";
        const isReversed =
          note.generatedCards.length > 1 ||
          ["basic_reversed", "bidirectional", "optional_reversed"].includes(kind);
        const templates = isCloze
          ? [{ answer: `{{cloze:${first}}}`, name: "Cloze", question: `{{cloze:${first}}}` }]
          : [
              {
                answer: `{{FrontSide}}<hr id=answer>{{${second}}}`,
                name: isTyped ? "Typed answer" : "Forward",
                question: isTyped ? `{{${first}}}<br>{{type:${second}}}` : `{{${first}}}`,
              },
              ...(isReversed
                ? [
                    {
                      answer: `{{FrontSide}}<hr id=answer>{{${first}}}`,
                      name: "Reverse",
                      question: `{{${second}}}`,
                    },
                  ]
                : []),
            ];
        models.set(signature, {
          fieldNames: note.fields.map((field) => field.name),
          id: 1_700_000_000_000 + models.size,
          name: note.noteTypeCode.startsWith("anki:")
            ? `Imported ${note.noteTypeCode.slice(5)}`
            : `Lumen ${note.noteTypeCode}`,
          templates,
          type: isCloze ? 1 : 0,
        });
      }
    }
  }
  const json: Record<string, unknown> = {};
  for (const model of models.values()) {
    json[String(model.id)] = {
      css: ".card { font-family: Arial; font-size: 20px; text-align: left; color: black; background: white; }",
      did: null,
      flds: model.fieldNames.map((name, ord) => ({
        font: "Arial",
        media: [],
        name,
        ord,
        rtl: false,
        size: 20,
        sticky: false,
      })),
      id: model.id,
      latexPost: "",
      latexPre: "",
      mod: nowSeconds,
      name: model.name,
      req: [[0, "all", [0]]],
      sortf: 0,
      tags: [],
      tmpls: model.templates.map((template, ordinal) => ({
        afmt: template.answer,
        bafmt: "",
        bfont: "",
        bqfmt: "",
        bsize: 0,
        did: null,
        name: template.name,
        ord: ordinal,
        qfmt: template.question,
      })),
      type: model.type,
      usn: -1,
      vers: [],
    };
  }
  return { json, models };
}

const ANKI_SCHEMA_SQL = `
CREATE TABLE col (
  id integer primary key, crt integer not null, mod integer not null, scm integer not null,
  ver integer not null, dty integer not null, usn integer not null, ls integer not null,
  conf text not null, models text not null, decks text not null, dconf text not null, tags text not null
);
CREATE TABLE notes (
  id integer primary key, guid text not null, mid integer not null, mod integer not null,
  usn integer not null, tags text not null, flds text not null, sfld text not null,
  csum integer not null, flags integer not null, data text not null
);
CREATE TABLE cards (
  id integer primary key, nid integer not null, did integer not null, ord integer not null,
  mod integer not null, usn integer not null, type integer not null, queue integer not null,
  due integer not null, ivl integer not null, factor integer not null, reps integer not null,
  lapses integer not null, left integer not null, odue integer not null, odid integer not null,
  flags integer not null, data text not null
);
CREATE TABLE revlog (
  id integer primary key, cid integer not null, usn integer not null, ease integer not null,
  ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null,
  type integer not null
);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn ON notes (usn);
CREATE INDEX ix_cards_usn ON cards (usn);
CREATE INDEX ix_cards_nid ON cards (nid);
CREATE INDEX ix_cards_sched ON cards (did, queue, due);
CREATE INDEX ix_revlog_usn ON revlog (usn);
CREATE INDEX ix_revlog_cid ON revlog (cid);
`;

function htmlField(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br>");
}

const ANKI_SUPPORTED_CARD_KINDS = new Set([
  "basic",
  "basic_reversed",
  "bidirectional",
  "cloze",
  "custom",
  "optional_reversed",
  "typed_answer",
]);

function prepareGraphForAnki(
  graph: NormalizedGraph,
  policy: "cancel" | "flatten" | "map_closest" | "omit" | undefined,
) {
  const unsupportedCount = graph.decks.reduce(
    (total, deck) =>
      total +
      deck.notes.reduce(
        (noteTotal, note) =>
          noteTotal +
          note.generatedCards.filter((card) => !ANKI_SUPPORTED_CARD_KINDS.has(card.kind)).length,
        0,
      ),
    0,
  );
  if (unsupportedCount === 0) return { graph, policy: undefined, unsupportedCount };
  if (!policy || policy === "cancel") {
    throw new PortabilityError(
      "unsupported_archive",
      `${String(unsupportedCount)} interactive study card(s) require an explicit flatten, closest-map, or omit policy.`,
    );
  }
  const prepared: NormalizedGraph = {
    ...graph,
    decks: graph.decks.map((deck) => ({
      ...deck,
      notes: deck.notes.flatMap((note) => {
        const generatedCards =
          policy === "omit"
            ? note.generatedCards.filter((card) => ANKI_SUPPORTED_CARD_KINDS.has(card.kind))
            : note.generatedCards.map((card, index) =>
                ANKI_SUPPORTED_CARD_KINDS.has(card.kind)
                  ? card
                  : {
                      ...card,
                      generationKey: `anki-static-${String(index)}`,
                      kind: "basic",
                      ordinal: index,
                      templateKey: `anki-static-${String(index)}`,
                    },
              );
        return generatedCards.length === 0 ? [] : [{ ...note, generatedCards }];
      }),
    })),
  };
  return { graph: prepared, policy, unsupportedCount };
}

export async function exportAnkiPackage(
  graph: NormalizedGraph,
  options: {
    readonly fileName?: string;
    readonly includeProgress?: boolean;
    readonly mediaFiles?: ReadonlyMap<string, Uint8Array>;
    readonly unsupportedCardPolicy?: "cancel" | "flatten" | "map_closest" | "omit";
  } = {},
): Promise<ExportArtifact> {
  const prepared = prepareGraphForAnki(graph, options.unsupportedCardPolicy);
  const exportGraph = prepared.graph;
  const SQL = await sqlite();
  const database = new SQL.Database();
  try {
    const verifiedMedia: {
      readonly bytes: Uint8Array;
      readonly externalId: string;
      readonly fileName: string;
      readonly key: string;
      readonly kind: "audio" | "image" | "other";
    }[] = [];
    for (const [index, media] of exportGraph.media.entries()) {
      const bytes = options.mediaFiles?.get(media.sha256);
      if (!bytes || (await sha256Hex(bytes)) !== media.sha256) continue;
      verifiedMedia.push({
        bytes,
        externalId: media.externalId,
        fileName: `${String(index).padStart(4, "0")}-${safeFileName(media.fileName, "media")}`,
        key: String(verifiedMedia.length),
        kind: media.kind,
      });
    }
    const mediaByExternalId = new Map(verifiedMedia.map((media) => [media.externalId, media]));
    database.exec(ANKI_SCHEMA_SQL);
    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);
    const { json: modelsJson, models } = ankiModels(exportGraph, nowSeconds);
    const decksJson: Record<string, unknown> = {};
    const deckIdByIndex = new Map<number, number>();
    exportGraph.decks.forEach((deck, index) => {
      const id = 1_710_000_000_000 + index;
      deckIdByIndex.set(index, id);
      decksJson[String(id)] = {
        collapsed: false,
        conf: 1,
        desc: deck.description,
        dyn: 0,
        extendNew: 0,
        extendRev: 0,
        id,
        mod: nowSeconds,
        name: [...deck.folderPath, deck.title].join("::"),
        newToday: [0, 0],
        revToday: [0, 0],
        timeToday: [0, 0],
        usn: -1,
      };
    });
    const defaultConfig = {
      1: {
        autoplay: true,
        dyn: false,
        id: 1,
        lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
        maxTaken: 60,
        mod: 0,
        name: "Default",
        new: {
          bury: true,
          delays: [1, 10],
          initialFactor: 2500,
          ints: [1, 4],
          order: 1,
          perDay: 20,
          separate: true,
        },
        replayq: true,
        rev: {
          bury: true,
          ease4: 1.3,
          fuzz: 0.05,
          hardFactor: 1.2,
          ivlFct: 1,
          maxIvl: 36_500,
          minSpace: 1,
          perDay: 200,
        },
        timer: 0,
        usn: 0,
      },
    };
    database.run(
      "INSERT INTO col (id,crt,mod,scm,ver,dty,usn,ls,conf,models,decks,dconf,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        1,
        Math.floor(nowSeconds / 86_400) * 86_400,
        now,
        now,
        11,
        0,
        -1,
        0,
        JSON.stringify({
          activeDecks: [deckIdByIndex.get(0) ?? 1],
          curDeck: deckIdByIndex.get(0) ?? 1,
        }),
        JSON.stringify(modelsJson),
        JSON.stringify(decksJson),
        JSON.stringify(defaultConfig),
        "{}",
      ],
    );
    const scheduleByCard = new Map(
      exportGraph.schedules.map((schedule) => [schedule.cardExternalId, schedule]),
    );
    const cardIdByExternal = new Map<string, number>();
    let noteOffset = 0;
    let cardOffset = 0;
    for (const [deckIndex, deck] of exportGraph.decks.entries()) {
      const did = deckIdByIndex.get(deckIndex);
      if (did === undefined) {
        throw new PortabilityError("invalid_schema", "An Anki deck mapping is missing.");
      }
      for (const note of deck.notes) {
        const signature = `${note.noteTypeCode}\0${note.fields.map((field) => field.name).join("\0")}`;
        const model = models.get(signature);
        if (!model) {
          throw new PortabilityError("invalid_schema", "An Anki note-type mapping is missing.");
        }
        const nid = now + noteOffset + 1;
        noteOffset += 1;
        const first = note.fields[0]?.value ?? "";
        const checksum = Number.parseInt(
          (await sha1Hex(new TextEncoder().encode(first))).slice(0, 8),
          16,
        );
        const exportedFields = note.fields.map((field) => htmlField(field.value));
        const mediaMarkup = note.mediaExternalIds.flatMap((externalId) => {
          const media = mediaByExternalId.get(externalId);
          if (!media) return [];
          return [
            media.kind === "audio" ? `[sound:${media.fileName}]` : `<img src="${media.fileName}">`,
          ];
        });
        if (mediaMarkup.length > 0) {
          exportedFields[0] = `${exportedFields[0] ?? ""}<br>${mediaMarkup.join("<br>")}`;
        }
        database.run(
          "INSERT INTO notes (id,guid,mid,mod,usn,tags,flds,sfld,csum,flags,data) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [
            nid,
            `lumen-${nid.toString(36)}`,
            model.id,
            nowSeconds,
            -1,
            note.tags.length ? ` ${note.tags.join(" ")} ` : "",
            exportedFields.join("\u001f"),
            first,
            checksum,
            0,
            JSON.stringify({ lumenExternalId: note.externalId ?? null }),
          ],
        );
        const generated: NormalizedGeneratedCard[] =
          note.generatedCards.length > 0
            ? note.generatedCards
            : [
                {
                  active: true,
                  generationKey: "forward",
                  kind: "basic",
                  ordinal: 0,
                  templateKey: "forward",
                },
              ];
        for (const generatedCard of generated) {
          const cid = now + 1_000_000 + cardOffset + 1;
          cardOffset += 1;
          if (generatedCard.externalId) cardIdByExternal.set(generatedCard.externalId, cid);
          const schedule = generatedCard.externalId
            ? scheduleByCard.get(generatedCard.externalId)
            : undefined;
          const values = schedule?.values ?? {};
          database.run(
            "INSERT INTO cards (id,nid,did,ord,mod,usn,type,queue,due,ivl,factor,reps,lapses,left,odue,odid,flags,data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [
              cid,
              nid,
              did,
              generatedCard.ordinal ?? 0,
              nowSeconds,
              -1,
              options.includeProgress ? numberValue(values.state) : 0,
              options.includeProgress ? numberValue(values.queue) : 0,
              options.includeProgress ? numberValue(values.due, cardOffset) : cardOffset,
              options.includeProgress ? numberValue(values.interval) : 0,
              options.includeProgress ? numberValue(values.factor, 2500) : 2500,
              options.includeProgress ? numberValue(values.repetitions) : 0,
              options.includeProgress ? numberValue(values.lapses) : 0,
              0,
              0,
              0,
              0,
              "",
            ],
          );
        }
      }
    }
    if (options.includeProgress) {
      for (const review of exportGraph.reviews) {
        const cid = cardIdByExternal.get(review.cardExternalId);
        if (!cid) continue;
        const ease = { again: 1, easy: 4, good: 3, hard: 2 }[review.rating] ?? 0;
        database.run(
          "INSERT OR IGNORE INTO revlog (id,cid,usn,ease,ivl,lastIvl,factor,time,type) VALUES (?,?,?,?,?,?,?,?,?)",
          [
            new Date(review.reviewedAt).getTime(),
            cid,
            -1,
            ease,
            numberValue(review.values.interval),
            numberValue(review.values.lastInterval),
            numberValue(review.values.factor, 2500),
            review.durationMs ?? 0,
            numberValue(review.values.type),
          ],
        );
      }
    }
    const collection = database.export();
    const files = new Map<string, Uint8Array>([["collection.anki2", collection]]);
    const mediaManifest: Record<string, string> = {};
    for (const media of verifiedMedia) {
      files.set(media.key, media.bytes);
      mediaManifest[media.key] = media.fileName;
    }
    files.set("media", new TextEncoder().encode(JSON.stringify(mediaManifest)));
    const bytes = createZip(files);
    const omittedMedia = exportGraph.media.length - verifiedMedia.length;
    return {
      bytes,
      diagnostics: [],
      fileName: `${safeFileName(options.fileName ?? "lumen-deck").replace(/\.apkg$/u, "")}.apkg`,
      format: "anki_apkg",
      loss: [
        ...(omittedMedia > 0
          ? [
              {
                count: omittedMedia,
                feature: "media",
                message: "Media without supplied verified bytes was omitted from the Anki package.",
                policy: "omitted" as const,
              },
            ]
          : []),
        ...(!options.includeProgress && graph.schedules.length + graph.reviews.length > 0
          ? [
              {
                count: graph.schedules.length + graph.reviews.length,
                feature: "learner_progress",
                message: "Scheduling and review history were omitted by the export policy.",
                policy: "omitted" as const,
              },
            ]
          : []),
        ...(prepared.unsupportedCount > 0
          ? [
              {
                count: prepared.unsupportedCount,
                feature: "interactive_card_behavior",
                message:
                  prepared.policy === "omit"
                    ? "Unsupported interactive study cards were omitted by the selected policy."
                    : prepared.policy === "map_closest"
                      ? "Unsupported interactive study cards were mapped to the closest static Basic representation."
                      : "Unsupported interactive study cards were flattened into static Basic representations.",
                policy:
                  prepared.policy === "omit" ? ("omitted" as const) : ("approximated" as const),
              },
            ]
          : []),
      ],
      mimeType: "application/vnd.anki",
      sha256: await sha256Hex(bytes),
    };
  } finally {
    database.close();
  }
}

const ANKI_CAPABILITIES = Object.freeze({
  ...STRUCTURED_CAPABILITIES,
  practice: false,
  publications: false,
  settings: false,
});

const ankiAdapterDefinition: ImportAdapter & ExportAdapter = {
  capabilities: ANKI_CAPABILITIES,
  code: "anki_package",
  formats: Object.freeze(["anki_apkg", "anki_colpkg"] as const),
  async detect(source) {
    if (!source.bytes) return 0;
    const extension = source.fileName?.toLowerCase() ?? "";
    if (!extension.endsWith(".apkg") && !extension.endsWith(".colpkg")) return 0.1;
    try {
      sqliteBytes(safeUnzip(source.bytes));
      return 1;
    } catch {
      return 0.3;
    }
  },
  async *execute(plan, sink): AsyncIterable<ImportProgress> {
    const graph = await ankiAdapterDefinition.map(plan.source, plan);
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
    return exportAnkiPackage(plan.graph, {
      fileName: plan.fileName,
      includeProgress: plan.includeProgress,
      ...(plan.mediaFiles ? { mediaFiles: plan.mediaFiles } : {}),
      ...(plan.unsupportedCardPolicy ? { unsupportedCardPolicy: plan.unsupportedCardPolicy } : {}),
    });
  },
  async inspect(source): Promise<PortabilityInspection> {
    const graph = await parseAnkiPackage(source, "omit");
    return {
      adapterCode: "anki_package",
      capabilities: ANKI_CAPABILITIES,
      detectedFormat: source.fileName?.toLowerCase().endsWith(".colpkg")
        ? "anki_colpkg"
        : "anki_apkg",
      diagnostics: graph.warnings,
      estimatedItems: countGraphItems(graph),
      loss: graph.loss,
      sample: graph.decks.slice(0, 10).map((deck) => ({
        cards: deck.notes.reduce((total, note) => total + note.generatedCards.length, 0),
        notes: deck.notes.length,
        title: deck.title,
      })),
    };
  },
  async map(source, plan) {
    return parseAnkiPackage(source, plan.progressPolicy);
  },
};

export const ankiAdapter: ImportAdapter & ExportAdapter = Object.freeze(ankiAdapterDefinition);

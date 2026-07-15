# Phase 6 — Quizlet-style import, Anki package compatibility, internal backups, exports, printing, and data portability

Read the content, scheduling, offline, media, and job infrastructure. Implement real import/export behavior with previews, error reporting, and round-trip fixtures. Do not scrape third-party services.

## Objective

Make Lumen unusually portable. Users must be able to bring in authorized flashcard data from common formats, preserve Anki relationships/scheduling where possible, export their work and history, and recover from provider failure through a documented full-fidelity archive.

## 1. Import/export package and adapter interface

Create `packages/import-export` with:

```ts
export interface ImportAdapter {
  code: string;
  detect(input: ImportSource): Promise<DetectionResult>;
  inspect(input: ImportSource): Promise<ImportInspection>;
  map(input: MappingInput): Promise<ImportPlan>;
  execute(plan: ImportPlan, sink: ImportSink): AsyncIterable<ImportProgress>;
}

export interface ExportAdapter {
  code: string;
  inspect(request: ExportRequest): Promise<ExportPlan>;
  execute(plan: ExportPlan, source: ExportSource): AsyncIterable<ExportProgress>;
}
```

Common model includes:

- decks;
- note types;
- fields;
- notes;
- generated cards;
- tags;
- media;
- schedules;
- review logs;
- versions/source metadata;
- warnings/losses.

Adapters must not import directly into random tables. Normalize, validate, preview, then use domain services.

## 2. Job schema and worker

Complete/add:

- `import_jobs`;
- `import_job_items`;
- `export_jobs`;
- `export_artifacts`;
- `job_queue`;
- `job_attempts`;
- temporary upload metadata;
- quarantined diagnostic artifact metadata.

Jobs support:

- status;
- progress;
- cancellation;
- idempotency;
- retry;
- expiration;
- owner/profile authorization;
- detailed warning/error counts;
- result artifact;
- cleanup.

Implement a portable worker path. Small jobs may run in a route/server action; large jobs must chunk and resume. Do not depend on an always-on paid worker. Provide a manual/dev runner and a documented scheduled invocation path.

## 3. Plain text and Quizlet-style import

Implement a fast paste importer:

- term/definition separated by tab, comma, custom delimiter, or configurable characters;
- cards separated by newline or custom delimiter;
- quoted values;
- multiline fields;
- front/back swap;
- language selection;
- first-row headers;
- duplicate policy;
- preview first rows;
- validation;
- bulk import.

Support the common text copied from a user-authorized Quizlet export. Label it accurately as “Quizlet-style text import,” not an official integration.

Do not:

- scrape Quizlet pages;
- ask for Quizlet credentials;
- automate login;
- call undocumented private APIs;
- bypass access controls.

## 4. CSV and TSV

Implement robust parsing with:

- encoding detection/fallback;
- delimiter detection;
- quoted/multiline cells;
- BOM;
- field mapping;
- tags split;
- note type selection;
- custom fields;
- media file-name mapping when supplied in a ZIP;
- duplicate policy;
- update existing by stable external ID/content hash;
- dry-run preview;
- downloadable error file with row and reason.

Exports allow selected fields, headers, tags, IDs, and optional schedule summary.

## 5. JSON and internal full-fidelity archive

Define a documented, versioned internal format.

Archive:

```text
manifest.json
account/profile metadata allowed for export
decks/*.jsonl
note-types/*.json
notes/*.jsonl
cards/*.jsonl
schedules/*.jsonl
review-logs/*.jsonl
practice/*.jsonl
versions/*.jsonl
media/index.json
media/files/*
checksums.json
```

Requirements:

- schema version;
- app/scheduler version;
- timestamps;
- checksums;
- optional encrypted archive using a user-provided passphrase and a standard reviewed browser/server crypto primitive;
- streaming/chunking;
- full restore preview;
- conflict policy;
- account-to-account import with new IDs and lineage mapping;
- exact round-trip tests for supported fields;
- no server secret or password hash in export.

Make this the disaster-recovery format.

## 6. Markdown import/export

Support:

- simple heading/deck structure;
- front/back delimiters;
- cloze syntax;
- tags/frontmatter;
- rich text converted safely;
- images/audio references within an authorized ZIP;
- notes as Markdown files;
- templates and custom fields in frontmatter where possible.

Export readable Markdown and a machine-restorable variant.

## 7. Anki `.apkg` and `.colpkg`

Implement portable package parsing using a maintained ZIP and WASM SQLite approach compatible with serverless/browser constraints.

### Import pipeline

1. validate size and archive structure;
2. unzip safely with zip-bomb/path-traversal protection;
3. locate collection database;
4. open SQLite in WASM;
5. inspect models, decks, notes, cards, revlog, config, and media map;
6. map note types/fields/templates;
7. sanitize template HTML/CSS;
8. strip scripts/event handlers/network behavior;
9. preserve tags;
10. map media by checksum/name;
11. preserve note-card sibling relationships;
12. import schedule state and legacy ease where trustworthy;
13. import review logs with original timestamps, rating/state/duration when available;
14. rebuild FSRS state only when chosen/needed;
15. report unsupported constructs and losses;
16. write in idempotent chunks.

Support common Anki template constructs:

- field references;
- conditional fields;
- FrontSide;
- type-answer fields;
- cloze;
- CSS;
- media.

Unsupported JavaScript/add-on behavior is stripped and reported.

### Export pipeline

Export supported Lumen decks to an Anki-compatible package:

- basic/reverse/optional reverse;
- typed;
- cloze;
- image/media;
- tags;
- templates/CSS within safe subset;
- scheduling and review logs when selected;
- media map;
- stable mapping metadata.

For card types Anki cannot represent directly, offer:

- flatten to basic/static representation;
- map to closest supported type;
- omit with explicit report;
- do not silently corrupt.

### Tests

Use legally created synthetic fixtures, including:

- basic;
- reverse;
- cloze;
- image;
- custom fields;
- media;
- review logs;
- legacy schedules;
- Unicode;
- malformed archive;
- zip bomb/path traversal;
- unsupported script;
- round-trip.

Do not include copyrighted third-party decks in the repository.

## 8. Other app adapters

Create documented extension points and at least generic mappings for:

- Mochi-like Markdown/JSON;
- common flashcard CSV exports;
- Q/A JSON;
- internal API import.

Do not claim official compatibility without documented fixtures.

## 9. Printable and shareable exports

Implement:

- print stylesheet for deck study guide;
- cut-out flashcards with front/back alignment options;
- answer key;
- test and report printing;
- PDF-friendly browser print flow;
- accessible page structure;
- configurable paper size/margins;
- media fallback.

A server PDF generator is optional; core printing must work without paid infrastructure.

## 10. Complete account export and restore

Connect Phase 1 export jobs to real data:

- profile;
- learner profiles;
- decks/content/media;
- schedules/review logs;
- practice/mastery;
- classes/assignments where permitted;
- game history/progression;
- privacy/consent records as appropriate;
- settings;
- social/permission metadata.

Respect ownership and third-party/class restrictions. Export must not leak another collaborator’s private data.

Implement owner restore/import into a clean account with ID remapping and a report.

## 11. Import/export UX

Build:

- source selection;
- drag/drop and file picker;
- paste;
- inspection;
- field mapping;
- note type mapping;
- deck target/new deck;
- duplicate policy;
- schedule/history choice;
- media choice;
- privacy warning;
- progress;
- cancel/retry;
- result summary;
- downloadable warnings/errors;
- recent job history;
- artifact expiration.

Large imports must not freeze the browser. Use workers/streaming where practical.

## 12. Security

- size limits;
- MIME and magic-byte checks;
- zip path traversal/zip bomb protection;
- SQLite query safety;
- parser timeouts/chunk limits;
- sanitizer;
- no execution of imported content;
- authorization;
- signed temporary URLs;
- cleanup;
- no raw content in logs;
- SSRF protection for any future remote source; direct URL import remains disabled unless safely implemented.

## Required acceptance criteria

- plain text, CSV, TSV, JSON, Markdown imports work;
- Quizlet-style paste is easy and accurately described;
- internal archive round-trips content, media, schedules, and review logs;
- synthetic Anki fixtures import with relationships and supported scheduling/history;
- Anki export creates a valid package for supported types;
- unsupported constructs produce explicit reports;
- malicious archives/templates are rejected or sanitized;
- complete account export is scoped correctly;
- printing works;
- jobs resume/cancel/clean up;
- unit, database, E2E, security, and round-trip tests pass;
- setup/status docs list format coverage and known losses precisely.

Do not implement third-party scraping or pretend unsupported proprietary APIs exist.

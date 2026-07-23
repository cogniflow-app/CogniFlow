# Import, Export, and Portability

## Scope

Phase 06 adds owner-controlled import, export, disaster-recovery backup, clean-account restore, printable output, and durable portability jobs. It does not scrape third-party services, collect third-party credentials, automate logins, or use undocumented APIs. “Quizlet-style text import” means pasted text from an export the user is authorized to use.

`packages/import-export` is framework-independent. Adapters detect and inspect untrusted input, produce a validated normalized graph, and execute only through an authorized sink. They never write database tables directly.

## Supported format matrix

| Format                                       | Import                                                                                           | Export                                               | Media                                           | Templates/card types                                                                                                              | Schedule/history                                  | Exact round-trip and known loss                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quizlet-style/plain text                     | Yes, pasted text with configurable field/card separators, header, direction, languages, and tags | Yes                                                  | No                                              | One front/back projection                                                                                                         | No                                                | Not exact; structured fields, media, and progress are reported as omitted                                                                                                                           |
| CSV/TSV                                      | Yes, comma/tab/semicolon/pipe detection and explicit mapping                                     | Yes                                                  | No                                              | Custom columns import as custom fields; export projects front/back                                                                | No                                                | Not exact for custom templates or extra fields; formula-like cells are neutralized                                                                                                                  |
| JSON                                         | Yes, normalized schema v1 and common Q/A arrays/objects                                          | Yes                                                  | Descriptors in normalized JSON, not media bytes | Normalized note types, fields, templates, and generated cards                                                                     | Yes in normalized schema                          | Exact for valid normalized v1 JSON; generic Q/A JSON is a documented safe mapping                                                                                                                   |
| Markdown bundle                              | Yes, readable Markdown/frontmatter/cloze and machine graph                                       | Yes                                                  | Verified bytes in `media/files/<sha256>`        | Machine graph is exact; readable Markdown projects front/back                                                                     | Preserved in machine graph                        | Exact for the machine graph and verified media; readable-only imports cannot recover omitted structure                                                                                              |
| Anki `.apkg` / plain-SQLite `.colpkg` subset | Yes, synthetic and user-owned packages                                                           | `.apkg`                                              | Verified image/audio media map                  | Basic, reversed, optional reversed, typed-answer, cloze, custom fields, tags, CSS/FrontSide/conditionals through sanitized models | User-selectable compatible schedule/review import | Best effort, not universal Anki fidelity; add-ons, executable template behavior, and unsupported interactive cards are stripped, rejected, flattened, closest-mapped, or omitted with explicit loss |
| Lumen archive v1                             | Yes, including optional encrypted envelope                                                       | Yes                                                  | Exact verified bytes                            | Full normalized model                                                                                                             | Schedules, reviews, practice, and mastery         | Exact archive graph/media round-trip; cross-account restore creates fresh IDs and does not replay security/session state                                                                            |
| Browser print/HTML                           | Not applicable                                                                                   | Study guide, cut-out cards, test, answer key, report | Browser-rendered when available                 | Safe text projection                                                                                                              | Report-only summaries                             | Browser pagination and PDF bytes may vary                                                                                                                                                           |

## Normalized interchange model

Schema version 1 distinguishes folders, decks, note types, fields, templates, notes/card entries, generated cards, tags, media descriptors, revisions, deck versions, publications, schedules, immutable review evidence, practice evidence, mastery, settings, provenance, source versions, warnings, and compatibility loss. Canonical JSON sorts object keys before hashing. Stable external IDs make repeated text, delimited, JSON, and Markdown plans deterministic.

## Inspection and import workflow

The owner selects or pastes a source, then Lumen validates MIME/magic/size, detects a format, inspects a bounded sample, shows mapping and loss, collects duplicate/progress/media/conflict choices, and creates a payload-bound job. The trusted content service performs writes. Per-item receipts bind source fingerprints to canonical IDs so retries do not duplicate completed work.

Files up to 64 MiB are accepted. Sources over 1 MiB use 500-note durable chunks. Each request reacquires a bounded lease, reparses the checksum-verified private object, skips completed item receipts, checkpoints progress, and yields without consuming a retry attempt. The browser can reload; the Jobs surface can resume or cancel. Ordinary errors expose only safe categories, never source content.

Duplicate policies are explicit: create, skip, update by trusted external ID/content hash, or merge safe fields. Restore conflict policies are abort, create independently, create in a new namespace, skip exact matches, or update trusted lineage. Fuzzy matching is not used.

## Lumen archive v1

An archive is a deterministic ZIP structure with:

- `manifest.json` for versions, counts, and exact resource paths;
- `checksums.json` containing SHA-256 for every other entry;
- `data/graph.json` as the canonical machine-restorable graph;
- readable/scoped JSON and JSONL projections for profiles, decks, card entries, generated cards, note types, schedules, reviews, practice, mastery, revisions, versions, settings, privacy, guides, and safe offline metadata;
- `media/index.json` plus content-addressed verified media bytes.

Restore rejects a missing, extra, duplicated, corrupted, count-mismatched, or unsupported-version resource. Media descriptor path, size, and digest must all agree.

The optional encrypted envelope is `LUMENENC1` with versioned metadata, PBKDF2-SHA-256 (600,000 iterations, random 128-bit salt), AES-256-GCM, a random 96-bit IV, and authenticated envelope metadata. A wrong passphrase and corrupted ciphertext share one neutral error. Passphrases remain request-memory only and are never persisted, logged, analyzed, or stored in provider secrets.

## Complete account export and restore

The Phase 01 privacy request now drives the same real complete-account Lumen exporter and is marked complete only after a private expiring artifact is registered. The snapshot is owner-scoped and includes current Phase 00–05 profile, learner, relationship/consent metadata where exportable, decks/content/types/templates/media, revisions/versions/publications, schedules/reviews, practice/mastery, preferences, presets, sessions, grading rules/overrides, goals/plans/tests/bests, guides, safe sync metadata, and entitled audit events.

Clean-account restore remaps canonical IDs, rebuilds folders, restores sanitized note types/templates/content/media, maps learner-private schedules/reviews/practice/mastery to the selected self profile, and restores validated profile/privacy preferences while preserving the destination account handle and authentication identity. The result includes conflict and unsupported-section diagnostics.

Authentication sessions, passwords, provider/server tokens, device bypass credentials, signed URLs, consent claims, guardian/access relationships, and stale device/session state are never restored. Publications, historical versions/revisions, audit evidence, guides, presets/plans/tests, and other sections without a safe cross-account replay contract remain in the archive and are named in the unsupported-section report.

## Anki boundary

The parser opens the imported database in memory, sets query-only/trusted-schema restrictions, validates the SQLite header and recognized tables, uses static bounded queries, never loads extensions or executes imported SQL, and closes the database in `finally`. Package ZIPs use the general hostile-archive limits.

Imported HTML is converted through safe text/content boundaries. Templates and CSS pass the project sanitizer; scripts, event handlers, JavaScript URLs, global CSS escape, imports/network CSS, and unsupported executable behavior are removed and reported. Export creates a real SQLite `collection.anki2`, package media map, sanitized models, sibling cards, compatible scheduling rows, and review logs. Only synthetic repository fixtures are used in tests.

## Archive and parser limits

- Compressed source: 64 MiB.
- Total expanded ZIP: 256 MiB.
- Individual ZIP entry: 64 MiB.
- Entries: 2,048.
- Normalized path: 512 UTF-8 bytes; absolute, drive, traversal, control-character, duplicate-normalized, symlink-like, and unsafe separator paths are rejected.
- Compression ratio: 200:1.
- Delimited input: 100,001 rows, 501 columns, and 1,000,000 characters per field.
- Normalized deck: 100,000 notes; UI previews at most ten sample rows/decks.
- Progress/evidence writes: 500 items per database call.

ZIPs are decompressed only to bounded memory and never to an uncontrolled filesystem path. Nested archives are not recursively executed or extracted.

## Private storage, expiration, and cleanup

The `lumen-portability` bucket is private and has no browser Storage policies. The server stores only opaque paths in private tables. Public RLS tables expose sanitized job/artifact metadata to the owning account. Downloads reauthorize ownership and expiry, then return `private, no-store`, `nosniff`, no-index headers. The service worker bypasses all portability URLs.

Uploads and artifacts expire after 24 hours. Successful imports, terminal cancellation/failure, manual artifact deletion, expiration cleanup, and account deletion hide or make object metadata eligible for cleanup. Service cleanup is deliberately two phase: claim an eligible opaque path, delete that exact Storage object, then confirm metadata deletion. Manual deletion follows the same physical-delete-before-finalize order. A failed Storage deletion remains tombstoned but eligible for a later retry; account deletion expedites cleanup without falsely claiming that the private bytes are already gone.

## Operations and recovery

The portable worker library claims bounded leases, observes cancellation between chunks, records checkpoints/attempts/receipts, and limits retries. The default runner performs cleanup only; ordinary large imports use authenticated bounded route chunks and do not require an always-on paid worker. A deployment with a worker may provide the same handler contract.

Operators may log opaque job IDs, adapter, byte/item counts, duration, protocol/version, warning/error category, and result. They must not log card text, learner answers, rich documents, passphrases, media/database bytes, or private progress payloads.

Recovery order is: inspect sanitized job state; retry only a retryable job; allow an expired lease to be reclaimed; cancel if the owner requests it; run private object cleanup; verify queue/attempt/receipt state; never edit receipts or canonical review logs.

## Test evidence

Synthetic tests cover quoted/multiline/BOM/Unicode/custom-field delimited input, deterministic IDs, generic JSON, Markdown frontmatter/cloze/media, exact archive domain/media round-trip, secret rejection, checksum/count/resource tampering, encryption failure neutrality, ZIP traversal/size/count/ratio limits, real SQLite Anki export/reimport, sibling/card-type/media/progress behavior, unsupported-card policies, corrupted/missing packages, cancellation, worker retry/crash behavior, private no-cache headers, and print modes/settings.

The performance fixture parses 100,000 two-field text rows without rendering them. Hosted measurements and exact command totals are recorded in `IMPLEMENTATION_STATUS.md` and the Phase 06 pull request after Preview acceptance.

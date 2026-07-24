# Implementation status

**Current phase:** Phase 06 — Import, export, and portability  
**Status:** Phase 06 merged through PR #18 at
`bced8ea8986b58684d0f85fe6773921dadb14389`. Its original implementation was verified locally and
against the fixed Preview environment before merge. The post-merge XLSX import, palette, and
long-content reflow follow-up is implemented on `agent/xlsx-import-content-reflow`; it remains
Preview-only until separate review and merge. This follow-up does not promote or otherwise mutate
Beta Supabase or Vercel Production.  
**Evidence date:** 2026-07-23  
**Next phase:** Phase 07 has not started

This record describes implemented repository behavior and verified local and hosted evidence. Product intent remains canonical in [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md), cross-cutting decisions are recorded in [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md), and provider operations are documented in [HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md) and [SETUP.md](./SETUP.md).

## Phase 06 starting baseline

PR #17 merged at `2b4e5beb700aa0199831bd024fa2f9fc739d2d0f`. Before the Phase 06 branch
was created, the authorized Phase 05 promotion applied exactly
`20260723000000_phase05_sync_schema.sql` to fixed Beta project `qccbaynfvtyxigiikpmq`.
`pnpm db:verify:beta` then confirmed 53 matching migrations, an empty push dry run, 1/1 hosted
invariants, clean public/private schema diff, generated-type parity, and no unexpected Storage
object. The previously documented function-volatility diagnostics remain warnings only. Production
health reported that same full commit, `vercelEnvironment: production`,
`deploymentProfile: vercel_beta`, and the fixed Beta project; all child/public-child/chat/OAuth
safety gates remain disabled. `pnpm test:hosted:production --url https://recallflash.com` passed
11/11 in 11.1 seconds.

The clean merged tree then passed `pnpm install --frozen-lockfile`, a fresh local 53-migration
`pnpm db:reset`, and `pnpm verify`: formatting, secret scan, dependency/lint boundaries, all 12
strict TypeScript workspaces, 93 files / 742 unit tests, 23 database files / 971 assertions,
one-commit/one-stale-conflict SRS concurrency, generated database types, standard and OpenNext
builds, 36 browser passes / 21 intentional profile skips, 30/30 accessibility checks, Lighthouse
assertions, and 15/15 k6 checks with 0% failures and 8.85 ms request-duration p95. The dedicated
`pnpm test:pwa` suite also passed 4/4. Docker `29.6.1` and local Supabase were healthy.
`apps/web/.env.local` remained ignored/untracked and was never printed. No Phase 06 migration or
application change has been sent to Beta or Production.

## Phase 06 import, export, and portability

### Completed Phase 06 scope

- Added framework-independent `@lumen/import-export` contracts and a versioned normalized graph
  spanning folders, decks, note types, templates, notes/cards, media, content history, learner
  schedules/reviews, practice/mastery, settings, publication metadata, provenance, diagnostics,
  and explicit loss. Stable lineage IDs and canonical JSON make retries deterministic.
- Added bounded adapters for pasted/Quizlet-style text, CSV/TSV, Excel/Google Sheets `.xlsx`,
  generic and versioned JSON, Markdown bundles, real Anki SQLite `.apkg` packages, and lossless
  Lumen archives. Import offers inspect/map/preview before execution, explicit XLSX worksheet
  selection, duplicate and progress policies, row diagnostics, and resumable 500-item mutation
  chunks; no third-party login, scraping, or credential collection is present.
- Added canonical ZIP validation, checksum closure, content-addressed media, strict JSON/Markdown
  boundaries, formula-safe delimited export, bounded in-memory read-only Anki SQLite handling, and
  authenticated `LUMENENC1` archive encryption. Passphrases remain request-local and are never
  persisted or logged.
- Added hostile-OOXML preflight and pinned `read-excel-file` `9.3.4`; macro-enabled workbooks and
  unsafe sparse dimensions fail closed, formulas never execute, external links are ignored, and
  embedded-object/formula loss is visible before importing cached scalar values.
- Added owner-RLS import/export jobs, private queue leases/checkpoints/receipts, payload-bound
  idempotency, cancellation/retry/resume, artifact expiry/deletion, and a private
  `lumen-portability` Storage bucket. Physical cleanup now uses claim, Storage delete, then
  confirmation; a failed provider deletion remains retryable instead of falsely finalizing
  metadata.
- Added the `/app/portability` Import, Export, Backups, Jobs, and Print experience, direct job
  links, private no-cache download/API behavior, service-worker exclusions, contextual guides,
  privacy-export integration, clean-account additive restore, complete account archive support,
  and printable cards/list/table layouts with accessibility and low-stimulation behavior.
- Added a restrained multi-accent portability palette and one long-content layout policy across
  authoring/generated previews, public/review/actual flashcards, practice prompts and choices,
  Match board/list, tests, import samples, study guides, cut-out cards, answer keys, and reports.
  Browser acceptance covers unbroken terms at 200% text without horizontal page overflow.
- Added a portable bounded worker/manual cleanup runner and a guarded Preview acceptance harness.
  The hosted parent provisions separate source and clean-restore adult accounts, retains all
  provider credentials, spaces those admin-created fixtures across the provider create window,
  tests cross-account artifact isolation, performs canonical account deletion, deletes claimed
  Storage objects before confirming metadata, and proves both private buckets empty.
- Hardened the local verification wrapper against post-reset Supabase gateway DNS drift with a
  loopback-only health probe and an exact-project gateway restart. This recovery cannot target a
  hosted project or alter provider configuration.

The format capability/loss matrix, hostile-file limits, cleanup protocol, and operational recovery
rules are in [IMPORT_EXPORT_AND_PORTABILITY.md](./IMPORT_EXPORT_AND_PORTABILITY.md).

### Phase 06 migrations

| Migration                                                     | Purpose                                                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260724000000_phase06_portability_schema.sql`               | Owner-RLS job/artifact metadata, private queue/upload/receipt state, idempotent owner/service RPCs, account-deletion integration, and private Storage bucket             |
| `20260724001000_phase06_portability_resume_and_evidence.sql`  | Durable item/checkpoint evidence, retry/resume boundaries, artifact/object lifecycle, and expanded privacy-export integration                                            |
| `20260724002000_phase06_portability_chunk_yield.sql`          | Initial append-only continuation-yield revision; superseded by the later corrective migration rather than edited after application testing                               |
| `20260724003000_phase06_portability_upload_cleanup.sql`       | Upload cleanup and cancellation/expiry object eligibility                                                                                                                |
| `20260724004000_phase06_portability_chunk_yield_fix.sql`      | Correct fixed-search-path continuation-yield implementation                                                                                                              |
| `20260724005000_phase06_account_audit_export.sql`             | Service-only complete account audit/export projection used by lossless archives                                                                                          |
| `20260724006000_phase06_storage_cleanup_confirmation.sql`     | Two-phase object cleanup claim/confirm contract so metadata becomes deleted only after successful physical Storage removal; account deletion safely expedites tombstones |
| `20260724007000_phase06_sql_expression_qualification_fix.sql` | Append-only correction for three restore/queue routines that incorrectly qualified PostgreSQL `LEAST`/`GREATEST` SQL expressions as catalog functions                    |
| `20260724008000_phase06_xlsx_import_format.sql`               | Import-only XLSX enum/storage support, export-table guards, and official XLSX MIME admission in the private portability bucket                                           |

Every earlier migration is unchanged. A fresh reset applies all 62 migrations in order and the
seed inserts no application data. Generated database types match the reset schema.

### Phase 06 local evidence

| Command or evidence                                       | Result                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                          | Exit 0; all 14 workspace projects are current under Node `24.18.0` / pnpm `11.13.0`                                                                                                                                                                                    |
| `pnpm format:check` / `pnpm secret:scan`                  | Exit 0; formatting accepted and no credential finding                                                                                                                                                                                                                  |
| `pnpm lint` / `pnpm typecheck`                            | Exit 0; dependency boundaries and all strict TypeScript workspaces pass                                                                                                                                                                                                |
| `pnpm test`                                               | Exit 0; 101 files / 801 tests; coverage 71.30% statements, 58.31% branches, 71.64% functions, 74.14% lines                                                                                                                                                             |
| `pnpm --filter @lumen/import-export test`                 | Exit 0; 40 deterministic spreadsheet/delimited/archive/encryption/Anki/adversarial/performance tests                                                                                                                                                                   |
| `pnpm --filter @lumen/worker test`                        | Exit 0; 16 job claim/checkpoint/cancel/crash/retry/exhaustion/bounds/Storage-cleanup tests                                                                                                                                                                             |
| `pnpm db:reset` / `pnpm test:db`                          | Exit 0; fresh 62-migration reset; 24 files / 1,032 pgTAP assertions plus SRS concurrency (1 commit, 1 typed stale conflict, 1 immutable log, 25.482 ms)                                                                                                                |
| `pnpm db:types:check`                                     | Exit 0 after canonical regeneration; committed generated types match the reset schema                                                                                                                                                                                  |
| `pnpm build:verify` / verification-wrapped portable build | Exit 0; optimized Next.js produces 96 route/static entries and OpenNext emits `.open-next/worker.js`; the real browser Anki round trip proves the traced `sql.js` WASM boundary                                                                                        |
| `pnpm test:pwa`                                           | Exit 0; 4/4 production-mode service-worker/offline matrix scenarios pass, including portability no-cache exclusions                                                                                                                                                    |
| `pnpm test:e2e`                                           | Exit 0; 41 passed / 25 intentional cross-project skips across desktop, mobile, reduced-motion, authoring, practice, study, identity, portability, and layout workflows                                                                                                 |
| `pnpm test:a11y`                                          | Exit 0; 30/30 axe, keyboard, focus, theme, serious/reduced-motion, offline-dashboard, and authenticated checks pass                                                                                                                                                    |
| `pnpm test:lighthouse`                                    | Exit 0; all configured Lighthouse assertions pass                                                                                                                                                                                                                      |
| `pnpm test:load`                                          | Exit 0; 15/15 checks, 0% request failures, request-duration p95 8.76 ms                                                                                                                                                                                                |
| `pnpm verify`                                             | Exit 0; the aggregate CI-equivalent gate reran every practical local check above against the final Phase 06 tree                                                                                                                                                       |
| Portability performance                                   | 10,000-row CSV inspect/map under 5 s; 100,000-row text parse under 10 s; 10,000-note archive create/verify/restore/encrypt under 20 s                                                                                                                                  |
| Real visual QA                                            | Desktop XLSX worksheet selection, the multi-accent portability palette, long-content import/print/study-guide output, and desktop/mobile Match/Test at 200% text; all wrap without page overflow and the mobile test-summary correction passed its exact focused rerun |

### Hosted Phase 06 evidence (2026-07-23 23:20 UTC)

Commit `f339f88c566b29f7f0b1b54e0a542ab66ba57784` reached Ready as deployment
`dpl_4pY7WynwN1DTekbKWtBdSiaVWzRA` at the exact protected Preview URL
`https://cogniflow-n640klt0q-cogniflow-app-3471s-projects.vercel.app`. The branch alias was not
used as evidence. Health and both guarded runners confirmed Vercel Preview uses fixed Preview
Supabase project `cfwddajyjbueggpzfomh`.

| Command or evidence                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:deploy:preview`               | Exit 0; applied only the eight Phase 06 migrations through `20260724007000_phase06_sql_expression_qualification_fix.sql` to fixed Preview; no seed or fixture was deployed                                                                                                                                                                                                                                                                                     |
| Initial `pnpm db:verify:preview`       | Exit 0 after the append-only qualification correction; all 61 migrations are current, migration dry run is empty, Phase 06 schema lint errors are gone, hosted invariants pass, public/private schema diff is empty, generated types match, and both private Storage buckets are empty. Previously documented legacy function-volatility diagnostics remain warnings only.                                                                                     |
| Exact Vercel deployment                | Commit and deployment above reached Ready with 96 application route/static entries; Preview ownership/protection attestation passed and Production aliases were rejected by the runners                                                                                                                                                                                                                                                                        |
| `pnpm test:hosted:preview`             | Exit 0; 11/11 protected baseline checks passed in 10.0 seconds against the exact immutable deployment                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm test:hosted:preview:portability` | Exit 0; 1/1 in 51.4 seconds proved adult onboarding authorization, text/CSV import, JSON/Markdown/real-Anki export, real `.apkg` reimport, complete and encrypted archives, a separate clean-account restore, cross-account artifact denial, explicit artifact deletion, direct jobs, print, private no-cache behavior, and canonical account/Storage cleanup                                                                                                  |
| Cleanup proof                          | Exit 0; the guarded parent retained provider credentials while Playwright received none, canonical deletion removed both disposable Auth identities plus active content/schedule/review/practice/portability state, cleanup deleted claimed Storage bytes before confirming metadata, the minimization query returned `rows: []`, both `lumen-content` and `lumen-portability` were empty, the temporary browser profile was removed, and Preview was unlinked |
| Post-cleanup `pnpm db:verify:preview`  | Exit 0; remote migration dry run remains empty, hosted invariants pass, public/private schema diff remains empty, linked generated types match, both private Storage buckets remain empty, and Preview was unlinked                                                                                                                                                                                                                                            |

The first hosted database lint exposed invalid qualification of PostgreSQL `LEAST`/`GREATEST`
expressions in three Phase 06 routines. The already-applied migrations were preserved and
`20260724007000_phase06_sql_expression_qualification_fix.sql` corrected them append-only; a fresh
local reset, local lint, 1,029 pgTAP assertions, and the hosted verifier then passed. An initial
browser diagnostic also proved the authorization boundary correctly rejects an Auth-only
provisional account; the harness was corrected to exercise the real adult sign-up age gate before
confirmation, and its `finally` cleanup returned `rows: []` before the successful rerun.

Final GitHub CI on Linux exposed a font-metric-specific 200%-text overflow in the print toolbar:
the back link and print controls could not wrap at the 1,280 px desktop viewport. The toolbar and
control group now wrap within the viewport while retaining the narrow-screen column layout; the
focused desktop and reduced-motion import/export/print workflow passes 2/2 with both normal and
200% text overflow assertions.

Phase 06 adds no owner-only environment, provider, credential, Auth, SMTP, OAuth, domain, analytics,
or paid-service setup action. PR #18 later merged to `main`; the XLSX/palette/reflow follow-up is
isolated on `agent/xlsx-import-content-reflow` and must remain Preview-only until its separate
review. This follow-up has not mutated Beta Supabase, Vercel Production, `recallflash.com`, or any
prior safety gate.

### XLSX, palette, and content-reflow follow-up evidence (2026-07-24 02:56 UTC)

Commit `954879c6cc1a11799a607532180b232f220040e2` reached Ready as deployment
`dpl_3VwVSjrZFQLCKw1eJFw77Gc3YN8A` at the exact protected Preview URL
`https://cogniflow-qklhiylx3-cogniflow-app-3471s-projects.vercel.app`. The branch alias was not
used as evidence. Only migration `20260724008000_phase06_xlsx_import_format.sql` was added to fixed
Preview project `cfwddajyjbueggpzfomh`; Beta Supabase and Vercel Production were not changed.

| Command or evidence                    | Result                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial `pnpm db:verify:preview`       | Exit 0; all 62 migrations are current, migration dry run is empty, hosted invariants pass, public/private schema diff is empty, generated types match, and both private Storage buckets are empty. Previously documented legacy function-volatility diagnostics remain warnings only.                                                                                                  |
| Exact Vercel deployment                | Commit and deployment above reached Ready with 96 application route/static entries; Preview ownership/protection attestation passed and Production aliases were rejected by the runners.                                                                                                                                                                                               |
| `pnpm test:hosted:preview`             | Exit 0; 11/11 protected baseline checks passed in 10.5 seconds against the exact immutable deployment.                                                                                                                                                                                                                                                                                 |
| `pnpm test:hosted:preview:portability` | Exit 0; 1/1 in 57.4 seconds repeated the complete guarded portability journey and added real XLSX workbook inspection, explicit worksheet selection, mapped import, and imported-content verification. The journey again proved cross-account artifact denial, explicit deletion, private no-cache behavior, canonical account deletion, and physical Storage cleanup.                 |
| Cleanup proof                          | Exit 0; the guarded parent retained provider credentials while Playwright received none, both disposable Auth identities and their application data were deleted, claimed Storage bytes were removed before metadata confirmation, the minimization query returned `rows: []`, both `lumen-content` and `lumen-portability` were empty, and the temporary browser profile was removed. |
| Post-cleanup `pnpm db:verify:preview`  | Exit 0; remote migration dry run remains empty, hosted invariants pass, public/private schema diff remains empty, linked generated types match, both private Storage buckets remain empty, and Preview was unlinked.                                                                                                                                                                   |

The follow-up remains isolated in draft PR #19. It adds no owner-only environment, provider,
credential, Auth, SMTP, OAuth, domain, analytics, or paid-service setup action.
During the final immutable-deployment repeat, a status-only diagnostic reproduced Preview Auth
returning `200` then `403` for two immediate admin fixture creates and `200`/`200` when separated by
1.5 seconds. The guarded parent now enforces that abort-aware spacing; its regression test verifies
the exact order without exposing the server key.

## Phase 05 offline PWA and synchronization

Branch `codex/phase-05-offline-pwa-sync` began from clean fetched `origin/main` at `c682123`.
Phase 04 and its follow-up were present in Git history; Production health returned the same full
commit, `vercelEnvironment: production`, `deploymentProfile: vercel_beta`, Beta project
`qccbaynfvtyxigiikpmq`, and every child/social/OAuth safety gate disabled. The fixed Beta database
verifier passed before a Phase 05 migration was added. Docker and local Supabase were healthy;
`apps/web/.env.local` remains ignored/untracked and was never printed.

### Completed Phase 05 scope

- Added framework-independent `@lumen/offline` protocol version 1 and local schema version 1 with
  strict Zod contracts, deterministic canonical serialization/SHA-256 payload binding, causal
  ordering, lossless decimal cursors, deterministic bounded retry/jitter, dead letters, temporary
  IDs, and a project-owned Dexie repository.
- Added 25 IndexedDB stores for namespace metadata, pins/projections/schedules/media, five typed
  outboxes, local sessions, cursors, device state, receipts, conflicts, capabilities/flags, cache
  and LRU metadata, temporary mappings, and worker-update state. Every private row is keyed by
  immutable account/learner UUID namespace; sign-out/account/profile/guardian boundaries clear it
  across tabs while public cache policy remains separate.
- Added an original installable manifest, generated 192/512/maskable icons, production-only service
  worker registration, versioned static/public caches, explicit no-cache private/API/auth/settings
  classes, neutral fail-closed offline shell, deliberate updates, background-sync request
  forwarding, install/update/status prompts, and a loopback-only production PWA test harness that
  cannot relax hosted HTTPS validation.
- Added authorized 10,000-card private pin projections, browser quota checks, content-hash verified
  image/audio Blob storage, reference-counted hash deduplication, selected-media preferences,
  atomic ready manifests, unpin cleanup, persistent-storage request, LRU support, and honest media
  limitation copy. Signed URLs are fetched with `no-store` and are never persisted.
- Added offline canonical Review/undo events with complete before-state/base version, optimistic
  `@lumen/srs` projection, causal prior-operation links, canonical server replay, exact retry
  receipts, typed conflict/retry/dead-letter outcomes, and authoritative reconciliation. Offline
  learners can undo a still-pending review; the dependent compensating event cannot dispatch
  before its review predecessor is acknowledged. Offline Flashcards/Learn/Write/Test/Match
  practice uses local `@lumen/grading` evidence and never mutates canonical schedules implicitly;
  the server regrades accepted attempts.
- Added stable-ID offline deck creation, server ID mapping, conservative schema-aware three-way
  merge for independent deck/card fields and rich-document nodes, safe merge receipts/history,
  typed overlapping content/media conflict retention, first-class Conflict Center, per-operation
  retry/abandon, per-type pending counts, preferences, storage/pin/device cleanup controls, and ten
  contextual guide extensions.
- Added the guarded `test:hosted:preview:offline` runner/config/spec. It reuses fixed Preview
  ownership attestation, keeps the provider key in the parent, gives Playwright no provider or
  bypass credential, provisions one disposable adult identity, and always invokes canonical
  deletion/minimization and recursive Storage verification.
- Reconciled the stale hosted runbook to current Phase 04 `main`/Production/Beta reality and added a
  Preview-only Phase 05 deployment/acceptance procedure. No Beta, Production, Auth, SMTP, OAuth,
  consent, child, public-child, chat, analytics, or provider configuration changed.

The complete architecture, cache matrix, IndexedDB model, protocol behavior, browser fallbacks,
conflict rules, and limitations are in [OFFLINE_PWA_AND_SYNC.md](./OFFLINE_PWA_AND_SYNC.md).

### Phase 05 migration

| Migration                                | Purpose                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260723000000_phase05_sync_schema.sql` | Minimal RLS-protected device/profile checkpoints and preferences, private payload-bound operation receipts, privacy-minimized monotonic change references, and fixed-search-path service-only sync RPCs |

Every earlier migration remains unchanged. A fresh reset applies all 53 migrations in order and
the seed inserts no application data. Generated database types include the four Phase 05 RPCs and
match the reset schema.

### Phase 05 local evidence

| Command or evidence                                       | Result                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                          | Exit 0; all 13 workspace projects are current under Node `24.18.0` / pnpm `11.13.0`                                                                                                                                                            |
| `pnpm format:check` / `pnpm secret:scan`                  | Exit 0; formatting accepted and no credential finding                                                                                                                                                                                          |
| `pnpm lint` / `pnpm typecheck`                            | Exit 0; dependency boundaries and all 12 strict TypeScript workspaces pass                                                                                                                                                                     |
| `pnpm test`                                               | Exit 0; 93 files / 742 tests; coverage 73.29% statements, 62.01% branches, 70.71% functions, 76.52% lines                                                                                                                                      |
| `pnpm --filter @lumen/offline test`                       | Exit 0; 3 files / 27 tests cover protocol/fingerprint/causality/cursor/retry/dead-letter, namespace isolation/cleanup, 10k reads, media dedup/refcounts, receipts, and conservative structured merge                                           |
| `pnpm db:reset` / `pnpm test:db`                          | Exit 0; fresh 53-migration reset; 23 files / 971 pgTAP assertions plus SRS concurrency (1 commit, 1 typed stale conflict, 1 immutable log, 25.646 ms)                                                                                          |
| `pnpm db:types:check`                                     | Exit 0 after canonical regeneration; committed generated types match the reset schema                                                                                                                                                          |
| SRS performance                                           | Domain queue 10.675 ms; database queue 97.510 ms; Today 96.016 ms; resume 0.295 ms; Statistics 66.928 ms at 10,000-card scale                                                                                                                  |
| `pnpm build:verify` / verification-wrapped portable build | Exit 0; optimized Next.js produces 90 route/static entries and OpenNext emits `.open-next/worker.js`; direct unwrapped builds correctly reject the local HTTP production URL                                                                   |
| `pnpm test:pwa`                                           | Exit 0; 4/4 production-mode scenarios cover verified pin/offline shell, Review undo + practice/content replay + exact retry + sign-out purge, different-field content auto-merge, two-device review conflict, and the responsive visual matrix |
| `pnpm test:e2e`                                           | Exit 0; 36 pass / 21 intentional cross-project skips across desktop, mobile, reduced-motion, authoring, practice, study, identity, and layout workflows                                                                                        |
| `pnpm test:a11y`                                          | Exit 0; 30/30 axe, keyboard, focus, theme, serious/reduced-motion, offline-dashboard, and authenticated checks pass                                                                                                                            |
| `pnpm test:lighthouse`                                    | Assertions pass; scores 98/100/96/100; FCP 0.761 s, LCP 2.314 s, TBT 1.5 ms, CLS 0                                                                                                                                                             |
| `pnpm test:load`                                          | Exit 0; 15/15 checks, 0% request failures, request-duration p95 7.25 ms                                                                                                                                                                        |
| `pnpm verify`                                             | Exit 0; the aggregate CI-equivalent gate reran every practical local check above against the final Phase 05 tree                                                                                                                               |
| PWA performance                                           | 10,000 local card projections read in under the 2,000 ms budget; database queue/Today/resume/Statistics timings remain under their Phase 03 budgets                                                                                            |
| Real visual QA                                            | 11 required viewports plus 125%/150% zoom, 200% text, mobile light/dark/reduced-motion, and 320×568 offline shell; no overflow or clipped action detected                                                                                      |

### Hosted Phase 05 evidence (2026-07-23 17:11 UTC)

Commit `3948f14a31e4b2bb808bce09dd83e3a7e0a05439` reached Ready as deployment
`dpl_3dWN3eGk71nzQEzsZWky3AdZeJqd` at the exact protected Preview URL
`https://cogniflow-5oqnp9sj3-cogniflow-app-3471s-projects.vercel.app`. The branch alias was not used
as evidence. Health and the guarded runner both confirmed Vercel Preview uses fixed Preview
Supabase project `cfwddajyjbueggpzfomh`.

| Command or evidence                   | Result                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:deploy:preview`              | Exit 0; applied only `20260723000000_phase05_sync_schema.sql` to fixed Preview after the complete local gate; no seed or fixture was deployed                                                                                                                                                                                                                 |
| Initial `pnpm db:verify:preview`      | Exit 0; remote history current, migration dry run empty, hosted invariants pass, public/private schema diff empty, generated types match, and Storage empty; previously documented legacy function-volatility warnings remain warnings only                                                                                                                   |
| Exact Vercel deployment               | Commit and deployment above reached Ready; 90 application route/static entries were built, Preview ownership/protection attestation passed, and Production aliases were rejected by the runner                                                                                                                                                                |
| `pnpm test:hosted:preview`            | Exit 0; 11/11 protected baseline checks passed in 11.8 seconds against the exact immutable deployment                                                                                                                                                                                                                                                         |
| `pnpm test:hosted:preview:offline`    | Exit 0; 1/1 in 1.0 minute proved adult onboarding, manifest/icons/worker, private pin and offline navigation, canonical Review plus exact duplicate, two fresh-device-context stale conflict and resolution, offline practice, offline deck/card creation, typed synchronization, sign-out IndexedDB purge, and anonymous isolation                           |
| Cleanup proof                         | Exit 0; the guarded parent retained provider credentials, Playwright received none, canonical deletion removed Auth and active disposable content/schedule/review/practice/sync/guide/publication state, the minimization query returned `rows: []`, recursive content Storage was empty, the temporary browser profile was removed, and Preview was unlinked |
| Post-cleanup `pnpm db:verify:preview` | Exit 0; remote migration dry run remains empty, hosted invariants pass, public/private schema diff remains empty, linked generated types match, Storage remains empty, and Preview was unlinked                                                                                                                                                               |

Every diagnostic hosted run used the same `finally` cleanup boundary and also returned `rows: []`;
no persistent test fixture or Storage object was retained. Hosted-only harness hardening after the
aggregate local gate passed Prettier, ESLint, the 12-workspace strict typecheck, and repeated guarded
acceptance. Phase 05 adds no owner-only environment, provider, credential, Auth, SMTP, OAuth,
domain, bucket, analytics, or paid-service setup action. Beta Supabase, Production Supabase,
Vercel Production, `recallflash.com`, and all Phase 00–04 safety gates remain unchanged. Phase 06
has not started.

## Phase 04 adaptive Learn and guided study experience

Branch `codex/phase-04-adaptive-learn-and-guided-experience` began at merged `origin/main`
`54d7946`. The pre-existing Phase 03 prompt whitespace stash remains untouched. Docker and local
Supabase were healthy; `apps/web/.env.local` remains ignored/untracked and its values were never
printed. No Beta/Production provider, SMTP, OAuth, child-safety flag, seed, or secret changed.

### Completed scope

- Added `@lumen/grading`: deterministic normalization, aliases/synonyms/keywords, list/select-all
  partial credit, numeric units/tolerances, safe math, typo/token similarity, four strictness
  profiles, properties, and a disabled optional semantic boundary.
- Added `@lumen/learning-engine`: separate recognition/recall mastery, weighted/decayed evidence,
  staged Learn progression, deterministic adaptive selection/distractors, anti-repeat/sibling and
  accessibility rules, exam planning, property tests, and a 10,000-candidate budget.
- Added learner-private practice sessions/items/attempts/mastery, accepted rules, audited overrides,
  explicit SRS links, goals, exams, test definitions/attempts/responses, personal bests, preferences,
  and guide progress. RLS, fixed-search-path RPCs, idempotency/version/content checks, response
  minimization, append-only evidence, and account deletion are database-tested.
- Rebuilt Study as one coherent Review + Practice hub with schedule-effect badges, mode availability,
  practice resume, mastery glance, weak-area practice, exam planning, and Help & guide. Added shared
  setup/focus/completion patterns for Flashcards, Learn, Write, Test, Match, Spell, Pronunciation,
  and Diagram.
- Added the bounded 3D practice flip, explicit no-silent-SRS qualification, deterministic feedback,
  delayed mastery progression, pause/resume, star/audio/hints/retype, audited answer correction,
  Test answer navigation/flags/timer/review/print, Match personal bests, local-only pronunciation
  recording, diagram zoom/text alternative, and real private summaries.
- Added a versioned seven-step first-run guide, fourteen contextual mini-guides, a non-blocking
  invitation, desktop coach/mobile sheet, focus/Escape/fallback behavior, persistence across
  reloads/devices, role/learner awareness, and `/app/getting-started` with real checklist evidence,
  glossary, recommendations, mode effects, and restartable tours. No clickstream or third-party
  analytics was added.
- Repaired the reported visual defects: every Phase 04 surface now uses valid design tokens; Study
  retains 16/24/32 px gutters; the stage is capped at 896 px, cards at 440 px desktop/352 px mobile;
  mobile guide positioning is bounded; and intrinsic-width overflow at 320 px is removed. The
  flip matches the published player's staged rhythm and becomes immediate under serious/reduced
  motion.
- Added a guarded Preview practice acceptance wrapper/config/spec that inherits the established
  ownership attestation, credential sandbox, disposable identity, account-deletion minimization,
  interruption cleanup, and empty-Storage proof.

The exact formulas, evidence boundaries, guide model, mode contract, privacy rules, and performance
limits are in [PRACTICE_AND_GUIDES.md](./PRACTICE_AND_GUIDES.md). The complete route/state visual
audit is in [PRODUCT_UX_AUDIT.md](./PRODUCT_UX_AUDIT.md#phase-04-adaptive-practice-and-guide-audit).

### Phase 04 migrations

| Migration                                              | Purpose                                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260722002000_phase04_practice_schema.sql`           | Private practice/mastery/rules/overrides/goals/exams/tests/bests/preferences/guides schema, constraints, indexes, RLS, grants, append-only/deletion triggers |
| `20260722003000_phase04_practice_rpcs.sql`             | Authorized session/control/attempt/override/explicit-SRS/preference/guide transaction boundaries                                                             |
| `20260722004000_phase04_planning_and_testing_rpcs.sql` | Authorized goal/exam/test-definition/test-attempt/test-response/personal-best transaction boundaries                                                         |

Every earlier migration remains unchanged. A fresh reset applied all 52 migrations in order and
the seed inserted no application data. Generated database types match that fresh schema.

### Local Phase 04 evidence (2026-07-22)

| Command or evidence                      | Result                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`         | Exit 0; all 12 workspace projects and the lockfile are current under Node `24.18.0` / pnpm `11.13.0`                                                      |
| `pnpm format:check` / `pnpm secret:scan` | Exit 0; repository formatting accepted and no credential finding                                                                                          |
| `pnpm lint` / `pnpm typecheck`           | Exit 0; dependency boundaries and all 11 strict TypeScript workspaces pass                                                                                |
| `pnpm test`                              | Exit 0; 89 files / 705 tests; coverage 73.40% statements, 62.32% branches, 70.54% functions, 76.63% lines                                                 |
| `pnpm db:reset`                          | Exit 0; empty rebuild through all 52 migrations; no application seed data                                                                                 |
| `pnpm test:db`                           | Exit 0; 22 files / 953 assertions plus SRS concurrency (1 commit, 1 typed stale conflict, 1 immutable log, 24.493 ms)                                     |
| `pnpm db:types:check`                    | Exit 0; committed generated types match the reset schema                                                                                                  |
| SRS performance                          | Domain queue 17.736 ms; database queue 99.506 ms; Today 100.214 ms; resume 0.346 ms; Statistics 69.427 ms at 10,000-card scale                            |
| `pnpm build` / `pnpm build:portable`     | Exit 0; optimized Next build produces 86 route/static entries and OpenNext emits `.open-next/worker.js`                                                   |
| `pnpm test:e2e`                          | Exit 0; 33 pass / 21 intentional cross-project skips across desktop, mobile, and reduced-motion; Phase 04 functional and explicit 12-viewport matrix pass |
| `pnpm test:a11y`                         | Exit 0; 28/28 axe, keyboard, focus, theme, serious-mode, and reduced-motion checks pass                                                                   |
| `pnpm test:lighthouse`                   | Assertions pass; scores 99/100/96/100; FCP 0.758 s, LCP 2.160 s, TBT 2 ms, CLS 0                                                                          |
| `pnpm test:load`                         | 15/15 checks pass; 0 failed; request-duration p95 6.94 ms                                                                                                 |
| `pnpm verify`                            | Exit 0; aggregate CI-equivalent gate reran every practical local check above after guide/browser synchronization hardening                                |

### Hosted Phase 04 evidence (2026-07-22 08:16 UTC)

Commit `0e473c11738144f32bf56de2b6c903989fafb73e` reached Ready at the exact protected Preview URL
`https://cogniflow-qkegtuai1-cogniflow-app-3471s-projects.vercel.app`. The branch alias was not used
as evidence because it redirects to the immutable deployment URL above.

| Command or evidence                   | Result                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm db:deploy:preview`              | Exit 0; applied only the three additive Phase 04 migrations to fixed Preview project `cfwddajyjbueggpzfomh`; no seed data                                                      |
| Initial `pnpm db:verify:preview`      | Exit 0; remote history current, empty dry run, hosted invariants pass, public/private schema diff empty, generated types match; warnings-only volatility diagnostics unchanged |
| `pnpm test:hosted:preview`            | Exit 0; 11/11 protected baseline smoke checks passed against the exact immutable Preview                                                                                       |
| `pnpm test:hosted:preview:practice`   | Exit 0; 1/1 disposable scenario proved first-run guide persistence, Flashcards, one-page Test/review, Getting Started, private-data isolation, and no canonical review writes  |
| Cleanup proof                         | Exit 0; canonical account deletion removed Auth and active disposable practice/content/guide state; the guarded query returned `rows: []`; recursive content Storage was empty |
| Post-cleanup `pnpm db:verify:preview` | Exit 0; migration dry run remained empty, hosted invariants passed, schema diff stayed empty, generated types matched, and Storage remained empty                              |

The acceptance harness was hardened to wait for actual rendered question/feedback states, open the
collapsed Test behavior controls before selection, accept the valid single-question completion
state, and cap every browser action at 20 seconds. Every diagnostic run still executed guarded
cleanup and returned `rows: []`. Beta Supabase, Production Supabase, Vercel Production,
`recallflash.com`, SMTP, OAuth, child-safety flags, and provider secrets were not changed. Phase 05
has not started.

### Phase 04 Match, Test, and visual follow-up (2026-07-22)

Branch `codex/phase-04-match-test-visual-polish` began from clean merged `origin/main` at `8d037da`.
This follow-up changes no migration, RLS policy, authentication behavior, environment variable,
canonical review endpoint, or scheduler calculation.

- Match is now a real deterministic shuffled board containing one term and one definition tile for
  every remaining session card. Learners can drag one tile onto another or use click, touch, and
  keyboard selection; matched pairs clear from the board, incorrect pairs remain available, and
  retry evidence remains part of the practice attempt.
- Match includes a first-class list alternative with one definition selector per term. Both board
  and list paths save through the existing authorized practice-attempt boundary, preserve resume
  behavior and personal-best timing, and never mutate canonical SRS state.
- Test now renders every remaining seeded question in one scrollable document. Multiple choice,
  select-all, true/false, typed, list, and ordering questions share one answer sheet, compact
  progress overview, flags, pause policy, timer, and a single final **Submit test** action.
- Test drafts are retained in session storage across a same-device reload. Submission is sequential
  and retry-safe, unanswered questions are scored incorrect, partial submission failures retain
  answers and skip already-saved items, and the completed page leads with the score and organized
  question-level review.
- Practice data reads are batched across session cards, decks, mastery, accepted rules, and
  schedules instead of issuing one complete server read per visible card. The single-item attempt
  authorization path remains unchanged.
- The Study mode chooser, setup cards, focus headers, prompts, completion summaries, Match board,
  and Test paper now use restrained purple/teal/amber/rose accents, stronger grouping, real gutters,
  shorter learner-facing copy, and fewer repeated scheduling disclaimers. Learn and Flashcards keep
  the answer out of the DOM until the flip midpoint, while the card height is reduced to remove the
  reported empty slab. Serious and reduced-motion modes remove nonessential movement.

| Command or evidence                                | Result                                                                                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck`                     | Exit 0; dependency boundaries and all 11 strict TypeScript workspaces pass                                                                            |
| `pnpm test`                                        | Exit 0; 89 files / 708 tests; coverage 72.85% statements, 61.84% branches, 69.50% functions, 76.06% lines                                             |
| focused `phase-four-practice.spec.ts` desktop run  | Exit 0; 2/2 full-data flows pass, including the three-pair board, three-type single-submit Test, score/review, and no canonical review request        |
| focused Match/Test mobile and reduced-motion runs  | Exit 0; 2/2 runs pass with no horizontal overflow                                                                                                     |
| focused `phase-four-layout.spec.ts` desktop matrix | Exit 0; 1/1 test passes across all 12 viewports, 125%/150% zoom, 200% text, dark, serious, and reduced-motion states                                  |
| Match/Test inline axe checks                       | Exit 0; no serious or critical WCAG 2 A/AA/2.1 AA violations on the populated board or mixed Test paper                                               |
| `pnpm build:verify`                                | Exit 0; optimized Next.js production build generates all 86 route/static entries                                                                      |
| direct `pnpm build` in the developer environment   | Correctly rejected the local HTTP `NEXT_PUBLIC_APP_URL`; the verification-wrapped production build above passed                                       |
| `pnpm test:db`                                     | Not rerun: the unchanged database suite could not start because Docker Desktop was unavailable; this follow-up adds no migration or database contract |

## Phase 03 Study experience redesign

Branch `codex/phase-03-study-experience-redesign` began from clean `origin/main` at `c4bf53d2`. A
pre-existing whitespace-only prompt edit was preserved separately and is not part of the branch.
The ignored local environment file was not read or changed. The redesign changes frontend
presentation and read-only completion projection only; it adds no migration, API contract,
authorization rule, authentication behavior, environment variable, scheduler calculation, or
canonical mutation behavior.

### Completed redesign scope

- Rebuilt Study around one Today action, a compact resumable-session banner, concise deck rows,
  common practice shortcuts, recent filters, and a five-step Custom Study dialog. Deck-targeted
  Study links now scope Today and session creation to the selected deck.
- Added a dedicated review focus shell with no persistent workspace rail, a compact scope/progress/
  connection header, Pause and Exit, a bounded content-aware card, and stable desktop/mobile rating
  controls. Label, interval, and shortcut are separate elements; `1`–`4`, answer secrecy, canonical
  success-before-advance, retry, conflict, undo, and swipe-confirmation semantics are unchanged.
- Corrected the final responsive rhythm with safe-area-aware 32 px large-screen, 24 px ordinary,
  and 16 px mobile page gutters plus explicit top spacing on Study, Statistics, and Scheduling.
  Review now uses the same gutters instead of the former 8–12 px edge clearance.
- Replaced the oversized review slab with an 800 px bounded, 288–416 px adaptive card scene and
  aligned its reveal/rating/action controls to the same measure. Long or media-rich cards scroll
  inside the scene rather than forcing a huge mostly empty surface.
- Added a click/tap or keyboard two-stage perspective flip with the published player's 460 ms total
  motion rhythm. The persistent renderer preserves typed answers, drawings, recordings, ordering,
  and other in-card state; the answer remains absent through the first half of the flip and enters
  only at the edge-on midpoint. Serious mode, the saved reduced-motion preference, and the operating
  system reduced-motion preference remove both flip and card-entry motion.
- Reduced permanent review controls to Star, available Undo, and Edit. Bury, related-card bury,
  suspend, report, timer, autoplay, swipe preference, manual due/range/order, leech, reset, and
  rebuild remain reachable through an accessible More menu and focused dialogs with risk-appropriate
  confirmation.
- Rebuilt Statistics as data-aware zero, sparse, and sufficient-history experiences with Overview,
  Activity, Memory, and Decks views; real date/deck filters; learner-facing terminology; visible
  charts; screen-reader summaries; and disclosed table alternatives. No sample metric is rendered.
- Reorganized Scheduling into Basics, Daily limits, Order, Advanced, Decks, and Maintenance. The
  Basics view recommends FSRS, expresses desired retention as an accessible percentage slider/input,
  and previews workload; migration and bulk controls remain explicit and confirmed.
- Repaired deck integration with Add cards, contextual Study, an authorized More menu, five semantic
  totals, compact type chips, and collapsed Quick Add. Roles with no command do not receive an empty
  menu. Public/shared schedule privacy is unchanged.
- Extended the development-only design-system gallery with Study progress, connectivity, ratings,
  focus toolbar, warnings, metrics, filters, charts/table disclosure, zero state, wizard, and dialog/
  sheet patterns. Production continues to return not-found for that route.
- Replaced the Phase 03 override cascade with a single `@layer components` architecture scoped to
  Study, Review, Statistics, Scheduling, and deck roots. It consumes existing product tokens,
  introduces no global `kbd`/table/label/details rule, and uses no `!important`. The focus shell
  explicitly isolates the legacy unlayered workspace grid at the component boundary.

The complete before/after state matrix, independent defects, CSS root cause, evidence labels,
viewports, themes, modes, and implementation boundaries are documented in
[PRODUCT_UX_AUDIT.md](./PRODUCT_UX_AUDIT.md#phase-03-study-experience-redesign-audit).

### Redesign migrations and configuration

No migration was added or edited. The 49-migration chain is byte-for-byte outside this diff and
resets from empty. Generated database types remain current. No environment variable, provider
metadata, lockfile, dependency, RLS policy, API route contract, Supabase Auth behavior, FSRS/SM-2
calculation, queue rule, idempotency behavior, review-log rule, or schedule-version rule changed.

### Local redesign acceptance

| Command or evidence                        | Result                                                                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`           | Exit 0; 10 workspace projects current, lockfile unchanged under Node `24.18.0` / pnpm `11.13.0`                                                                  |
| `pnpm format:check` / `pnpm secret:scan`   | Exit 0; formatting accepted and no credential finding                                                                                                            |
| `pnpm lint` / `pnpm typecheck`             | Exit 0; ESLint and dependency boundaries pass; 9/9 strict TypeScript projects pass                                                                               |
| Focused redesign tests                     | 4 files / 47 rating, review, staged-flip, statistics, and deck-command tests pass                                                                                |
| `pnpm test`                                | Exit 0; 85 files / 668 tests; coverage 74.15% statements, 64.37% branches, 72.38% functions, 77.51% lines                                                        |
| `pnpm db:reset` / `pnpm test:db`           | Exit 0; all 49 existing migrations reset; 21 files / 889 assertions pass; concurrency proves 1 commit, 1 typed stale conflict, and 1 immutable log in 22.906 ms  |
| SRS performance/parity                     | 10,000-card domain queue 12.470 ms; database queue 98.919 ms; Today 97.565 ms; resume 0.297 ms; Statistics 70.621 ms; all budgets and exact scheduler tests pass |
| `pnpm db:types:check`                      | Exit 0; generated database types match the reset local schema                                                                                                    |
| verification-wrapped `pnpm build`          | Exit 0; optimized Next build produces 76 route/static entries                                                                                                    |
| verification-wrapped `pnpm build:portable` | Exit 0; OpenNext emits `.open-next/worker.js`. A direct run correctly rejected the ignored developer HTTP URL before the documented wrapper was used.            |
| `pnpm test:e2e`                            | Exit 0; 29 pass / 19 intentional cross-project skips, including canonical desktop/mobile review and Phase 02/03 visual regressions                               |
| `pnpm test:a11y`                           | Exit 0; 28/28 axe, keyboard, focus, theme, serious-mode, and reduced-motion checks pass                                                                          |
| `pnpm test:lighthouse`                     | Assertions pass; scores 98/100/96/100; FCP 0.757 s, LCP 2.310 s, TBT 3 ms, CLS 0                                                                                 |
| `pnpm test:load`                           | 15/15 checks pass; 0 failed; request-duration p95 5.37 ms                                                                                                        |
| `pnpm verify`                              | Exit 0; aggregate CI-equivalent gate reran every practical local check above after browser synchronization hardening                                             |

Sanitized Playwright captures were inspected directly for empty/populated Study, the full Custom
Study flow, scheduling Basics/Advanced, deck integration, prompt/answer/rating states, undo,
zero/sparse/sufficient Statistics, content changes, serious mode, reduced motion, mobile, and 200%
text. Follow-up acceptance also measures the exact responsive gutters, 800 px / 416 px desktop and
mobile card bounds, preserve-3d motion, staged answer secrecy, and the typed-answer state retained
across reveal. The in-app browser surface reported no available browser instance, so the
repository's real Chromium desktop and Pixel 7 projects supplied the visual evidence. No
screenshot, video, trace, identity, or browser artifact is tracked.

The aggregate browser run also hardened two harness-only edges it exposed: Pause acceptance now
waits for the successful control response and completed Study navigation, and the public/Auth
viewport loop retries only Chrome's explicit `ERR_NETWORK_IO_SUSPENDED` operating-system condition
once. Application HTTP errors and all other navigation failures still fail immediately.

### Redesign Hosted Preview checkpoint

PR #13 merged the original redesign. PR #14 then merged the Learn spacing, bounded review-card,
and staged flip polish into `main` as commit `54d7946`. The original protected Vercel Preview
reached `READY`; guarded application acceptance remained pending because the local Vercel CLI OAuth
credential was rejected before an automation-bypass value could be retrieved. Deployment
Protection was not weakened and Chrome was not used as an authentication fallback without owner
approval. Beta Supabase, Vercel Production, and `recallflash.com` remain untouched.

## Phase 03 SRS and canonical review engine

Branch `codex/phase-03-srs-review-engine` began from clean `origin/main` at `8b63e448`. Before Phase
03 changes, Docker/local Supabase were healthy, the ignored `apps/web/.env.local` existed without
being read or modified, the 33-migration Phase 00–02 chain reset cleanly, and the complete baseline
passed. Phase 02's usability work was already merged even though this file's former header still
described its draft branch.

### Completed scope

- Added framework-independent `@lumen/srs` with exact `ts-fsrs` `5.4.1`, project engine identity
  `lumen-srs/1 (v5.4.1 using FSRS-6.0)`, FSRS defaults (0.90 retention, 36500-day maximum,
  `1m 10m` learning, `10m` relearning, short-term scheduling and fuzz), genuine SM-2 compatibility,
  presets, all states/ratings, previews, retrievability, replay/rebuild, rollback, forget, explicit
  algorithm migration, content operations, time/study-day utilities, deterministic queues, and a
  disabled-by-default optimizer adapter with a 400-log threshold.
- Added learner-private presets and immutable versions, per-deck settings, canonical schedules and
  logs, sessions/items, saved filters, daily counters, undo compensation, scheduling-operation
  audit, optimizer metadata, content decisions, lazy controls, and account-deletion minimization.
  All exposed tables use RLS; service scheduling functions use actor-derived authorization, fixed
  search paths, exact grants, indexed policy/queue predicates, and no service-role direct SRS table
  grants. Set-based, current-session content authorization helpers preserve the existing deck,
  note, card, learner, and registered-device policy semantics without repeating security-definer
  checks for every row in a large authorized queue.
- Added one canonical review route and RPC protocol. The browser never supplies the next schedule.
  The trusted server computes with `@lumen/srs`; PostgreSQL repeats authorization, locks/compares
  version and before-state, binds idempotency to the complete command, atomically writes immutable
  evidence plus schedule/session/counter/sibling/leech effects, and returns a typed stale conflict
  to a competing legitimate command. An authorized replay lookup runs before mutable session or
  schedule preflight, and an append-only private receipt returns the exact original canonical
  response for an identical retry while rejecting payload-changing UUID reuse. Undo is
  compensating, not deletion.
- Added `/app/study`, `/app/study/session/[sessionId]`, `/app/stats`, and
  `/app/settings/scheduling`, plus deck Study entry/counts and first-class workspace navigation.
  Today, deck, folder, multi-deck, saved-filter, due/new, state, forgotten, leech, starred, tag,
  review-ahead, cram, preview-only, relative-overdue, deterministic random, and interval-range
  queues use real authorized data. Repository reads paginate deterministically beyond PostgREST row
  caps and batch large identifier sets.
- Added the calm canonical review surface: answer absent from DOM before reveal; server-consistent
  interval previews; Again/Hard/Good/Easy and keyboard `1`–`4`; double-submit guard; failure/conflict
  retention; progress/remaining/state/timer; pause/resume; exact edit; star, bury, sibling bury,
  suspend, report, undo, manual/range/order/leech/forget/rebuild/content decisions; safe
  confirm-only swipe; typed local comparison; audio preference; live announcements; mobile,
  serious-mode, and reduced-motion behavior.
- Added personal preset CRUD/duplication/default restore, multi-deck apply, FSRS/SM-2 selection,
  requested retention, steps, maximum interval, daily limits/order/mix, sibling/leech/fuzz settings,
  workload preview, bulk controls, and explicit audited algorithm migration preview/confirmation.
- Added real private statistics for state/due counts, review count/time, ratings, lapses/leeches,
  retrievability/stability/difficulty/interval distributions, forecast, heatmap, answer time,
  maturity, decks, tags, workload, and grouped per-card review history with accessible tables and
  exact edit links. No sample metrics are rendered.

The implementation contract, state machine, queue, time behavior, trust boundary, content-change
decisions, settings, statistics, SM-2, and optimizer boundary are documented in
[SRS_REVIEW_ENGINE.md](./SRS_REVIEW_ENGINE.md). Phase 04 adaptive Learn/grading, games, imports,
collaboration, and actual offline synchronization were not started.

### Additive migrations

1. `20260721000000_srs_schema.sql`
2. `20260721001000_srs_authorization_and_rpcs.sql`
3. `20260721002000_srs_presets_and_content_decisions.sql`
4. `20260721003000_srs_session_controls.sql`
5. `20260721004000_srs_content_change_decisions.sql`
6. `20260721005000_srs_schedule_replacement.sql`
7. `20260721006000_srs_sibling_bury_and_reports.sql`
8. `20260721007000_srs_bulk_schedule_controls.sql`
9. `20260721008000_srs_account_deletion_privacy.sql`
10. `20260721009000_srs_saved_filters.sql`
11. `20260721010000_srs_algorithm_migration.sql`
12. `20260721011000_srs_lazy_schedule_controls.sql`
13. `20260721012000_srs_lazy_control_audit_normalization.sql`
14. `20260721013000_srs_read_authorization_performance.sql`
15. `20260722000000_srs_review_replay_receipts.sql`
16. `20260722001000_srs_review_replay_volatility.sql`

No applied Phase 00–02 migration was edited. No setup value or environment variable was added.

### Focused acceptance evidence

| Check              | Result                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lumen/srs` tests | 4 files / 28 deterministic, exact-parity, SM-2, optimizer, time/DST, queue, property, and 10,000-card tests pass                                                                               |
| Phase 03 web tests | 5 focused files / 14 route, replay, rendering, double-submit, statistics, and pagination tests pass                                                                                            |
| Local database     | Reset through all 49 migrations; 21 pgTAP files / 889 assertions pass                                                                                                                          |
| Concurrency        | Two database connections: 1 commit, 1 typed stale conflict, 1 immutable log; aggregate canonical mutation 25.174 ms                                                                            |
| Queue performance  | Authorized registered-device 10,000-card queue 96.417 ms; Today 94.936 ms; resume 0.295 ms; statistics 66.352 ms; all budgets pass                                                             |
| Browser E2E        | 29 pass / 19 intentional cross-project skips across Chromium desktop and Pixel 7                                                                                                               |
| Accessibility      | 28/28 axe, keyboard, focus, zoom, responsive, theme, motion, and authenticated route checks pass                                                                                               |
| Visual acceptance  | 2/2 dedicated desktop/mobile layout projects pass; actual Chromium pixels inspected for populated Study, collapsed/expanded scheduling, and 200% mobile statistics with no horizontal overflow |
| Lighthouse         | Assertions pass; scores 98/100/96/100; FCP 0.758 s, LCP 2.311 s, TBT 3 ms, CLS 0                                                                                                               |
| Load smoke         | 15/15 checks pass; 0 failed; request-duration p95 8.59 ms                                                                                                                                      |

| Phase 03 validation command                | Local result                                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`           | Exit 0; 10 workspace projects current under Node `24.18.0` and pnpm `11.13.0`                                                                             |
| `pnpm format:check` / `pnpm secret:scan`   | Exit 0; formatting accepted and no credential finding                                                                                                     |
| `pnpm lint` / `pnpm typecheck`             | Exit 0; dependency boundaries and 9/9 strict TypeScript packages pass                                                                                     |
| `pnpm test`                                | Exit 0; 85 files / 663 tests; coverage 74.43% statements, 64.56% branches, 72.38% functions, 77.73% lines                                                 |
| `pnpm db:reset` / `pnpm test:db`           | Exit 0; empty reset through 49 migrations; 21 files / 889 assertions plus the two-connection concurrency proof pass                                       |
| `pnpm db:types` / `pnpm db:types:check`    | Exit 0; generated database types regenerated and current                                                                                                  |
| verification-wrapped `pnpm build`          | Exit 0; optimized Next production build generates 76 route/static entries                                                                                 |
| verification-wrapped `pnpm build:portable` | Exit 0; OpenNext emits the Cloudflare worker                                                                                                              |
| `pnpm test:e2e` / `pnpm test:a11y`         | Exit 0; 29 pass / 19 intentional skips, then 28/28 pass                                                                                                   |
| `pnpm test:lighthouse` / `pnpm test:load`  | Exit 0; Lighthouse assertions pass at 98/100/96/100; k6 15/15 checks, 0 failures, p95 8.59 ms                                                             |
| `pnpm verify`                              | Exit 0 on 2026-07-22 under pinned Node/pnpm; complete aggregate reran every practical local gate above, including an empty database reset and both builds |

GitHub Actions run `29886609843` exposed the original performance fixture's missing registered
device and stale bulk-table statistics: its denial-path plans took 4545.316 ms for the due queue
and 4406.666 ms for Today. A transaction-only diagnostic with a valid registered device showed the
old row-by-row policies were also genuinely slow for authorized data (8616.804 ms Today and
5385.696 ms statistics locally). Migration `13000` retains the authorization semantics while
materializing current-session viewable ID sets once per query; the corrected fixture now proves
all 10,000 rows are visible before recording the passing measurements above.

Raw production build commands correctly rejected the developer-only HTTP values in the ignored
`.env.local`; the verification wrapper supplied deterministic production-valid values without
editing that file.

### Hosted Preview checkpoint

Owner CLI reauthentication restored access to fixed Preview project `cfwddajyjbueggpzfomh`. The
guarded deployment applied the original 14 Phase 03 migrations. Independent verification then
proved all 47 remote migrations matched local history at that checkpoint, the push dry run was
empty, public/private lint had no errors, hosted invariants passed 1/1, the schema diff was clean,
storage checks passed, and linked generated types matched the repository. The matching protected
Preview baseline smoke passed 11/11.

The first deeper disposable SRS acceptance exposed a canonical retry defect: its first review
committed with HTTP 200, but the identical retry returned 403 because
`admin_get_srs_review_context` rejected the already-reviewed session item before the existing
commit RPC could reach its idempotency check. The acceptance cleanup ran and returned `rows: []`,
so no active disposable fixture remained. Beta and Production database promotion were held.

The forward repair adds `20260722000000_srs_review_replay_receipts.sql` plus the separate
`20260722001000_srs_review_replay_volatility.sql` catalog-alignment migration. It computes a hash
over the complete raw review intent, checks an authorized exact-response receipt before mutable
context, and stores the first canonical result through `admin_commit_srs_review_v2`. Both forward
migrations are applied only to Preview. The verifier proves exact 49-migration parity, an empty dry
run, no new lint warning, 1/1 hosted invariants, a clean schema diff, storage checks, and matching
generated types.

Vercel Preview `https://cogniflow-may25qyue-cogniflow-app-3471s-projects.vercel.app` passed the
protected baseline 11/11 in 9.2 seconds. The corrected disposable SRS acceptance then passed 1/1 in
33.4 seconds: first commit, byte-equivalent HTTP duplicate, undo, all four ratings, reload/resume,
statistics, and an independent no-Lumen-cookie private-data isolation probe. Enforced account/
content/Storage cleanup returned `rows: []`, and the complete post-cleanup Preview verifier passed.
Draft PR #12 remains unmerged; Beta Supabase, Vercel Production, and `recallflash.com` were not
modified. `apps/web/.env.local` and all provider secrets remain ignored and untracked.

## Phase 02 product UI redesign

Local branch `codex/phase-02-usability-and-authoring-redesign` contains the acceptance-hardened,
presentation- and interaction-only redesign of the existing Phase 02 surfaces. It began at clean
`origin/main` and is published as one draft pull request after the final aggregate gate. The
changes add no content API or database contract, authentication behavior, appearance persistence
contract, environment variable, RLS policy, hosted database operation, or migration. Phase 03
remains unstarted.

- Replaced the oversized authenticated welcome/dashboard with a responsive workspace shell, a
  256 px wide desktop rail, a focus-trapped mobile drawer, compact learner identity, first-class
  Published navigation, and a viewport-safe Appearance popover. The shell keeps Appearance and
  Sign out reachable at short heights and restores focus after Escape.
- Rebuilt empty and populated Library states around a compact title/greeting, one primary New deck
  action, a single search/filter/folder/view toolbar, optional folder rail, summary counts, and
  responsive deck cards. The former five large metric cards, duplicated primary actions, floating
  card-type action, and oversized empty instructions are gone.
- Reworked deck creation into details and first-card-type steps with a Basic default and grouped
  compact choices. Simplified workspace tabs, quick entry, generated-card rows, history, and
  settings copy while retaining all 17 card types and existing mutations.
- Rebuilt note authoring around a persistent top bar, clear save state, field groups, progressive
  disclosure, and a useful responsive preview. Raw validation paths, schema objects, and internal
  identity/projection terminology are translated into field-level language and short completion
  checklists.
- Replaced raw media inputs with accessible dropzones, progress/cancel/retry states, previews, and
  replace/remove actions. Image occlusion now starts with a bounded upload state rather than a giant
  patterned canvas, disables tools until an image exists, groups mask/view/selection controls with
  SVG icons and tooltips, contains the uploaded image, and synchronizes stage and region-list
  selection while preserving normalized geometry.
- Rebuilt the public player as a focused sans-serif study surface. Its front and back are separate,
  absolutely aligned sibling faces with hidden backfaces; only the preserve-3d inner card rotates.
  The back begins at `rotateY(180deg)`, so answer content itself is never transformed or mirrored.
  Click/tap, Space/Enter, arrows, swipe, nested-interactive exclusion, front reset on navigation,
  and a non-rotating reduced-motion path are covered. Visible Tap/Reveal/Show prompts, duplicated
  flip controls, and the permanent privacy paragraph were removed; privacy semantics remain
  available to assistive technology.
- Rebuilt `/app/published` with search, Public/Unlisted filters, responsive deck cards, direct Open
  player, Copy link confirmation, Manage, and the existing guarded Unpublish mutation. Public deck
  attribution is now a compact details footer.
- Scoped the Phase 02 styles and workspace-only popover bundle to product route segments. Marketing
  pages no longer download product CSS or the Radix popover dependency; Lighthouse returned to the
  established performance budget while product routes retain the local Manrope variable font.

The post-merge acceptance audit additionally closed concrete edge cases found by direct pixel and
interaction inspection:

- Appearance now wins pointer hit testing above the focus-trapped mobile workspace drawer; the
  first Escape explicitly closes that inner popover, preserves the drawer, and restores its trigger
  focus. The Library rail, cards, primary action, media actions, editor top bar, and long centralized
  brand names remain contained at 320×568 and 200% text.
- All card types now receive friendly, control-associated validation. Diagram group renames persist
  without losing focus, unsafe custom-card CSS marks the scoped-CSS field, visual-region errors map
  to the exact region controls, and raw paths/codes never render.
- Media selection validates supported base MIME types and the 10 MB limit before upload, accepts
  codec-qualified browser recordings, sanitizes server errors, survives hashing failure, and
  supports real attach/remove state. Image description is represented once, not by duplicate
  controls.
- Local signed image/audio URLs are allowed by CSP only in development; production CSP remains
  restricted. Image occlusion now proves a loaded 640×360 image and visible selected mask rather
  than passing on a blank stage.
- The public player scopes keyboard and swipe behavior to the card, ignores nested interactive
  controls, requires horizontal swipe intent, restores the front face on navigation, and exposes
  owner-only Manage, authenticated Workspace, or anonymous Sign in actions. Copy confirmation is
  transient and stale-safe.
- Layout, authoring, and accessibility scenarios provision isolated, already-onboarded local
  accounts through the existing service-only test boundary, then authenticate through the real
  sign-in UI. The dedicated smoke test still exercises public signup and onboarding, so the
  provider's deliberately low email allowance and the configured product limit remain intact.
- The deck Overview now uses one semantic, responsive totals strip with deliberate number/label
  spacing. The oversized Card-type mix panel is removed; the summary remains four columns on wide
  screens and a compact two-by-two grid on tablet and mobile without horizontal overflow.

Private, ignored screenshots were captured and directly inspected at actual pixels for empty and
populated Library, dark/serious and mobile Library, the editor, image occlusion before/after upload,
the isolated stage with a selected mask, public player front/back, public mobile, and dark reduced
motion. The in-app browser backend was unavailable, so repository Playwright produced the real
browser pixels and the local image viewer was used for direct visual QA. No personal screenshot or
generated browser artifact is tracked.
Responsive inspection covers 1920×1080, 1536×1024, 1440×900, 1366×700, 1280×800, 1024×768,
768×1024, 430×932, 390×844, 360×800, and 320×568, plus a 125% zoom equivalent, 200% text,
light/dark themes, serious mode, reduced motion, keyboard-only interaction, and short-height rails.

| Redesign validation command           | Local result                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`      | Exit 0; lockfile accepted unchanged                                                     |
| `pnpm format:check`                   | Exit 0                                                                                  |
| `pnpm secret:scan`                    | Exit 0; no credential finding                                                           |
| `pnpm lint` / `pnpm typecheck`        | Exit 0; lint/dependency boundaries and 8/8 strict TypeScript projects pass              |
| `pnpm test`                           | Exit 0; 76 files / 617 tests pass                                                       |
| Coverage                              | 80.52% statements, 70.00% branches, 81.77% functions, and 84.20% lines                  |
| `pnpm db:reset` / `pnpm test:db`      | Exit 0; unchanged 33-migration chain resets and 19 files / 795 assertions pass          |
| `pnpm db:types:check`                 | Exit 0; generated database types remain current                                         |
| verification-wrapped production build | Exit 0; optimized Next build generates 60 route/static entries                          |
| verification-wrapped portable build   | Exit 0; OpenNext emits the portable worker                                              |
| `pnpm test:e2e`                       | Exit 0; 25 pass and 17 intentional cross-project skips                                  |
| `pnpm test:a11y`                      | Exit 0; 28/28 axe, theme, motion, focus, drawer, and authenticated keyboard checks pass |
| `pnpm test:lighthouse`                | Exit 0; scores 99/100/96/100; FCP 0.759 s, LCP 2.179 s, TBT 20 ms, and CLS 0            |
| `pnpm test:load`                      | Exit 0; 15/15 checks, 3/3 requests, 0% failures, and request-duration p95 9.89 ms       |
| `pnpm verify`                         | Exit 0; complete aggregate gate passed on the documented redesign tree                  |

No new setup step or environment variable is required. The later-owner constraints below are
unchanged: Phase 03 owns scheduling/review state, Phase 04 owns grading and persistent study, and
later phases own offline sync, imports, collaboration, discovery, and games.

The branch Preview URL and guarded hosted smoke result will be recorded after the single draft pull
request is open. Local work has not touched Preview, Beta, or Production Supabase, and no hosted
data has been created during this redesign audit.

## Phase 02 complete and Preview-verified

The active branch is `codex/phase-02-content-editor-card-types`, created from the freshly fetched
`origin/main`. The complete post-audit tree passes the required local acceptance gate through
migration `11000`, including the aggregate verifier, production builds, database tests, browser
acceptance, accessibility, Lighthouse, and load checks. The same committed migration chain is
deployed only to Preview, and the final branch deployment passed both the guarded hosted baseline
and the disposable content acceptance with verified minimization. Beta and Production were not
changed, the branch was not merged, and Phase 03 was not started.

### Implemented and locally accepted branch scope

- Added framework-independent runtime schemas and authoring/study contracts for all 17 required
  card kinds: basic, basic reversed, optional reversed, bidirectional, custom multi-field, typed
  answer, cloze, image occlusion, multiple choice, select all, true/false, ordering, list answer,
  diagram, audio prompt, pronunciation, and drawing.
- Added deterministic semantic generation keys, forward/reverse/group/hotspot sibling generation,
  stable-ID reconciliation/reactivation, obsolete-card deactivation, and typed generation-conflict
  results. Scheduling state is deliberately absent.
- Added ProseMirror-compatible rich-document v2 validation/sanitization/migration, safe link/video
  protocols, structured image/audio/math/code/table/callout/citation nodes, extracted plain text,
  and output-encoded rendering.
- Added a bounded AST template DSL with escaped fields, front-side inclusion, conditionals, list
  iteration, approved helpers, safe static markup, and scoped allowlisted CSS. Arbitrary JavaScript,
  raw interpolation, event handlers, untrusted iframes/network URLs, prototype traversal, and
  global CSS escape are rejected. Frozen custom publications match only exact DSL field-reference
  positions, so an unused field named after a helper or block keyword cannot enter the public
  projection.
- Added normalized rectangle/ellipse/polygon geometry, image occlusion and diagram hotspot editor
  contracts, keyboard region lists/numeric controls, labels/aliases/alt text, grouped generation,
  pointer/touch drawing with undo/redo/clear, and required nonvisual typed fallbacks.
- Added additive content migrations for folders, decks/members, tags, note types/fields/templates,
  notes/fields, generated cards, every specialized card table, sources, media/references,
  immutable note revisions/deck versions, scheduling-neutral content impacts, frozen publication
  rows, system note types, RLS/policy helpers, actor-derived RPCs, and idempotency receipts. The API
  maps a new note's null creation marker to database expected version `0` and, when it has no note ID
  yet, the RPC derives one from the required idempotency key so exact create retries retain one
  stable identity. Null/stale versions cannot bypass concurrency. Typed version conflicts use a
  user-exception SQLSTATE rather than a serialization failure, preventing infrastructure retry
  loops while preserving actionable expected/actual detail. Receipt lookup serializes concurrent
  account/key retries and rechecks current resource permission before replay, while the browser has
  only the definition-aware atomic note/media mutation surface.
- Closed the custom-schema transaction gap with a definition-aware note command. A custom
  field/template definition is validated against the authoring payload, reused by canonical hash
  when unchanged, or copied on write when edited; it commits or rolls back with the complete
  note/card/source/tag/media/revision/version graph. The older composed note/media wrapper is no
  longer browser-callable.
- Made the exact explicit media-reference graph part of schema-two immutable deck versions. Restore
  recreates that graph atomically (with a deterministic, payload-proven reconstruction for legacy
  schema-one snapshots), rejects cross-deck note identity collisions without changing either deck,
  and preserves exact reference counts/deletion fences. The direct RPC independently validates
  embedded-media kind and graph shape, source owners alone may duplicate media-bearing decks, and
  frozen card/deck projections either replace every attached internal media ID with a public ID or
  fail closed and withdraw an inconsistent legacy publication.
- Added a canonical-payload client mutation ledger for deck, folder, note, bulk, settings, and
  duplicate commands. Exact network/retryable retries retain one UUID; success, a definitive
  rejection, or payload change rotates it. Typed API errors preserve current-version conflict
  detail and recovery controls reload actual server state.
- Added a private migration-owned `lumen-content-media` bucket, server/client SHA-256 checks,
  magic-byte and declared/detected MIME verification, image dimensions, per-asset/account quotas,
  content-addressed owner deduplication, owner-UUID-free opaque object paths, signed previews,
  server-route-only object mutation, and delayed deletion driven by explicit plus
  cover/audio/pronunciation/drawing usage. Extended the due account-deletion boundary to withdraw
  publications, redact/minimize authoring data and history, clear receipts, and make owned media
  immediately eligible for cleanup. Added a portable one-batch worker plus service-only bounded
  claim/complete leases, exact Storage removal, retry on every reported provider error, durable
  backoff, and locator tombstoning. No recurring worker schedule is deployed by this branch.
- Replaced the old authenticated welcome with the query-backed `/app` folder/deck library;
  `/app/library` is an intentional redirect. Added creation, search/filter/grid/list, deck overview,
  rich note editor, quick/bulk entry, note/card browser, settings/lifecycle, version history/restore
  with readable side-by-side card-type/prompt/answer/source/tag differences, generated sibling
  preview, conflict recovery, and truthful empty/loading/error states. Settings plus
  publish/unpublish now use one atomic transaction.
- Added frozen public/unlisted deck projection pages at `/deck/[slug]` and
  `/embed/deck/[publicId]`, keyboard card preview with no persistent progress, frozen theme
  variants, creator attribution, license/card-type summary, safe return-aware sign-in, and unlisted
  `noindex` metadata.
- Changed Auth/onboarding fallback to `/app`, retained validated public/protected returns, and
  rejects Auth/API/onboarding lifecycle loops plus encoded/open-redirect hazards.
- Preserved a confirmed password-signup continuation without weakening the age boundary. Only
  after successful password authentication may an incomplete identity exchange the still-valid
  signed password-signup decision bound to its exact normalized email for the separate
  account-bound onboarding gate. A raw Auth identity without either valid gate is still signed out,
  rejected, and minimized.
- Fixed explicit account appearance persistence. A fresh pending/confirmed complete-tuple write
  survives stale protected renders, retries after reconnect, synchronizes tabs, and expires or
  yields to the active learner projection on rejection. Managed contexts cannot save guardian
  appearance, OS reduced motion stays authoritative, and identity-boundary cleanup isolates shared
  devices.

The detailed implementation contract is [CONTENT_AUTHORING.md](./CONTENT_AUTHORING.md), the exact
schema mapping is [DATA_MODEL.md](./DATA_MODEL.md), and security boundaries are in
[SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md).

### Phase 02 migrations

| Migration                                                        | Purpose                                                                                                                                                                                                                                                                                                                     | Verification state   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `20260716000000_content_schema.sql`                              | Content/media/publication enums, tables, constraints, indexes, 17 system note types/templates, RLS enablement, and default-deny grants                                                                                                                                                                                      | Reset and pgTAP pass |
| `20260716001000_content_authorization_and_rpcs.sql`              | Folder/tag cycle guards, content permissions/RLS, version/idempotency mutations, revisions/generation/restore, private media bucket/policies, frozen publication/public RPCs, and due-account-deletion content cleanup                                                                                                      | Reset and pgTAP pass |
| `20260716002000_content_integration_hardening.sql`               | Atomic note/media graph, bulk operations, real library counts, actor-scoped media reads, derived public card/media IDs, field filtering, and service-only Storage locations                                                                                                                                                 | Reset and pgTAP pass |
| `20260716003000_content_rpc_parameter_names.sql`                 | Named PostgREST parameters for archive, restore, and delete lifecycle RPCs                                                                                                                                                                                                                                                  | Reset and pgTAP pass |
| `20260716004000_content_guarded_read_volatility.sql`             | Writable transaction classification for guarded read RPCs whose shared session proof takes a row lock                                                                                                                                                                                                                       | Reset and pgTAP pass |
| `20260716005000_content_security_audit_hardening.sql`            | Serialized/reauthorized replay, strict expected versions, atomic-only browser note/media writes, the historical pending-only Storage policy later superseded by `08000`, embedded-media counts, and orphan cleanup                                                                                                          | Reset and pgTAP pass |
| `20260716006000_content_note_create_identity.sql`                | Stable new-note identity derived from the required idempotency key before the underlying upsert implementation                                                                                                                                                                                                              | Reset and pgTAP pass |
| `20260716007000_content_conflict_sqlstate.sql`                   | Typed optimistic conflicts raised as non-serialization user exceptions so stale commands fail promptly without automatic transaction retry                                                                                                                                                                                  | Reset and pgTAP pass |
| `20260716008000_content_atomic_authoring_and_media_deletion.sql` | Atomic custom-definition/note/media and settings/publication writes; exact safe-template publication field matching; server-route-only Storage mutation; durable physical-media jobs; 24-hour pending cleanup; irreversible old-asset job fencing; fresh-path same-hash re-upload; service-only claim/complete/abandon RPCs | Reset and pgTAP pass |
| `20260716009000_content_receipt_payload_binding.sql`             | Exact canonical-command fingerprints for legacy browser content and media-registration receipts; transaction-local pending state; same-key changed-payload and pre-binding fail-closed replay                                                                                                                               | Reset and pgTAP pass |
| `20260716010000_content_version_media_graph.sql`                 | Schema-two immutable version snapshots and exact media-graph restore; deterministic legacy reconstruction; direct-RPC media validation; owner-only media-safe duplication; internal-media-ID removal from frozen card and deck projections; exact same-command version finalization                                         | Reset and pgTAP pass |
| `20260716011000_content_function_volatility.sql`                 | Hosted-catalog-safe `STABLE` classification for public-payload filtering, public-card ID derivation, and embedded-media graph collection helpers                                                                                                                                                                            | Reset and pgTAP pass |

All twelve Phase 02 migrations are also applied and independently verified in the fixed Preview
project. Preview has the exact 33-file local history through `11000`, an empty push dry run, no
`public` or `private` lint findings, a passing hosted invariant, empty schema drift, and current
generated types.

Earlier applied migrations remain unchanged. `supabase/seed.sql` still inserts no product user,
deck, card, publication, or media object. Generated database types were regenerated from the
complete local schema and the deterministic drift check passes.

Phase 02 adds no new web-application credential. The media worker reuses the target Supabase URL
and server-only secret and accepts optional `MEDIA_DELETION_BATCH_SIZE` and
`MEDIA_DELETION_LEASE_SECONDS` bounds; the repository does not deploy its schedule. Local setup
requires applying the full migration chain; the private content bucket and policies are
migration-owned. The guarded hosted-content runner captures the existing Preview project server
key in memory through an authenticated operator CLI and never writes it to application
configuration. Hosted setup must use the guarded Preview database promotion after the migrations
are committed and locally accepted. That promotion completed through the repository guard; no
dashboard-created bucket, Beta promotion, or Production environment change was made.

### Phase 02 validation evidence

Final local acceptance completed on 2026-07-17 UTC under pinned Node `24.18.0`, pnpm `11.13.0`,
local Docker/Supabase, Chromium, and k6 `2.1.0`. The aggregate verifier exited successfully on the
settled implementation tree. Final hosted evidence is from commit `af2d818` at
`https://cogniflow-emqndkvn7-cogniflow-app-3471s-projects.vercel.app` (deployment
`dpl_JC1wg64ZwKh5W1ZNSy2MSTAtrD36`). Browser evidence is automated Playwright acceptance; no manual
visual-inspection claim is made.

| Command                                             | Final local result                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                    | Exit 0; 9 workspace projects already current                                        |
| `pnpm format:check`                                 | Exit 0; every matched file uses Prettier style                                      |
| `pnpm secret:scan`                                  | Exit 0; no secretlint findings                                                      |
| `pnpm lint`                                         | Exit 0; ESLint has zero warnings and dependency boundaries pass                     |
| `pnpm typecheck`                                    | Exit 0; 8/8 workspace projects pass strict TypeScript                               |
| `pnpm test`                                         | Exit 0; 76 files and 583 tests pass                                                 |
| Coverage                                            | 80.01% statements, 68.82% branches, 80.72% functions, and 83.75% lines              |
| `pnpm db:reset`                                     | Exit 0; all 33 migrations and the product-data-empty seed apply from scratch        |
| `pnpm test:db`                                      | Exit 0; 19 pgTAP files and 795 assertions pass                                      |
| `pnpm db:types` / `pnpm db:types:check`             | Exit 0; generated schema types are deterministic and current                        |
| Supabase lint                                       | Exit 0; no `public` or `private` schema warnings                                    |
| `pnpm build` / `pnpm build:portable`                | Exit 0; 59 Next route/static-generation entries and OpenNext worker bundle complete |
| `pnpm test:e2e`                                     | Exit 0; 24 pass and 15 intentional project skips                                    |
| `pnpm test:a11y`                                    | Exit 0; 27 axe, keyboard, motion, theme, and authoring checks pass                  |
| `pnpm test:lighthouse`                              | Exit 0; scores 98/100/96/100, LCP 2312.06 ms, CLS 0, and TBT 4 ms                   |
| `pnpm test:load`                                    | Exit 0; 15/15 checks, 3/3 requests, 0 failures, and p95 7.39 ms                     |
| `pnpm verify`                                       | Exit 0 on the complete post-audit tree                                              |
| `pnpm db:deploy:preview` / `pnpm db:verify:preview` | Exit 0; exact 33 migrations, lint/invariant/Storage/diff/types all pass             |
| `pnpm test:hosted:preview`                          | Exit 0; 11/11 final-head Preview baseline cases pass                                |
| `pnpm test:hosted:preview:content`                  | Exit 0; 1/1 full content path plus verified Auth/publication/Storage cleanup passes |

### Phase 02 known later owners

- **Scheduling and edit impact:** Phase 03 adds learner card schedules, FSRS/SM-2, review logs,
  sibling burying, and the UI that applies stored preserve/relearn/reset choices. Phase 02 stores
  impact only and never silently mutates future schedules.
- **Grading/study:** Phase 04 owns typed/list/choice grading, adaptive Learn, and persistent practice
  state. Phase 02 preview and renderer contracts do not claim grading or progress.
- **Offline/conflicts:** Phase 05 owns Dexie, the content outbox, media retry after offline use, and
  field-aware merge. Phase 02 supplies idempotency, optimistic versions, tombstones, and explicit
  conflict recovery but does not claim offline sync.
- **Import/export:** Phase 06 owns file adapters and portability; the 17 card definitions expose
  stable import keys but no Phase 02 importer is claimed.
- **Sharing/discovery/collaboration:** Phase 07 owns passwords, specific-user/class permissions,
  forks, Yjs collaboration, discovery ranking, creator biographies, comments/ratings, and
  moderation. Phase 02 supports only private/public/unlisted authoring and frozen read-only preview.
- **Media operations:** `pnpm worker:media-deletions` implements bounded physical removal for
  elapsed, zero-use assets, including never-linked uploads, the transition to zero explicit or
  cover/audio/pronunciation/drawing usages, and media made immediately eligible by account
  deletion. The owner must still deploy, schedule, monitor, and alert this one-batch worker in each
  hosted environment. Uploaded video remains disabled. Pronunciation and drawing remain explicit
  self-review with no cloud speech upload or automatic drawing judgment.

There is no Phase 03 implementation in this branch.

## Completed Phase 01 landing and public-surface UI polish

- Started from a clean `main` exactly matching freshly fetched `origin/main`, then created only
  `codex/phase-01-landing-ui-polish` for this task.
- Replaced the competing public `.site-container` and utility-only page-width conventions with one
  exported `PageContainer` primitive. Its reading, content, site, and wide variants share bounded
  widths, centered placement, responsive pixel gutters that remain stable during text enlargement,
  and safe-area-aware inline padding. `PageShell` now composes the same primitive.
- Moved the visible “Product principles” heading inside the same site-width container as its grid.
  The defect existed because the heading sat outside the old container and depended on an `sr-only`
  utility that was absent from the public route stylesheet, so it rendered as a full-width box at
  the viewport origin.
- Removed the fixed `20rem` root minimum and hardened grid/flex intrinsic sizing, heading and button
  wrapping, Auth/join cards, policy/not-found layouts, illustration containment, footer targets,
  and safe-area padding. This prevents long labels and 200% text from forcing document-level
  horizontal scroll.
- Rebalanced the editorial hero with a bounded fluid reading-font scale, a three-line ordinary
  desktop target, shorter vertical rhythm, a contained responsive illustration, and aligned
  actions. Header, hero, principle heading/grid, foundation content, and footer now share the same
  content edges.
- Added a compact navigation disclosure without removing destinations or Appearance controls. It
  supports keyboard activation, Escape closure, focus restoration, 44 px controls, long-label
  wrapping, and nested Appearance Escape behavior.
- Corrected the landing, header/footer, join, Auth entry/status, public policy/safety/copyright,
  onboarding, privacy-setting, error, global-error, and not-found copy. Public wording now describes
  secure account access, learner-profile boundaries, privacy controls, and room-code checking
  without internal phase language or claims that decks, study modes, AI, imports, or live games are
  available.
- Kept visible branding sourced from `brandConfig`. The configured and visible name remains
  **Lumen**, while the public domain is `recallflash.com` and provider/repository identifiers retain
  the historical `cogniflow` name. No undocumented rename was made.
- Added semantic/component assertions for the contained principle heading and heading hierarchy;
  computed-layout Playwright coverage for the exact responsive matrix, shared edges, hero wrapping,
  illustration/actions, practical target sizes, 125% zoom, 200% text, long translated labels, every
  public/Auth route, and compact-navigation keyboard behavior; and expanded axe coverage for all
  Auth status pages, light/dark themes, serious mode, reduced motion, visible focus, and open mobile
  navigation.

Local responsive acceptance passed at 1920×1080, 1536×1024, 1440×900, 1280×800, 1024×768,
768×1024, 430×932, 390×844, 360×800, and 320×568. Light and dark themes, serious mode,
operating-system reduced motion, 100% layout, a 125% browser-zoom equivalent, 200% text enlargement,
long translated-style navigation labels, keyboard-only traversal, and mobile Escape/focus
restoration also passed. Final visual inspection covered the 1920×1080 and full 1440px light
landing pages plus the full 390px dark serious-mode landing page.

| Command                                                  | Result                                                                                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                      | Exit 0 after formatting the changed source, tests, and documentation                                                                                                               |
| `pnpm secret:scan`                                       | Exit 0; no credential finding                                                                                                                                                      |
| `pnpm lint`                                              | Exit 0; ESLint and dependency boundaries pass                                                                                                                                      |
| `pnpm typecheck`                                         | Exit 0; 7/7 strict TypeScript projects pass                                                                                                                                        |
| `pnpm test`                                              | Exit 0; 47 files / 265 tests pass; statements `84.62%`, branches `68.12%`, functions `77.65%`, lines `85.97%`                                                                      |
| `pnpm db:reset` / `pnpm test:db` / `pnpm db:types:check` | Exit 0; the empty 21-migration chain resets, 10 files / 362 pgTAP assertions pass, and generated types remain current                                                              |
| `pnpm build:verify`                                      | Exit 0; the deterministic optimized Next.js production build generates 53 routes                                                                                                   |
| verification-wrapped `pnpm build:portable`               | Exit 0; OpenNext/Cloudflare emits `.open-next/worker.js`. A direct developer-environment attempt correctly rejected its HTTP application origin before this deterministic run      |
| `pnpm test:e2e`                                          | Exit 0; 22 Playwright checks pass and 14 intentional cross-project repetitions skip                                                                                                |
| `pnpm test:a11y`                                         | Exit 0; 26/26 route, theme, motion, focus, keyboard, and axe checks pass with no serious/critical violations                                                                       |
| `pnpm test:lighthouse`                                   | Exit 0; performance `99`, accessibility `100`, best practices `96`, SEO `100`; FCP `0.757 s`, LCP `2.162 s`, TBT `2.5 ms`, CLS `0`, 189,870 bytes / 13 requests                    |
| `pnpm test:load`                                         | Exit 0; 15/15 k6 checks, 3/3 requests, `0%` failures, request-duration p95 `5.7 ms` against `<1000 ms`                                                                             |
| `pnpm verify`                                            | Exit 0 under pinned Node `24.18.0` and pnpm `11.13.0`; the aggregate reran formatting, secrets, lint, types, unit/DB checks, type drift, both builds, E2E, axe, Lighthouse, and k6 |
| `pnpm test:hosted:preview --url <PR Preview>`            | Blocked before application assertions: Vercel Deployment Protection redirected anonymous automation to its login page because `VERCEL_AUTOMATION_BYPASS_SECRET` was not present    |

Commit `a0d99c3` reached Vercel `READY` at the PR Preview URL
`https://cogniflow-git-codex-phase-0-12dd39-cogniflow-app-3471s-projects.vercel.app`. The GitHub
integration exposes that stable PR alias and the Vercel deployment record, but not the immutable
generated hostname to an unauthenticated operator. The guarded hosted suite was attempted against
the PR URL and confirmed the remaining blocker is Deployment Protection, not an application
failure: the landing, health, Auth, and redirect checks received Vercel's login surface. The run was
stopped after four such failures rather than repeating the same credential failure six more times.
Complete the 10-check hosted smoke by supplying the existing project-scoped bypass credential only
as the transient `VERCEL_AUTOMATION_BYPASS_SECRET` process value; do not weaken protection or store
the secret in this repository.

This task changed no authentication or email behavior, Supabase Auth setting, migration, RLS policy,
hosted database, hosted environment variable, SMTP/domain configuration, or provider secret. The
ignored `apps/web/.env.local` was not inspected, edited, staged, or tracked. No Phase 02 product work
was started.

## Completed custom-domain and hosted-auth finalization

- Started from a clean local `main` exactly matching freshly fetched `origin/main`, then created
  only `codex/custom-domain-finalization`. The ignored local `apps/web/.env.local` was not read,
  changed, staged, or tracked.
- Confirmed `NEXT_PUBLIC_APP_URL` is the repository's authoritative application-origin variable.
  Updated only its Vercel Production assignment to `https://recallflash.com`; Preview still omits
  the variable and derives each deployment origin from Vercel metadata.
- Deployed Production successfully to generated deployment
  `https://cogniflow-mns48tw69-cogniflow-app-3471s-projects.vercel.app`, which reached `READY` and
  was aliased to the custom apex. `www.recallflash.com` and `cogniflow-pearl.vercel.app` both return
  path- and query-preserving `308` redirects to the apex, so neither is a second canonical origin.
- Updated only Beta Supabase Auth to Site URL `https://recallflash.com` and callbacks
  `https://recallflash.com/auth/callback**` plus the temporary path-limited
  `https://cogniflow-pearl.vercel.app/auth/callback**` rollback entry. Preview's Site URL and
  restricted wildcard remained unchanged, and local callbacks remain in `supabase/config.toml`.
- Re-read both hosted Auth configurations after cutover. Email confirmation remains required;
  anonymous Auth and Google, GitHub, and Azure/Microsoft remain disabled. Confirmation, email
  change, invite, magic-link, and recovery templates still use `{{ .ConfirmationURL }}` rather
  than directly substituting `{{ .RedirectTo }}`.
- Verified password signup, magic link, recovery, OAuth, and provider-link redirects share the
  configured-origin callback builder; safe returns remain relative-only. Production smoke verifies
  the apex canonical URL, host-only secure recovery cookie, callback/recovery fail-closed behavior,
  same-origin mutation acceptance, and rejection of the retired Production origin.
- Confirmed Vercel Protection Bypass for Automation remains configured and successfully exercised
  it against protected Preview without writing or printing the credential. Repository workflows do
  not run hosted smoke, so no GitHub Actions secret was added.
- Kept Preview connected to Preview Supabase and Production connected to Beta Supabase. No local
  Supabase value was copied to Vercel. Search indexing, managed-child profiles, public child
  content, free-text chat, direct messaging, parental-consent activation, cloud AI, and optional
  OAuth all remain disabled. Phase 02 was not started.

The temporary old-host Beta callback remains for rollback because custom SMTP and delivered
confirmation, magic-link, and recovery exercises are still owner-gated. Remove it only after those
checks and the rollback window close; its redirecting hostname is not a canonical application
origin in the meantime.

## Completed hosted infrastructure bootstrap (historical baseline)

- Applied the complete additive Phase 00/01 chain through `20260715006900_hosted_grant_parity.sql` to the separate Preview (`cfwddajyjbueggpzfomh`) and Beta (`qccbaynfvtyxigiikpmq`) Supabase projects. Both remote histories exactly match all 21 committed migrations.
- Added guarded Preview/Beta migration deploy and verification commands. They inspect history, dry-run before changes, never seed/reset/repair/config-push, automatically unlink, and require Beta promotion from a clean `main` exactly matching freshly fetched `origin/main`.
- Added read-only hosted invariants for table inventory, RLS, policy/grant/function/schema/view/storage/publication boundaries, plus database lint, empty-storage, schema-diff, and generated-type parity checks. Both hosted projects pass the complete verifier.
- Created exactly one Vercel Next.js project, `cogniflow`, connected to `cogniflow-app/CogniFlow` with Production branch `main`, Root Directory `apps/web`, Node `24.x`, pnpm `11.13.0`, the frozen monorepo install command, the filtered web build command, and default `.next` output.
- Configured Vercel Preview with the Preview Supabase project and Production with the Beta project. Each scope has its own Supabase server key and independently generated encryption, guest-signing, and Server Action keys; optional OAuth, SMTP, consent-provider, AI, analytics, monitoring, and direct-database settings remain absent or disabled.
- Initially deployed and verified Preview at `https://cogniflow-5x77sm1wj-cogniflow-app-3471s-projects.vercel.app` and Production at the former stable `https://cogniflow-pearl.vercel.app` alias (generated deployment `https://cogniflow-91ytfxf2d-cogniflow-app-3471s-projects.vercel.app`). That bootstrap evidence passed the then-current 9/9 controlled smoke checks and is superseded by the custom-domain evidence above.
- Configured Preview and Beta Supabase Auth with email confirmation required, environment-specific Site URLs, and minimal `/auth/callback**` redirect entries. Hosted Google, GitHub, Microsoft, and anonymous-user providers remain disabled. Email templates retain provider-managed `ConfirmationURL` behavior; custom SMTP and live email delivery remain provider-gated.
- Verified both hosted databases contain zero Auth users, zero public identity/product rows, and zero storage buckets after testing. The neutral recovery check creates only the expected bounded private rate-limit record with a server-HMACed subject; it stores neither the reserved test address nor personal information. No fixture identity, child identity, or test content was created.
- Kept both beta and Preview site-wide `noindex, nofollow`. Managed child profiles, child public publishing, unrestricted free-text game chat, direct messages, parental-consent activation, and cloud AI remain disabled. Phase 02 was not started.

## Completed Phase 01 scope

- Added real Supabase email/password signup and sign-in, conditional Google/GitHub/Microsoft OAuth initiation, manual provider linking, magic-link sign-in, email confirmation callbacks, forgot/reset password, neutral expired-link handling, current-device sign-out, password-gated all-device sign-out, SSR cookie refresh, and independently authorized protected routes.
- Bound eligible teen/adult signup decisions to short-lived signed callback state. New callback identities without valid age authority are signed out and minimized through a service-only rejection transaction. Final onboarding exchanges an account-, Auth-session-, and payload-bound one-time proof instead of trusting the request age band.
- Bound password recovery to a separate pending cookie, callback nonce, normalized-email HMAC, expiry, and safe return path before issuing the account-bound password-update capability. Query-only or mismatched recovery intent fails closed.
- Implemented minimum-data onboarding for display name, handle, locale, IANA time zone, study-day start, age band, learning goals, theme, motion, reading, and serious-mode preferences. Under-13 selection never starts an independent account flow.
- Added account profiles, overlapping `learn`/`create`/`host`/`teach` capabilities, self/child/school-managed learner identities, explicit access roles, guardian relationships, append-only consent/revocation, privacy preferences, registered devices, learner-profile sessions, export/deletion workflow state, append-only audit facts, guest sessions, and fixed-window rate-limit buckets.
- Implemented local/test guardian-managed learner creation with a closed privacy-safe payload, one-time consent-verifier proof, no child email, cost-12 PIN/family-code credentials, rate limiting, secure profile switch, active-profile indicator, bounded lock timeout, guardian exit, credential rotation, learner preferences, consent revocation, device revocation, and selected learner-session revocation.
- Added school-managed identity foundations that require a separate service-issued school authorization. Creation is minor-only and reconstructs an exact seven-key minimized settings document after strict validation.
- Added browser identity-boundary isolation. Successful sign-out, deletion, guardian exit, and profile change clear the applicable app cookies or learner/private browser stores; a successful profile switch always replaces the guardian document even if storage cleanup is unavailable.
- Implemented profile, security, connected-provider, devices/sessions, learner, guardian/consent, privacy preference, export request, deletion request, and grace-period cancellation settings with real stored state and reauthentication for high-risk operations.
- Added a server-only public viewer projection. Anonymous account actions preserve only an allowlisted same-origin public return path; authenticated viewers get the workspace action; Auth outages degrade to an anonymous public shell.
- Added ephemeral guest identity foundations with a strict room-adapter interface, safe generated/custom nicknames, HMAC-pseudonymized rate-limit subjects, hashed reconnect tokens, bounded expiry, reconnect, service-only purge, and a test-only room fixture. The production adapter intentionally contains no joinable rooms.
- Enforced production HTTPS and the managed-identity launch gate. Every production runtime forces child profiles, public child content, free-text game chat, and parental-consent mode off; Vercel/provider markers remain additional hard stops.
- Preserved the Phase 00 monorepo, design system, environment validation, provider portability, test harnesses, foundation migration, and deployment profiles. No deck/card, scheduling, mastery, class, or game product schema from Phase 02 or later was started.

## Security and authorization boundaries

- Every exposed Phase 01 table has RLS. Browser roles have no direct insert/update/delete table policies; narrow authenticated `current_*` RPCs derive the actor, bind the JWT `session_id` to a live application device, hold the managed-session lock, authorize the target, and mutate atomically.
- Reusable helpers and proof ledgers remain in the non-exposed `private` schema. Security-definer entry points use an empty `search_path`, schema-qualified objects, exact signature grants, bounded input, idempotency, and audit facts.
- The service role has narrow RPC execution and deliberately has no general identity-table read grant. Actor-selecting implementation RPCs are not browser-callable.
- Profile-session, guest reconnect, onboarding, child-creation, school-authorization, and reauthentication bearer values are stored only as fixed-length digests. PINs and new family codes use independent bcrypt hashes.
- Consent and audit records reject update/delete. Account deletion is a compensating, idempotent worker transaction that removes Auth/session/credential state and minimizes identity while preserving required append-only evidence.
- Mutation routes enforce origin/CSRF checks, bounded JSON, shared strict Zod schemas, neutral errors, server/database authorization, and separate database-backed rate-limit buckets.

## Database migrations

Phase 00's applied `20260714000000_foundation.sql` remains unchanged. Phase 01 adds the following migrations in order:

| Migration                                                            | Purpose                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `20260715000000_identity_privacy_schema.sql`                         | Identity/privacy enums, tables, indexes, constraints, RLS enablement, triggers, and Auth provisioning hook                      |
| `20260715001000_identity_privacy_functions.sql`                      | Provisioning, authorization, profile session, guest, consent, privacy job, device, rate-limit, and audit transaction boundaries |
| `20260715002000_identity_privacy_hardening.sql`                      | Grant, policy, credential, consent, and audit hardening                                                                         |
| `20260715002500_managed_learner_session_boundary.sql`                | Managed-mode account isolation and live session checks                                                                          |
| `20260715002700_managed_session_idempotency.sql`                     | Exact profile-session idempotency and replay behavior                                                                           |
| `20260715002800_learner_credential_hardening.sql`                    | bcrypt PIN/family-code rotation and committed attempt throttling                                                                |
| `20260715002900_profile_session_transaction_hardening.sql`           | Auth-session/device binding, concurrency, expiry, and active-session limits                                                     |
| `20260715003000_school_authorization.sql`                            | One-time school authorization proof and observer projection foundations                                                         |
| `20260715004000_account_deletion_path.sql`                           | Idempotent due-deletion worker, Auth erasure, and identity minimization                                                         |
| `20260715005000_authorization_audit_hardening.sql`                   | Cross-actor idempotency, target consistency, and audit/consent immutability                                                     |
| `20260715006000_atomic_self_context.sql`                             | JWT-session-bound self-context authorization wrapper                                                                            |
| `20260715006100_guardian_exit_context.sql`                           | Password/proof-gated guardian exit from managed mode                                                                            |
| `20260715006200_sign_out_device_revocation.sql`                      | Current/all application-device revocation cascades                                                                              |
| `20260715006300_runtime_session_boundaries.sql`                      | Narrow authentication-profile/device service RPCs and runtime session checks                                                    |
| `20260715006400_child_creation_and_global_signout_authorization.sql` | Child payload proof ledger/consumer and reauthenticated global sign-out                                                         |
| `20260715006500_onboarding_and_learner_settings_authorization.sql`   | Onboarding proof consumption, provisional rejection, and explicit learner settings mutation                                     |
| `20260715006600_child_payload_validation_hardening.sql`              | Closed child consent/settings schema and JSON-null fail-closed checks                                                           |
| `20260715006700_school_managed_payload_hardening.sql`                | Minor-only school creation with exact minimized settings reconstruction                                                         |
| `20260715006800_profile_session_revocation_boundary.sql`             | Self-context, password/proof-gated revocation of one owned learner session                                                      |
| `20260715006900_hosted_grant_parity.sql`                             | Revocation of hosted platform default service-role table/sequence privileges to preserve the RPC-only boundary                  |

`supabase/seed.sql` remains deterministic and inserts no product data. Generated types in `packages/database/src/generated/database.ts` come from the complete local schema and are not hand-edited.

## Test and validation evidence

The local database suites add 351 database/RLS assertions to the 11 preserved Phase 00 assertions, for 362 total across ten SQL files. They cover schema/grant/index/hosted invariants; idempotent provisioning; anonymous, owner, unrelated user, guardian, revoked guardian, teacher-observer, managed learner, expired/revoked session, guest, tampered learner, and service paths; proof consumption; payload validation; credential/session concurrency; privacy/deletion state; and append-only audit/consent behavior.

| Command                                                    | Result                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                           | Exit 0; all eight workspace projects were already up to date and the lockfile was accepted unchanged                                                                                                                               |
| `pnpm format:check`                                        | Exit 0; final repository source, configuration, tests, SQL, and documentation are formatted                                                                                                                                        |
| `pnpm secret:scan`                                         | Exit 0; no credential finding                                                                                                                                                                                                      |
| `pnpm lint`                                                | Exit 0; ESLint has no warning/error and dependency boundaries pass                                                                                                                                                                 |
| `pnpm typecheck`                                           | Exit 0; 7/7 workspace projects pass strict TypeScript                                                                                                                                                                              |
| `pnpm test`                                                | Exit 0; 47 files / 259 tests pass. Coverage: statements `84.59%`, branches `68.08%`, functions `77.57%`, lines `85.94%`                                                                                                            |
| `pnpm db:reset`                                            | Exit 0; database recreated from empty, all 21 migrations through `069` applied, and the seed inserted no application data                                                                                                          |
| `pnpm test:db`                                             | Exit 0; 10 files / 362 assertions pass (`Result: PASS`)                                                                                                                                                                            |
| `pnpm db:types`                                            | Exit 0; generated and formatted from the complete local schema                                                                                                                                                                     |
| `pnpm db:types:check`                                      | Exit 0; committed generated types match the fresh local schema                                                                                                                                                                     |
| `pnpm build:verify` / aggregate `pnpm build`               | Exit 0; optimized Next production build generated 53 routes with the deterministic production environment                                                                                                                          |
| `pnpm build:portable`                                      | Exit 0; OpenNext/Cloudflare produced `.open-next/worker.js`; this verifies the artifact, not a live deployment                                                                                                                     |
| `pnpm test:e2e`                                            | Exit 0; 17 Playwright tests passed across desktop, mobile, and reduced-motion projects; 4 broader-project repetitions were intentionally skipped                                                                                   |
| `pnpm test:a11y`                                           | Exit 0; 18/18 checks passed with no serious/critical axe violations plus working keyboard/skip-link focus and dark-theme coverage                                                                                                  |
| `pnpm test:lighthouse`                                     | Exit 0; scores performance `99`, accessibility `100`, best practices `96`, SEO `100`; FCP `0.758 s`, LCP `2.161 s`, TBT `3 ms`, CLS `0`, `179,369` bytes / 12 requests                                                             |
| `pnpm test:load`                                           | Exit 0; 15/15 k6 checks, 3/3 requests, `0%` failures, request-duration p95 `8.6 ms` against `<1000 ms`                                                                                                                             |
| `pnpm db:verify:preview` / `pnpm db:verify:beta`           | Exit 0 for each hosted target; 21/21 history parity, empty dry run, database lint, hosted invariants, empty Storage, accepted platform-only schema diff, and generated-type parity pass                                            |
| `pnpm test:hosted:preview` / `pnpm test:hosted:production` | Exit 0 for each deployment; the expanded 10/10 controlled hosted Playwright checks pass on protected Preview and the custom Production apex                                                                                        |
| `pnpm verify`                                              | Exit 0 under the pinned Node `24.18.0` and pnpm `11.13.0`; the aggregate reran formatting, secrets, lint, types, unit coverage, empty reset, pgTAP, generated types, standard/portable builds, Playwright, axe, Lighthouse, and k6 |

Targeted tests additionally cover auth callback/recovery state, route payloads, production cookie security, public return normalization, browser profile-switch cleanup failure, selected session revocation, child settings, sign-out/provider failure boundaries, and deterministic test-origin isolation under the production-shaped verification environment. The Next middleware deprecation notice is expected: ADR-0016 retains Edge middleware because the pinned OpenNext adapter does not support the Node-only proxy replacement, and both production builds pass.

## Configuration and owner setup

- `.env.example` is the canonical public/server variable inventory. The local `apps/web/.env.local` remains ignored and is not reproduced in source, docs, test output, or this record.
- Hosted Supabase now has separate Preview/Beta projects, exact Site/redirect URLs, required email confirmation, matching application flags, and verified schema/policy parity. Custom SMTP, a verified sender, live email delivery, and any future template customization remain owner-gated.
- Google, GitHub, and Microsoft (`azure`) OAuth adapters and conditional UI are implemented. The owner must create provider applications, store credentials in Supabase/provider settings, review scopes/account types, enable manual identity linking when desired, and only then enable each application flag.
- The external parental-consent verifier adapter is implemented with pseudonymous subject HMAC, HTTPS/timeout/response-size/evidence validation, but is not live-verified because no owner provider or credential was supplied. It cannot activate managed profiles in production while ADR-0015 is active.
- Vercel Preview and the custom-domain Production beta are live-verified. OpenNext/Cloudflare remains a build-only portability target. Future hosted migration promotion, secret rotation, and provider configuration remain owner-authorized operations governed by the hosted runbook.
- The owner must deploy and monitor a deletion-job scheduler/worker before accepting production deletion requests. The service-only due-job transaction is implemented and locally database-tested; repository verification does not run an external scheduler.

## Known constraints and later owners

- **Production managed learners:** disabled until a later security phase implements an independent opaque backend-for-frontend child identity, a superseding ADR, live consent verification, provider/data review, parent notices, retention/incident procedures, and legal approval. Local/test guardian and child paths remain complete for boundary verification.
- **Export assembly:** Phase 06 owns archive creation, expiring download delivery, and full portability. Phase 01 provides real request/job state and status, without claiming that a queued job is a downloadable archive.
- **School integration/classes:** Phase 08 owns a reviewed school evidence adapter, class membership, and assignment-scoped reporting. Phase 01 provides only the proof-gated school identity and observer authorization foundation.
- **Games:** Phase 09 owns game tables, production room admission, participants, realtime events, reports, and deployed guest cleanup; Phase 10 owns advanced games and persistent progression. Phase 01's production room adapter remains intentionally empty so no UI can fake a join.
- **Public deck content (historical Phase 01 handoff):** Phase 02 now owns deck/card authoring and
  frozen public/unlisted preview; Phase 07 still owns passwords, user/class sharing, discovery,
  creator profiles, forks, collaboration, ratings/comments, and moderation.
- **Operations:** deployment smoke tests are implemented and live-verified. Scheduled guest/audit retention, deletion-worker execution, live email/provider monitoring, backup/restore exercises, and alerting still require owner-operated infrastructure documented in [HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).

There is no blocker to custom-domain finalization. Closing the old-host callback rollback window,
custom SMTP/live email delivery, backup/restore exercises, production worker schedules,
monitoring/alerting, and public launch/legal review remain genuine owner actions or launch gates;
none is represented as live-verified.

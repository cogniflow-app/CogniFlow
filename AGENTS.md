# AGENTS.md — Project Lumen

## Mission

Build an original, production-oriented web platform that combines:

1. Anki-grade notes, generated cards, FSRS scheduling, review history, and advanced card types.
2. A premium Quizlet-style study experience with flashcards, adaptive Learn, written recall, tests, matching, diagrams, audio, and flexible grading.
3. A modular Quizizz/Wayground-, Gimkit-, and Blooket-inspired game platform with solo, asynchronous, and realtime multiplayer modes.

Do not copy another product’s branding, illustrations, exact layouts, proprietary assets, or source code. Translate useful interaction patterns into an original design system.

The temporary app name is **Lumen**. Read visible branding from centralized configuration and environment variables; never scatter the name through components.

## Read before every task

Read, in this order:

1. this file;
2. `docs/PRODUCT_BLUEPRINT.md`;
3. `docs/ARCHITECTURE_DECISIONS.md`;
4. `docs/IMPLEMENTATION_STATUS.md`;
5. the current phase prompt.

If a document does not exist yet, the bootstrap phase must create it.

## Operating rules

- Inspect the repository before changing it.
- Implement the requested phase; do not merely write a plan.
- Do not start later phases unless required to build a clean dependency boundary.
- Resolve ordinary ambiguity using the blueprint defaults. Do not block on cosmetic questions.
- Preserve existing working behavior.
- Never edit or reorder an applied migration. Add a new migration.
- Never delete user data to make a migration easier.
- Do not expose Supabase secret/service credentials, AI keys, signing keys, or OAuth secrets to client bundles.
- Treat every Server Action, Route Handler, RPC, WebSocket/Broadcast event, import file, and rich-text document as untrusted input.
- Validate external inputs with shared runtime schemas.
- Authorize every mutation at the server or database boundary, even when the UI hides a control.
- Enable RLS on every exposed table and test the policy matrix.
- Keep review logs, game score ledgers, XP/currency ledgers, and consent records append-only or compensating-event based where specified.
- Do not allow practice games, lucky multiple-choice answers, speed bonuses, or power-ups to silently mutate canonical FSRS state.
- Do not permit arbitrary user JavaScript in card templates.
- Do not add unrestricted child chat, direct messages, child public biographies, or child global leaderboards.
- Do not enable under-13 profiles on a Vercel deployment.
- Do not scrape Quizlet or other services, automate third-party logins, or bypass access controls. Import only user-provided authorized exports, pasted text, files, or documented APIs.
- Avoid paid-only dependencies in the critical path.
- Prefer maintained, open-source libraries over custom infrastructure, but wrap high-coupling dependencies behind project interfaces.
- Use UTC in storage, IANA time zones for display/study-day boundaries, and client-generated idempotency IDs for offline-capable events.
- Use strict TypeScript. Avoid `any`; when unavoidable at a boundary, narrow it immediately.
- Use accessible semantic HTML first. Custom widgets must implement keyboard and screen-reader behavior.
- Respect `prefers-reduced-motion` and provide a serious/low-stimulation study mode.
- No placeholder buttons, dead navigation, fake success toasts, or “coming soon” screens for in-scope features.
- No production TODOs for the active phase. A deferred item must be recorded in `docs/IMPLEMENTATION_STATUS.md` with rationale and a later owning phase.

## Canonical stack

Use the latest mutually compatible stable releases selected during bootstrap, then pin them in the lockfile and do not perform opportunistic upgrades mid-project.

- pnpm workspaces and Turborepo
- Next.js App Router with strict TypeScript
- React Server Components by default; Client Components only for interaction/browser APIs
- Tailwind CSS and accessible Radix/shadcn-style primitives, customized into an original system
- Motion for polished transitions
- Supabase Postgres, Auth, Storage, Realtime Broadcast/Presence, local CLI, and RLS
- `ts-fsrs` behind `packages/srs`
- Tiptap/ProseMirror JSON for rich content, with strict sanitization
- Zod for runtime schemas
- React Hook Form for complex forms
- TanStack Query only for client-owned cached workflows
- Dexie/IndexedDB for offline data and outbox synchronization
- Yjs over authorized Supabase Broadcast for collaborative rich-text editing
- Vitest, Testing Library, fast-check, Playwright, axe, pgTAP or equivalent SQL tests, and k6 scripts
- Optional Canvas/Phaser/Pixi-style renderer only behind the game-renderer interface
- Optional AI providers behind `packages/ai`; core study must work without them

## Repository shape

Target structure:

```text
apps/
  web/
  worker/                 # portable background-job runner when needed
packages/
  ai/
  auth/
  config/
  database/
  domain/
  game-engine/
  grading/
  import-export/
  learning-engine/
  offline/
  realtime/
  srs/
  test-utils/
  ui/
supabase/
  migrations/
  seed.sql
  functions/
docs/
  PRODUCT_BLUEPRINT.md
  ARCHITECTURE_DECISIONS.md
  DATA_MODEL.md
  EVENT_PROTOCOLS.md
  SECURITY_AND_PRIVACY.md
  SETUP.md
  IMPLEMENTATION_STATUS.md
```

Do not create empty packages. Create a package only when the current phase gives it a real API, tests, and consumers.

## Engineering conventions

- Domain logic is framework-independent and tested in packages.
- UI components do not query Supabase directly. Route/server/domain data access goes through typed repositories or services.
- Client Supabase access is permitted for authorized Realtime, Storage uploads, and narrowly scoped offline sync, but schemas and authorization remain centralized.
- Database mutations that must be atomic use Postgres functions/RPCs with explicit `search_path`, input validation, authorization, and tests.
- Use UUIDv7 or ULID-style sortable client IDs where practical; otherwise UUID.
- Monetary-like game currency uses integer ledgers, never floating point.
- Durations are integer milliseconds; intervals are integer days/minutes as defined by the scheduler.
- Every query used by an RLS policy has supporting indexes.
- Public database views must be `security_invoker` or isolated from exposed schemas.
- Security-definer functions live in a non-exposed schema, set an empty/explicit search path, and receive minimal grants.
- Rich content is stored as versioned JSON plus extracted plain text for search. Never trust stored HTML.
- Use content hashes for duplicate detection and media deduplication.
- Keep game mode logic deterministic with a seeded PRNG so sessions can be replayed in tests.
- Separate academic accuracy, mastery, SRS state, game score, XP, and currency.

## Required commands

Bootstrap must define stable root commands with these names:

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm test:e2e
pnpm test:a11y
pnpm test:load
pnpm verify
```

`pnpm verify` must run all checks that are practical in CI without external paid credentials.

## End-of-phase protocol

Before reporting completion:

1. inspect the diff for accidental duplication, secrets, dead code, and broken migrations;
2. run formatting/linting, type checking, unit tests, database tests, and relevant E2E tests;
3. run the production build;
4. fix failures instead of merely listing them;
5. update `docs/IMPLEMENTATION_STATUS.md` with:
   - completed scope;
   - migrations;
   - tests and exact results;
   - setup steps or environment variables added;
   - known constraints owned by later phases;
6. provide a concise completion report with changed areas and commands run.

When a credential is unavailable, implement the adapter, validation, deterministic mock, tests, and setup documentation. Report the integration as “implemented but not live-verified,” not as fully verified.

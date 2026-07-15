# Phase 12 — Full integration, defect repair, security/privacy audit, visual polish, load validation, and launch handoff

This is the final implementation phase, not a documentation-only review. Read every repository instruction and blueprint document, inspect the entire codebase and migration history, then make whatever in-scope fixes are necessary to produce one coherent application. Do not stop after listing gaps. Do not mark a feature complete because a page, schema, or test name exists. Exercise real behavior with automated browser/database tests and repair defects until the required verification passes.

The owner does not intend to manually validate each earlier phase. Therefore this phase must re-test representative and boundary workflows across every subsystem, including cross-phase interactions that isolated tests may have missed. It still cannot replace real user acceptance, current provider/legal review, or production monitoring; document those launch gates honestly.

## Objective

Turn the accumulated phases into a release-candidate free beta that is:

- functionally coherent;
- premium and original in visual quality;
- secure by default;
- privacy-supporting;
- accessible;
- resilient offline and in Realtime failure;
- provider-portable;
- usable without paid services or AI;
- fully migratable from an empty local Supabase project;
- covered by meaningful automated tests;
- documented so the owner can configure and deploy it.

Fix defects, incomplete paths, dead controls, duplicate abstractions, schema drift, inaccessible interactions, broken mobile layouts, unsafe authorization, and misleading setup claims. Only external-credential behavior that genuinely cannot be exercised may remain “implemented but not live-verified,” with deterministic mocks and an exact owner verification step.

## 1. Establish the audit baseline

Before editing:

1. read `AGENTS.md`, `docs/PRODUCT_BLUEPRINT.md`, architecture decisions, data model, security/privacy, event protocols, setup, and implementation status;
2. inventory workspace packages, routes, migrations, RLS policies, RPCs/functions, storage buckets, workers, scheduled jobs, feature flags, environment variables, and tests;
3. run the existing root verification commands and capture failures;
4. search for incomplete markers and suspicious patterns;
5. create/update `docs/FINAL_AUDIT_WORKLIST.md` as an internal working artifact with requirement, evidence, status, and fix reference;
6. implement the fixes in priority order: data loss/security, broken core flows, cross-phase correctness, accessibility, performance, visual polish, documentation.

Search at minimum for:

```text
TODO
FIXME
HACK
XXX
coming soon
not implemented
placeholder
mock data
demo only
throw new Error
console.log
console.error
as any
@ts-ignore
eslint-disable
service_role
SUPABASE_SERVICE_ROLE
NEXT_PUBLIC_.*SECRET
setTimeout used as fake completion
href="#"
disabled buttons without reason
hard-coded localhost
hard-coded brand name
unbounded select(*)
unsafe innerHTML
```

Do not blindly remove legitimate test fixtures or diagnostic code. Classify each finding and fix active-phase production problems. No fake success toast, dead navigation, empty handler, placeholder report, or stub game/AI provider may be counted as complete.

## 2. Requirement traceability and feature inventory

Create `docs/REQUIREMENTS_TRACEABILITY.md` mapping every major blueprint requirement to:

- implementation locations;
- database/migration/RLS support;
- automated tests;
- route or user workflow;
- feature flag/deployment restrictions;
- status: verified, implemented-not-live-verified, intentionally gated, or blocked;
- any honest remaining launch dependency.

Trace at least:

- account/auth/profile/child/guardian/teacher/guest identity;
- public deck preview;
- deck/note/note-type/template/card model;
- every required card type;
- editor/media/template capabilities;
- FSRS and legacy SM-2 import compatibility;
- review controls/history/statistics;
- adaptive Learn and grading;
- every study mode;
- offline PWA/sync/conflicts;
- import/export formats;
- sharing/permissions/forks/version history/collaboration;
- discovery/moderation/copyright;
- classes/assignments/accommodations/reports;
- realtime game room features;
- every initial and advanced game mode;
- progression/gamification;
- deterministic/local/cloud AI and tutor gates;
- free-tier quotas and graceful degradation;
- accessibility/performance/security/privacy/operations.

A traceability row needs executable evidence, not a self-referential claim in implementation status.

## 3. Repository and dependency consolidation

Inspect for architectural erosion across phases:

- duplicate domain types;
- multiple competing Supabase clients;
- UI components querying tables directly against conventions;
- duplicated grading/scoring/permission logic;
- circular dependencies;
- browser imports of server-only code;
- provider-specific APIs leaking into domain packages;
- inconsistent IDs/time zones/durations;
- stale feature flags;
- unpinned or conflicting dependency versions;
- unused heavy packages;
- renderer/ML code in core bundles;
- generated database types out of sync;
- migrations and TypeScript enums disagreeing.

Refactor conservatively to one canonical interface per concern. Preserve behavior and migration history. Remove dead code/dependencies/assets only after confirming no runtime/test consumer. Keep strict TypeScript and package-boundary lint rules.

Run dependency and license checks available without paid services. Flag incompatible/unknown asset or package licenses in `docs/THIRD_PARTY_NOTICES.md`; replace questionable dependencies/assets where practical.

## 4. Clean-database and migration verification

Prove database reproducibility:

1. reset a local Supabase project from zero using the committed migrations;
2. generate current database types;
3. apply seed data designed for development/test only;
4. run all SQL/RLS tests;
5. exercise core application flows;
6. test representative upgrade migration from a snapshot of an earlier phase/schema if fixtures exist;
7. verify repeated local reset/seed is deterministic;
8. verify production seed paths cannot create default credentials or public demo data.

Audit every migration/table/view/function/trigger:

- RLS enabled where exposed;
- no owner-bypass assumption in ordinary app paths;
- grants minimal;
- `security_invoker`/`security_definer` chosen intentionally;
- security-definer functions use explicit/empty `search_path` and minimal execute grants;
- authorization occurs before mutation;
- foreign keys and deletion behavior match privacy/data-retention policy;
- constraints enforce state invariants;
- indexes support RLS and common queries;
- unique/idempotency constraints exist;
- append-only ledgers/logs resist update/delete by ordinary clients;
- event and schedule timestamps use consistent types;
- public views expose only published safe projections;
- no secret/token stored raw when a hash suffices;
- storage ownership/path policies match metadata;
- cleanup/archive functions cannot cross tenant boundaries;
- large log tables have documented partition/archive path even if not enabled for the free beta.

Use `EXPLAIN` on representative large-deck, due-review, search, report, leaderboard, game-event, and RLS queries. Add indexes or query changes based on evidence, not guesswork.

## 5. Authorization and RLS adversarial matrix

Build/complete automated tests using distinct real auth contexts for:

- unauthenticated public viewer;
- signed-in account owner;
- active learner profile;
- alternate learner profile under same account;
- guardian;
- teacher/instructor;
- class assistant;
- class learner;
- deck owner/manager/editor/suggester/viewer/study-only/host;
- share-link viewer;
- collaborator from another account;
- blocked user;
- suspended/restricted user/content;
- realtime participant;
- spectator;
- ephemeral guest;
- room host/co-host;
- worker/service role only where intended.

Attempt forbidden reads and writes directly, not only through hidden UI:

- private decks/notes/media;
- another learner’s schedule/review/mastery/practice data;
- guardian or consent metadata;
- class roster/report outside scope;
- draft/unpublished versions;
- collaborator role escalation;
- public projection bypass;
- search indexing of private content;
- share-link enumeration/reuse/expiry bypass;
- restore/version/fork without permission;
- game hidden answers/teams/events/reports;
- direct score, XP, currency, inventory, achievement, and leaderboard mutation;
- AI jobs/drafts/source chunks from another tenant;
- storage path traversal/cross-owner access;
- RPC calls with forged IDs;
- inactive/deleted/expired identities.

Every expected denial must be asserted at the database/server boundary. Fix inconsistent policy helpers and add supporting indexes.

## 6. End-to-end persona journeys

Create deterministic development fixtures with no real personal information and run Playwright projects/contexts across desktop and mobile breakpoints. Use real local Supabase auth/database/storage/Realtime behavior where practical—not route mocks for the primary acceptance path.

### 6.1 Public visitor

Verify:

- home/pricing/about/privacy/terms/help routes render;
- browse/search public decks;
- public creator profile obeys visibility;
- open a public deck and use permitted read-only flashcard preview without login;
- no private schedule/mastery data is created/exposed;
- login wall appears only for restricted features and preserves intended return route;
- unlisted/noindex/password/revoked content behavior;
- responsive, keyboard, reduced-motion, and metadata/SEO behavior.

### 6.2 New account and personal learner

Verify:

- sign up/sign in/sign out/session refresh/password or magic-link flows as configured;
- username/profile/time zone/study-day setup;
- create/import deck;
- create custom note type and fields/templates;
- create/edit every card type and media type supported;
- preview front/back/responsive template;
- generate sibling cards correctly;
- study flashcards, Review, Learn, Write, Test, Match, Spell/pronunciation, Diagram, and custom session;
- offline review/edit then reconnect/sync;
- undo review/edit;
- view statistics/history;
- export data/deck;
- share/fork/version/restore;
- delete and recover where policy permits;
- account export/deletion workflow.

### 6.3 Creator/collaborator

Verify:

- invite every supported role;
- concurrent edit and conflict behavior;
- suggestions/comments under social policy;
- version snapshot/diff/restore;
- independent and linked fork;
- upstream update offer and merge/conflict;
- attribution/license/lineage preservation;
- publish/unpublish;
- discovery/search/rating/favorite/follow/report/block;
- moderation/copyright lifecycle with authorized roles;
- private schedules remain private among collaborators.

### 6.4 Instructor and learner

Verify:

- create/join/archive class;
- role and roster changes;
- assignment for each compatible study/test/game type;
- stable content snapshot;
- scheduling semantics;
- start/resume/offline/submit/late/extension/retake/excuse;
- accommodations alter behavior without public label or progression penalty;
- manual grading/regrade audit;
- learner/guardian/instructor views;
- reports/filters/charts/table alternatives/CSV/print;
- no access to unrelated private history.

### 6.5 Realtime game host, players, guests, teams, spectator

Use multiple browser contexts and verify:

- create/configure room;
- join code/link/QR preview;
- guest nickname/safe name/anonymous identity;
- capacity/approval/lock;
- teams/spectator/late join;
- host/co-host controls;
- curated reactions and rate limits;
- same-question and individualized flows;
- answer adjudication, score, streak, power-ups;
- pause/resume;
- refresh/reconnect/network interruption/duplicate submission;
- host disconnect takeover/grace behavior;
- kick/ban;
- results/rematch/missed-card study;
- reports/assignment integration;
- no FSRS mutation from game actions;
- serious/reduced-motion and accessibility alternatives.

Run a representative E2E for every initial and advanced mode; deeper reducer/property tests cover permutations.

### 6.6 Progression

Verify:

- meaningful activity awards XP exactly once;
- idle/open app does not count;
- daily streak thresholds/time zones/DST;
- achievements and quests;
- earned currency/catalog/inventory/equip/refund;
- campaign/challenge progression;
- leaderboards/privacy/opt-out;
- season opt-in/end snapshot;
- accommodations do not reduce opportunity;
- child/public restrictions;
- no purchase/ads/pay-to-win surface exists.

### 6.7 AI-disabled and AI-enabled mock

Verify first with every AI flag/credential absent:

- editor, grading, source import, study, games, and exports still work;
- UI explains optional features without broken controls.

Then use deterministic local/mock provider:

- source extraction from representative text/PDF/DOCX/PPTX and supported image fixture;
- chunk/source references;
- card generation draft/review/accept/undo;
- editor assist/diff;
- semantic grading/uncertainty/override;
- quota/cancel/retry/provider failure;
- child cloud denial;
- adult-approved job;
- grounded tutor citations/insufficient-source/no SRS mutation.

External providers remain implemented-but-not-live-verified unless actual test credentials are available and safe to use.

## 7. Card/editor completeness audit

Create an automated fixture gallery and E2E coverage for:

- basic;
- reversed;
- optional reversed;
- typed answer;
- cloze with multiple cloze groups/hints;
- image occlusion;
- multiple choice;
- multi-select;
- true/false;
- ordering;
- list answer;
- diagram label;
- audio prompt/answer;
- pronunciation/recording;
- drawing/handwritten answer;
- custom multi-field/template-generated siblings.

Verify editor support:

- Markdown shortcuts and rich text;
- headings/lists/quotes/links;
- tables;
- KaTeX/LaTeX;
- syntax-highlighted code;
- images/crop/annotation/alt text;
- audio upload/record/playback/transcript metadata;
- video URL/embed policy and disabled upload default;
- TTS;
- hints/extra/source fields;
- tags/nested tags;
- custom fields;
- sanitized HTML/scoped CSS/templates;
- no arbitrary JavaScript;
- paste/sanitize/undo/redo/autosave/version/conflict;
- keyboard and mobile editing;
- media deduplication/orphan cleanup;
- material-edit schedule policy prompt/rules.

Test malicious rich text, SVG/HTML/CSS, URL schemes, oversized media, broken media, and template escape attempts. Validate rendering in public, editor preview, study, export, and game contexts.

## 8. SRS correctness and historical integrity

Audit `packages/srs`, schema, RPCs, offline replay, imports, UI, and reports. Use deterministic/reference fixtures and property tests for:

- New/Learning/Review/Relearning transitions;
- Again/Hard/Good/Easy;
- learning/relearning steps;
- desired retention;
- maximum interval;
- fuzz with deterministic test control;
- due calculation;
- study-day cutoff/time zone/DST;
- new/review limits/order;
- deck preset inheritance;
- sibling bury;
- manual bury/suspend/unsuspend;
- leech threshold/actions;
- filtered/custom study/cram semantics;
- reschedule/forget/set due;
- preview interval equals committed schedule;
- undo/rollback and compensating log;
- duplicate/offline/out-of-order review events;
- multi-device conflict;
- FSRS parameter optimization if implemented;
- SM-2/legacy ease import preservation;
- import/export round-trip;
- card/note deletion/history retention policy;
- review statistics reconstruction.

Confirm practice/game/multiple-choice luck/speed/power-ups do not silently change canonical schedule. Qualified Learn written recall follows the documented explicit policy. Verify every schedule mutation writes an immutable/auditable log and can be explained in the UI.

Do not claim bit-for-bit Anki compatibility unless the fixtures prove that limited claim. Document supported import/scheduling fidelity precisely.

## 9. Offline, PWA, and synchronization failure audit

Test supported browsers/device sizes and simulate:

- first install and repeat load;
- service-worker update;
- offline dashboard/study availability;
- offline deck edit;
- offline SRS review;
- offline practice/assignment;
- queued media metadata where supported;
- reconnect and outbox drain;
- duplicate delivery;
- server rejection/authorization change;
- content edit conflict;
- deleted deck/card while offline;
- same item edited on two devices;
- quota/storage exhaustion;
- corrupted IndexedDB/migration failure;
- log out/account switch clears protected local data;
- private cache isolation;
- no secret responses cached;
- public versus authenticated caching;
- stale app version/protocol mismatch.

Ensure sync status, conflict UI, retries, and recoverable export are clear. Never discard an offline review or edit silently. Ensure service worker does not cache auth callback, sensitive API, hidden answers, or private HTML indiscriminately.

## 10. Import/export round-trip matrix

Create sanitized fixtures and automated round trips for:

- CSV;
- TSV;
- Quizlet-style pasted term/definition text;
- Markdown;
- project JSON/archive;
- Anki `.apkg`;
- Anki `.colpkg` where supported;
- media;
- note types/templates;
- cloze/reverse/custom fields;
- scheduling/review logs where supported;
- printable cards/reports;
- complete account export.

Verify:

- encoding/BOM/newlines/quoted delimiters;
- field mapping preview;
- duplicate handling;
- dry run;
- cancellation/rollback/resume;
- malformed/hostile ZIP/SQLite/HTML/CSS/script/media;
- unsupported feature report;
- source attribution/licensing metadata;
- no scraping/auth automation;
- content hash/media deduplication;
- export manifest/version/checksums;
- re-import of project export preserves stable semantic state;
- large imports stay within memory/time limits through batching/worker behavior;
- user can always export/delete even near quota limits.

Update the compatibility matrix with measured behavior, not aspirational checkmarks.

## 11. Security audit and repairs

Perform a repository-specific threat review and fix findings. Cover:

### Authentication/session

- redirect allowlists;
- OAuth/magic-link state and callback handling;
- session fixation/refresh/logout;
- anonymous guest privilege boundaries;
- account/profile switching;
- child-profile PIN/passkey rate limiting and safe recovery;
- sensitive reauthentication where appropriate;
- no account enumeration.

### Server Actions/Route Handlers/RPCs

- authenticate and authorize every mutation;
- validate origin/CSRF as appropriate;
- Zod/runtime validation;
- no trusting hidden fields/owner IDs/role claims;
- body/stream size limits;
- timeouts/cancellation;
- idempotency;
- safe error mapping;
- no stack/secrets in client errors.

### XSS/content/template/media

- sanitize stored rich content at output boundary;
- safe URL protocols;
- CSP compatible rendering;
- no `dangerouslySetInnerHTML` without audited sanitizer;
- sandbox external embeds;
- SVG and CSS restrictions;
- no card JavaScript;
- prevent style escape/clickjacking/hidden overlay abuse;
- media type sniffing/path ownership/virus adapter seam;
- image decompression/file bombs;
- signed URL expiration.

### SSRF/import/AI

- private/link-local/metadata/DNS rebinding/redirect checks;
- archive bombs and parser limits;
- no macro/script execution;
- prompt injection treated as data;
- provider payload minimization;
- cloud key server-only;
- output schema/sanitization;
- rate/usage limits.

### Realtime/games

- private authorized channels;
- no answer leakage;
- forged event/sequence/score/host commands rejected;
- reconnect token hash/expiry/rotation;
- join/name/reaction/answer abuse limits;
- participant enumeration prevention;
- snapshot authorization;
- no trust in client clock.

### Platform/security headers

- strict CSP using nonces/hashes where required;
- HSTS in production guidance;
- `frame-ancestors`/embedding policy;
- referrer policy;
- permissions policy;
- MIME sniff protection;
- cross-origin policy chosen intentionally;
- secure/correct cookies;
- source maps/error reporting policy;
- dependency audit and no known critical vulnerabilities without documented mitigation.

Create/update `docs/THREAT_MODEL.md` with assets, actors, trust boundaries, abuse cases, mitigations, residual risk, and verification—not generic boilerplate.

## 12. Privacy, child-safety, and data lifecycle audit

Do not claim legal compliance. Verify that technical controls support the chosen launch policy:

- `ENABLE_CHILD_PROFILES=false` is server-enforced on Vercel profile, not only hidden in UI;
- age-band flow is neutral and minimizes exact birth-date collection;
- under-13 self-registration cannot bypass guardian/school workflow in child-capable local/test profile;
- child email is not required;
- consent record/version/scope/revocation exists;
- guardian can view/export/restrict/delete appropriate child data;
- class authorization and guardian authorization remain distinct;
- child public publishing requires eligible adult approval;
- no child public bio, real-name exposure, direct messaging, unrestricted chat, or global leaderboard;
- generated names and curated reactions work;
- guest data expires/cleans up;
- analytics avoids third-party/private-answer/session-replay collection;
- AI child cloud gate is enforced server-side;
- data export and deletion jobs include all owned tables/storage/search/index/local sync guidance;
- retention jobs for raw game events, guest data, AI jobs, audit data, and deleted accounts are idempotent/auditable;
- blocked/reported/suspended content behavior is consistent;
- copyright workflow preserves records appropriately;
- logs contain no raw secrets, private card answers, child identifiers, auth tokens, or document contents by default.

Create `docs/DATA_INVENTORY_AND_RETENTION.md` listing each data category, purpose, owner/context, storage, access, default retention, deletion/export behavior, provider flow, and launch review notes.

Include an owner-visible child-launch checklist that requires current hosting, auth, storage, email, analytics, AI, consent-verification, privacy-policy, moderation, and legal review. The code must remain gated until that checklist is intentionally completed.

## 13. Accessibility audit and repairs

Target WCAG 2.2 AA as an engineering goal. Run automated and manual-scripted checks over all representative routes and states.

Verify/fix:

- semantic regions/headings/landmarks;
- skip links;
- visible focus and logical order;
- keyboard-only completion of all flows;
- accessible names/descriptions/errors;
- form labels/instructions/autocomplete;
- modals/popovers/menus/focus traps/escape/return focus;
- color contrast;
- color-independent status/team/board cues;
- text resize/zoom/reflow;
- minimum target sizes;
- orientation/responsive behavior;
- reduced motion/no auto-playing disruptive motion;
- pause/skip for animations/time limits where appropriate;
- accessible timers and accommodations;
- screen-reader announcements that are useful but not noisy;
- flash frequency limits;
- captions/transcripts/text alternatives for audio/video;
- image/diagram/occlusion alt workflows;
- drag alternatives for Match/order/boards;
- drawing alternative/manual grading path;
- charts with table/text alternatives;
- Canvas games with equivalent semantic status and controls;
- serious/high-contrast mode;
- errors not conveyed only by toast/color;
- locale/language attributes.

Run axe in Playwright on public, auth, dashboard, editor, every study-mode family, collaboration, class/report, lobby/game/results, progression, AI, settings, and error/offline routes. Fix violations; document only genuinely unavoidable third-party exceptions with mitigation.

## 14. Visual design and interaction polish

Conduct a route/state inventory at mobile, tablet, laptop, and wide desktop sizes. Fix inconsistent design from phased implementation.

Unify:

- typography scale/line length;
- spacing/radius/elevation;
- semantic colors and contrast;
- icons/illustrations;
- button/input/menu/dialog/table/card variants;
- loading/skeleton/empty/error/offline/quota states;
- header/sidebar/mobile navigation;
- dashboard hierarchy;
- deck covers and content density;
- editor panels and preview;
- study focus mode;
- game visual language;
- reports/charts;
- progression/cosmetics;
- toasts/notifications;
- motion durations/easing;
- reduced-motion and serious mode.

Requirements:

- premium original identity inspired by excellent study/game UX without copying competitor branding, exact layouts, assets, wording, or trade dress;
- brand name/logo/text sourced centrally;
- no lorem ipsum, stock placeholder avatars, broken images, fake numbers, debug labels, or inconsistent copy;
- no cumulative layout shift from media/font/loading;
- touch-safe responsive controls;
- polished transitions do not block input;
- celebratory effects are brief/skippable;
- game style does not contaminate serious review screens;
- all destructive/irreversible actions have appropriate confirmation/recovery;
- every visible control has real behavior or is removed/gated with an explanatory disabled state.

Use visual-regression screenshots for a curated stable set of routes/states with deterministic data. Review the generated screenshots for clipping, overflow, contrast, z-index, hydration, and responsive errors; update baselines only after confirming correctness.

## 15. Performance and scale validation

Measure and repair performance against blueprint budgets. Test development fixtures representing:

- 10,000-card deck;
- 50,000-card account projection where practical;
- long review history;
- large media list;
- public search/catalog;
- class report;
- leaderboard;
- 40-player room simulation;
- event-heavy advanced game;
- large import/export;
- offline outbox replay.

Audit:

- route bundle sizes;
- initial JS and hydration;
- ML/game renderer dynamic splitting;
- image/font loading;
- server render and API latency;
- N+1 queries;
- pagination/keyset pagination;
- virtualized lists where needed;
- database plans/indexes;
- cache policy and invalidation;
- Realtime message size/rate;
- snapshot frequency;
- browser memory/CPU/battery;
- inactive animation loops;
- worker/job memory/time;
- service-worker cache size;
- local IndexedDB growth;
- import streaming/batching;
- report computation.

Run documented load tests in a safe local/test environment. Do not attack production or exceed provider terms. Record hardware/environment and results in `docs/PERFORMANCE_REPORT.md`.

Use graceful degradation:

- disable nonessential cursor/presence/cosmetic events before critical game events;
- cap/queue imports and AI;
- block new uploads before storage exhaustion while preserving study/export/delete;
- offer solo/asynchronous game fallback;
- paginate/aggregate old logs;
- display actionable quota warnings;
- never promise that free provider quotas support scale-ready targets.

## 16. Reliability, jobs, and failure handling

Audit every asynchronous process:

- media processing/cleanup;
- import/export;
- search indexing;
- collaboration compaction;
- notification generation;
- account export/deletion;
- guest/game event cleanup;
- report projection;
- progression projection/reward;
- AI jobs;
- scheduled challenge/season/assignment transitions.

Verify:

- state machines and legal transitions;
- idempotency;
- leases/claims/heartbeats where needed;
- retries with backoff/jitter;
- poison-job/dead-letter behavior;
- cancellation;
- duplicate workers;
- partial failure recovery;
- observability without private payloads;
- manual retry/admin diagnostics;
- clock/time-zone behavior;
- no reliance on a request remaining open indefinitely;
- local/free development execution path;
- cleanup never deletes referenced or another tenant’s data.

Inject failures in tests at boundaries: DB commit before publish, upload before metadata, worker crash, network timeout, duplicate delivery, provider quota, stale version, authorization revoked mid-job.

## 17. Observability and owner operations

Implement privacy-preserving operational visibility without requiring a paid vendor:

- structured server logs with request/correlation IDs and redaction;
- health/readiness endpoints that reveal no secrets;
- job/queue dashboard for owner/admin;
- usage/quota dashboard for database, storage estimates, Realtime messages/connections estimates, imports, exports, and AI;
- error boundary reporting adapter, disabled without configuration;
- first-party aggregate product events with child/privacy restrictions;
- moderation/admin audit views;
- backup/export reminder for free projects;
- maintenance mode/read-only switches where needed;
- feature-flag diagnostics;
- incident and rollback runbooks.

Create:

- `docs/OPERATIONS_RUNBOOK.md`;
- `docs/INCIDENT_RESPONSE.md`;
- `docs/BACKUP_AND_RESTORE.md`;
- `docs/PROVIDER_MIGRATION.md`;
- `docs/MODERATION_RUNBOOK.md`.

Scripts must support safe dry runs and explicit confirmation for destructive owner actions.

## 18. Deployment profiles and configuration validation

Complete and verify provider-portable configuration.

### Vercel preview / initial 13+ free beta

- server-enforce `ENABLE_CHILD_PROFILES=false`;
- show/require 13+ policy in the registration flow for this profile;
- no child-directed copy/metadata in this deployment profile;
- document Hobby/non-commercial and current provider-term review gate;
- Supabase local/hosted setup;
- environment validation at build/start;
- secure preview/prod separation;
- no service secret exposed;
- migrations run through an intentional owner/CI step, not at every request;
- cron/long-work behavior remains within supported adapter limits or worker path.

### Child-capable production candidate

- keep platform adapter compatible with the selected OpenNext/Cloudflare-style target where implemented;
- no claim of automatic compliance;
- feature remains disabled until the owner completes current provider/legal/consent/moderation review;
- document required environment/storage/realtime/job differences;
- add smoke/build checks for adapter compatibility where practical;
- avoid Vercel-only imports in domain packages.

### Local development

One documented path from clone to running app:

- required tool versions;
- install;
- start local Supabase;
- environment setup from `.env.example`;
- reset/migrate/seed;
- run web/worker;
- demo accounts and safe credentials generated locally only;
- run each test suite;
- optional Realtime/multi-browser testing;
- optional provider setup;
- common troubleshooting.

Validate that missing optional credentials disable only that adapter. Fail fast with an actionable message for missing required values.

## 19. Final automated verification command

Make `pnpm verify` the authoritative local/CI command and ensure it runs, in a reliable order:

- formatting check;
- lint;
- strict typecheck;
- package-boundary checks;
- unit/property tests;
- database migration/RLS tests;
- integration tests;
- accessibility tests practical in CI;
- production build;
- import/export fixture checks;
- security static checks;
- secret scan;
- generated-type/schema drift check.

Keep long multi-browser/load/visual tests as explicit commands and run them in this final phase:

```bash
pnpm test:e2e
pnpm test:a11y
pnpm test:visual
pnpm test:load
pnpm test:security
pnpm test:imports
pnpm test:offline
pnpm test:realtime
pnpm test:ai
```

Add scripts if missing. Avoid flaky sleeps; wait on observable state. Use deterministic clocks, seeds, network controls, and isolated test data. Quarantine nothing merely to obtain green status. Fix or replace flaky tests and record the exact final commands/results.

## 20. Owner setup and launch documentation

Create `docs/OWNER_SETUP_CHECKLIST.md` as a precise, no-assumed-knowledge checklist:

- domain/DNS;
- Git provider/repository;
- local tool versions;
- Supabase organization/projects;
- Auth URLs/providers/email templates;
- migrations/RLS/storage buckets;
- Vercel project/environment/profile guard;
- optional Cloudflare/provider-portable target;
- environment variables, where obtained, required/optional, and secret/public;
- Realtime configuration;
- storage/media limits;
- optional email/error/analytics/AI providers with free-tier caveats;
- scheduled jobs/cleanup;
- backup/export routine;
- admin bootstrap;
- moderation contacts/policies;
- privacy/terms/copyright pages requiring owner/legal review;
- child-feature launch gate;
- smoke test after deploy;
- rollback;
- ongoing quota/security/dependency monitoring.

Never ask the owner to paste secrets into source control or Codex chat. Use platform secret stores and `.env.local` ignored by Git.

Create `docs/LAUNCH_CHECKLIST.md` separating:

- required for private/local testing;
- required for 13+ free beta;
- required before public discovery;
- required before classes;
- required before under-13 use;
- required before cloud AI;
- required before payments/freemium.

Payments remain unimplemented. Document future entitlement/billing seams but do not add a provider, checkout, or pricing promises.

## 21. Final acceptance report

Create `docs/FINAL_ACCEPTANCE_REPORT.md` containing:

- date/commit;
- environment/tool versions;
- high-level architecture;
- implemented feature matrix;
- migration/reset result;
- RLS/adversarial matrix result;
- exact commands and pass counts;
- E2E persona coverage;
- card/study/import/game/AI compatibility matrices;
- accessibility results;
- performance/load results;
- security/privacy findings fixed;
- dependency/license scan;
- deployment smoke/build status;
- external integrations not live-verified;
- intentionally gated features and why;
- remaining launch risks requiring human/provider/legal/user review;
- owner next steps in strict order.

Do not use “fully secure,” “COPPA compliant,” “production proof,” “bug free,” or “exact clone.” Be precise about evidence and remaining uncertainty.

## 22. Completion behavior

Continue repairing and rerunning failed checks until all repository-controlled acceptance criteria pass. Do not ask the owner to manually perform tasks that can be automated locally. When a real external account, DNS record, OAuth consent screen, legal decision, or provider credential is the only blocker:

- finish the adapter and deterministic test coverage;
- add exact setup/smoke instructions;
- mark only that integration “implemented but not live-verified”;
- do not mark unrelated application behavior incomplete.

At the end, return a concise summary with:

- major fixes made;
- final verification command results;
- launch profile status;
- external/manual launch gates;
- direct links/paths to `OWNER_SETUP_CHECKLIST`, `LAUNCH_CHECKLIST`, and `FINAL_ACCEPTANCE_REPORT`.

## Required acceptance criteria

The phase is complete only when:

- every blueprint area has requirement-to-code-to-test traceability;
- the database builds cleanly from zero and migration/RLS tests pass;
- forbidden cross-user/profile/class/deck/game/AI access is denied by tests;
- all required card types/editor capabilities have working fixture journeys;
- FSRS/review history/offline replay/undo/import fidelity pass deterministic tests;
- all study modes are functional and integrated with mastery/SRS rules;
- offline PWA/sync handles duplicates, conflicts, logout, and failures without silent data loss;
- sharing, collaboration, versions, forks, discovery, moderation, classes, assignments, accommodations, and reports pass persona tests;
- guest/realtime rooms, all initial games, all advanced games, reconnect, host controls, reports, and progression work under automated coverage;
- AI-disabled behavior is complete; optional AI paths pass policy/security/mock-provider tests;
- no dead in-scope control, fake completion, production placeholder, or secret leakage remains;
- accessibility checks and representative keyboard/screen-reader/reduced-motion paths pass;
- responsive visual regression and interaction review are repaired;
- performance/load tests meet documented free-beta budgets or the app degrades safely with measured, documented limits;
- security/privacy/data-lifecycle audits have code fixes and evidence;
- `pnpm verify`, full E2E, accessibility, visual, security, import, offline, realtime, AI, and documented load commands pass in the final environment;
- setup, operations, provider migration, incident, backup, moderation, owner, launch, traceability, and acceptance documents are current;
- Vercel child profiles remain server-disabled and the child-capable launch remains an explicit reviewed gate;
- the final report honestly distinguishes verified behavior from external/manual launch dependencies.

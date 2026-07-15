# Project Lumen — Complete Queue-Ready Codex Prompt Pack

This combined file is a convenience copy of every phase prompt. **Do not send the entire file to Codex as one task.** Put `AGENTS.md` and `docs/PRODUCT_BLUEPRINT.md` in the repository, then send one numbered phase at a time in order. Later phases assume the migrations, interfaces, tests, and documentation created by earlier phases.

The owner does not need to manually test after every phase. Each phase requires Codex to run and repair its automated checks, and Phase 12 re-runs a cross-system release audit. Real user acceptance, provider setup, and legal/privacy review remain launch responsibilities.

---

<!-- BEGIN 00_BOOTSTRAP_AND_FOUNDATION.md -->

# Phase 0 — Bootstrap, architecture foundation, and premium design system

You are operating as the principal engineer for this repository. Read `AGENTS.md` and `docs/PRODUCT_BLUEPRINT.md` in full before editing anything.

## Execution contract

Do not respond with only a plan. Inspect the repository, implement this phase, run the checks, fix failures, and update the project documentation. Do not implement later product phases beyond the minimum interfaces needed to keep the foundation coherent.

If the repository is not empty, preserve unrelated work and adapt the target structure rather than deleting it. If it is empty, initialize it cleanly.

## Objective

Create a robust, provider-portable monorepo and a premium UI foundation that every later phase can safely build on. The result must run locally, build in production mode, have a real test harness, use local Supabase, and provide stable project instructions and architectural records.

## 1. Repository and toolchain

Create or normalize:

- pnpm workspace;
- Turborepo;
- a pinned Node version compatible with all selected packages;
- strict TypeScript shared configs;
- ESLint with import boundaries, React/Next rules, accessibility checks, and no ignored errors;
- Prettier or an equivalent deterministic formatter;
- lockfile;
- `.editorconfig`;
- `.gitignore`;
- `.env.example`;
- root scripts required by `AGENTS.md`;
- dependency update policy documented in an ADR.

Select the latest mutually compatible stable package versions available in the environment, pin them, and record the exact selection in `docs/ARCHITECTURE_DECISIONS.md`. Do not use experimental framework features unless the blueprint requires them and the ADR explains the risk.

Target initial structure:

```text
apps/web
packages/config
packages/ui
packages/domain
packages/database
packages/test-utils
supabase/migrations
supabase/functions
docs
```

Create other packages only when they contain real code required in this phase.

## 2. Next.js application

Build `apps/web` with:

- Next.js App Router;
- strict TypeScript;
- Server Components by default;
- a root error boundary, not-found page, loading pattern, and route-level error handling;
- typed metadata;
- a real public landing page;
- a minimal but real authenticated-shell preview that does not pretend auth already exists;
- a health route returning build/version/runtime information without secrets;
- a developer-only design-system route protected from production indexing;
- responsive navigation that exposes only implemented destinations;
- light, dark, system, reduced-motion, and serious-mode preferences;
- centralized brand configuration using `NEXT_PUBLIC_APP_NAME` with a safe default;
- no hard-coded temporary brand scattered through components.

Do not create fake dashboard statistics or nonfunctional “coming soon” controls. The landing page may explain the product pillars, but action buttons must lead to implemented destinations such as sign-in placeholder information or the design-system route only when appropriate.

## 3. Design system

Build an original component foundation using Tailwind and accessible Radix/shadcn-style primitives. Customize it; do not ship the default demo appearance.

Create:

- semantic color, spacing, typography, radius, shadow, motion, and z-index tokens;
- light and dark themes;
- premium page shells;
- Button, IconButton, LinkButton;
- Input, Textarea, Select, Checkbox, Radio, Switch;
- FormField with descriptions and accessible errors;
- Dialog, Sheet, Popover, Tooltip, Dropdown, ContextMenu;
- Tabs, SegmentedControl, Accordion;
- Card, Surface, Badge, Avatar, Progress, Skeleton;
- Toast/notification system;
- EmptyState, ErrorState, PermissionState, OfflineBanner, SyncIndicator;
- Data table primitives suitable for reports;
- keyboard shortcut hint;
- visually hidden and live-region helpers;
- a card-flip primitive with a non-motion fallback;
- a timer/progress primitive that does not rely on color alone;
- game-ready score/streak primitives without implementing a game.

Every component must have:

- TypeScript types;
- keyboard behavior;
- focus states;
- disabled/loading/error states where relevant;
- reduced-motion behavior;
- stories or a component gallery;
- tests for critical interaction and accessibility.

Use real text and representative fixtures in stories, not lorem ipsum.

## 4. Fonts and assets

Use a privacy-respecting approach that does not make runtime calls to a third-party font CDN. Prefer a maintained package or build-time self-hosted font mechanism. Provide a strong system-font fallback.

Create original simple SVG marks/placeholders for the temporary brand and empty states. Do not download or copy competitor assets. Keep the brand module replaceable.

## 5. Environment and runtime configuration

Create a typed environment module that distinguishes:

- public browser variables;
- server-only variables;
- test defaults;
- local Supabase values;
- Vercel beta deployment;
- portable/Cloudflare deployment.

At minimum support:

```text
NEXT_PUBLIC_APP_NAME
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
DATABASE_URL
DEPLOYMENT_PROFILE
ENABLE_CHILD_PROFILES
ENABLE_PUBLIC_CHILD_CONTENT
ENABLE_FREE_TEXT_GAME_CHAT
APP_ENCRYPTION_KEY
GUEST_TOKEN_SIGNING_KEY
```

Rules:

- fail fast on missing production-required variables;
- never import server-only environment modules into Client Components;
- provide safe test/local defaults only where appropriate;
- enforce `ENABLE_CHILD_PROFILES=false` when `DEPLOYMENT_PROFILE=vercel_beta`, even if an environment variable attempts to enable it;
- expose a typed `capabilities` object to server code and a sanitized subset to the UI;
- test the deployment-profile guard.

## 6. Supabase local development

Initialize Supabase CLI configuration and local development instructions.

Create:

- database client factories for browser, server, route handlers, and tests;
- SSR cookie handling appropriate to the selected stable Supabase/Next.js integration;
- generated database type workflow;
- a first migration containing only safe foundational extensions/schemas/functions;
- a `private` schema for security-definer helpers;
- database conventions for timestamps, updated-at triggers, enums, and comments;
- an empty-but-real seed strategy;
- local reset and type-generation scripts.

Do not create the full product schema in this phase. Do create the conventions that later migrations will follow.

Use publishable/secret key naming when supported by the selected Supabase SDK. Never put a secret key in public env or browser code.

## 7. Testing and quality infrastructure

Configure:

- Vitest;
- React Testing Library;
- `@testing-library/jest-dom`;
- fast-check;
- Playwright;
- axe integration;
- database tests using pgTAP or an equivalent reproducible local-Supabase approach;
- k6 script directory and a smoke placeholder that performs a real health check, not a fake test;
- production build verification;
- optional Storybook or an equally capable component workspace;
- Lighthouse CI configuration with baseline budgets;
- bundle analysis command;
- test fixtures and factories.

Create initial passing tests for:

- environment validation and child-profile deployment guard;
- representative UI keyboard/accessibility behavior;
- public landing rendering;
- health route;
- database migration availability;
- no server-secret import into a client bundle, using a lint/boundary rule where practical.

Root `pnpm verify` must run all checks that can run without paid/external credentials.

## 8. CI and repository hygiene

Create a GitHub Actions workflow or equivalent checked-in CI definition that:

- installs with frozen lockfile;
- caches pnpm safely;
- runs lint, typecheck, unit tests, database tests, and build;
- runs Playwright in a supported environment;
- scans for accidentally committed secrets;
- uploads test artifacts on failure;
- does not require production secrets.

Add dependency boundaries so, for example, `packages/domain` cannot import Next.js and Client Components cannot import server modules.

## 9. Deployment portability

Set up and document:

- Vercel-compatible Next.js deployment;
- a provider-portable build path with a provisional Cloudflare/OpenNext configuration when compatible;
- no provider-specific API buried inside domain packages;
- deployment-profile capability checks;
- production preview robots/noindex settings where appropriate;
- stable server-action encryption key instructions for multi-instance deployment;
- security headers and a CSP plan.

Do not claim child-capable compliance. Add a visible owner-facing launch gate in documentation.

## 10. Documentation

Create or complete:

- `docs/ARCHITECTURE_DECISIONS.md`;
- `docs/DATA_MODEL.md` with conventions and a link to the canonical blueprint;
- `docs/EVENT_PROTOCOLS.md` as a versioning template;
- `docs/SECURITY_AND_PRIVACY.md`;
- `docs/SETUP.md` with exact local steps;
- `docs/IMPLEMENTATION_STATUS.md`;
- `docs/TESTING.md`;
- `docs/DEPLOYMENT.md`.

The setup guide must cover:

- prerequisites;
- Supabase CLI;
- local start/reset;
- type generation;
- running web;
- test commands;
- environment files;
- Vercel preview setup;
- portable-host setup status;
- no-cost versus optional services;
- common failure recovery.

## Required acceptance criteria

Do not report completion until all are true:

- `pnpm install` succeeds with the lockfile;
- local Supabase can start or the environment limitation is explicitly identified and the config is validated;
- migrations apply from empty;
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, and `pnpm build` pass;
- Playwright can open the landing page and design-system route;
- axe reports no serious/critical violations on those routes;
- the design system is visibly original and responsive;
- deployment-profile child gating is covered by tests;
- no public env exposes a server secret;
- `docs/IMPLEMENTATION_STATUS.md` records exact commands and results.

At the end, give a concise implementation report. Do not ask whether to continue to Phase 1.

<!-- END 00_BOOTSTRAP_AND_FOUNDATION.md -->

---

<!-- BEGIN 01_IDENTITY_AUTH_PRIVACY.md -->

# Phase 1 — Identity, authentication, learner profiles, privacy controls, and authorization foundation

Read `AGENTS.md`, the blueprint, the architecture decisions, and implementation status. Implement this phase in the existing repository. Do not merely propose schemas or screens.

## Objective

Deliver a complete account foundation for authenticated users, parent-managed learner profiles, public visitors, and ephemeral game guests. Build the authorization and privacy model that all later deck, scheduling, class, sharing, and game features will rely on.

The Vercel beta remains 13+. Under-13 code paths may be implemented and tested locally, but the server must keep them disabled under the Vercel deployment profile.

## 1. Database schema

Create additive migrations for the canonical identity/privacy entities, adapting names only when the mapping is documented:

- `profiles`;
- `learner_profiles`;
- `learner_profile_access`;
- `account_capabilities` or an equivalent normalized capability model;
- `guardian_relationships`;
- `consent_records`;
- `profile_sessions`;
- `devices`;
- `privacy_requests`;
- `data_export_jobs`;
- `deletion_jobs`;
- `audit_events`;
- `guest_sessions`;
- `rate_limit_buckets` if using database-backed rate limiting.

Requirements:

- one self learner profile is created transactionally for every eligible account;
- account capabilities permit a user to learn, create, host, and teach without mutually exclusive roles;
- authorization-critical data is not stored in user-editable auth metadata;
- age band is stored rather than exact birthday by default;
- consent and revocation are append-only;
- child profile access is explicit and guardian-controlled;
- profile-session tokens are hashed at rest;
- guest records contain no email or unnecessary persistent identifier;
- all timestamps are UTC;
- all exposed tables have RLS;
- policy helper functions live in a private schema, use explicit search paths, and have minimal grants;
- all policy columns are indexed.

Create database functions for:

- provisioning the application profile after auth signup;
- ensuring exactly one self learner profile;
- checking learner-profile access;
- creating/revoking a profile-switch session;
- creating and redeeming a guest session;
- requesting account export;
- requesting account deletion;
- recording consent/revocation;
- auditing sensitive changes.

Use idempotency and transaction safety.

## 2. Authentication

Implement a polished authentication experience using Supabase Auth:

Required:

- email/password signup and sign-in;
- email verification flow where configured;
- forgot/reset password;
- magic-link sign-in;
- sign-out from current device;
- sign-out all sessions when supported;
- session refresh and SSR-protected routes;
- auth callback handling;
- safe redirect allowlist;
- graceful expired-link/error screens.

Optional providers must be conditionally rendered based on environment configuration:

- Google;
- GitHub;
- Microsoft.

Do not show a provider button that is not configured. Add setup instructions for each. Do not implement Apple as a required beta dependency because its developer setup may not be free; keep the provider interface extensible.

Use server-side authorization for protected routes. Never rely only on middleware or hidden UI. Every protected server read/mutation must verify the account and learner-profile context.

## 3. Neutral age screen and onboarding

Create onboarding that asks for the minimum information:

- display name;
- handle;
- locale;
- time zone;
- study-day start;
- age band using a neutral age screen;
- optional learning goals;
- theme/motion preference.

Flow:

- adult/teen users may finish self-account onboarding;
- under-13 selection cannot create an independent account workflow;
- under-13 path explains that a guardian-managed profile is required;
- on `vercel_beta`, the flow clearly states child profiles are not available and refuses activation server-side;
- in local child-enabled test profile, a guardian can create a child learner profile after recording the configured consent state;
- do not collect a child email;
- do not request exact school, address, phone, or full birthday.

Do not claim that a checkbox alone is verifiable parental consent. Represent consent status and provide an owner-facing launch gate.

## 4. Learner-profile switcher

Implement:

- self profile;
- guardian-created child profile when capability enabled;
- secure profile switch;
- PIN/family-code setup using strong hashing and rate limits;
- short-lived signed/hashed profile session;
- obvious active-profile indicator;
- cache and offline-storage isolation hooks for later phases;
- guardian exit control;
- profile lock timeout;
- profile rename/avatar seed/preferences;
- revoke device/profile sessions.

A child profile must never gain the guardian’s account settings, email, private billing placeholder, or administrative controls.

## 5. Account and privacy settings

Implement real settings pages for:

- profile;
- security;
- connected auth providers;
- devices/sessions;
- learner profiles;
- guardian controls;
- privacy;
- data export request;
- deletion request and cancellation during a grace period;
- content/social safety defaults;
- analytics preference;
- notification placeholder only when it has real stored settings and no dead controls.

Provide:

- clear retention explanations based on configuration;
- no ads/data sale defaults;
- first-party analytics default;
- child analytics minimized;
- downloadable export job status infrastructure, even though full content export is implemented in the portability phase;
- deletion job state and safe re-authentication for destructive requests.

## 6. Public visitor behavior

Public routes must work without login. Add a real public-shell context that later public decks can use.

Unauthenticated users may not:

- create or save decks;
- persist study history;
- access `/app`;
- rate/favorite/comment;
- enumerate users;
- switch learner profiles.

Implement an authorization-aware call to action that preserves the intended return URL safely.

## 7. Guest game identity foundation

Implement the reusable guest identity flow without building games yet:

- join-code form shell;
- server route/RPC that will accept a future valid game code;
- Supabase anonymous auth or a documented equivalent ephemeral signed claim;
- generated safe nickname service;
- optional filtered custom nickname;
- hashed reconnect token;
- expiration and purge job;
- rate limiting by IP/session without invasive fingerprinting;
- no persistent XP or account conversion unless the guest explicitly signs up later;
- test fixture room hook, not a fake production room.

If the game tables do not yet exist, define an interface and a test-only adapter; do not expose a join button that pretends to join a nonexistent game.

## 8. RLS and authorization matrix

Write automated database tests covering at minimum:

- anonymous visitor;
- authenticated owner;
- unrelated authenticated user;
- guardian;
- child active profile;
- teacher-observer placeholder capability;
- revoked guardian;
- expired profile session;
- guest;
- attacker with a valid account but tampered learner-profile ID;
- service/admin path.

Verify that:

- users can read/update only their allowed profile fields;
- child data is guardian-scoped;
- consent records cannot be rewritten;
- audit events cannot be forged by clients;
- guest rows are scoped and expire;
- private helper schemas are not exposed;
- user metadata cannot escalate privileges.

## 9. Security

Add:

- route-level rate limiting for signup, password reset, PIN attempts, guest creation, and destructive requests;
- CSRF/origin protections appropriate to the chosen Next.js mutation path;
- safe error messages that do not enumerate accounts;
- re-authentication for high-risk actions;
- audit entries for profile/consent/session/deletion changes;
- headers and cookie settings;
- tests that a Vercel profile cannot enable child profiles through client or server tampering.

## 10. UI quality

The auth/onboarding/settings experience must be:

- original and premium;
- fully responsive;
- keyboard accessible;
- screen-reader friendly;
- complete in light/dark/reduced-motion modes;
- explicit about loading, pending verification, expired link, offline, rate-limited, and error states;
- free of fake social proof or fabricated user statistics.

## Required acceptance criteria

- migrations apply from empty and from the previous phase;
- auth provisioning is idempotent;
- SSR route protection and redirect behavior work;
- configured email/password and magic-link flows have local/test coverage;
- conditional OAuth buttons behave correctly;
- profile switching is authorized server-side;
- Vercel child-profile guard cannot be bypassed;
- RLS matrix passes;
- destructive requests require re-authentication or an equivalent secure check;
- privacy/export/deletion state is real, not static UI;
- `pnpm verify` and relevant Playwright flows pass;
- documentation includes Supabase email/OAuth configuration and current child launch gate;
- implementation status records tests and any integration that could not be live-verified without credentials.

Do not begin deck/card implementation beyond interfaces required for authorization tests.

<!-- END 01_IDENTITY_AUTH_PRIVACY.md -->

---

<!-- BEGIN 02_CONTENT_MODEL_EDITOR_CARD_TYPES.md -->

# Phase 2 — Decks, notes, generated cards, rich editor, media, and every required card type

Read all project instructions and existing migrations. Implement the complete content-authoring foundation without starting the scheduler or adaptive mastery engine.

## Objective

Deliver a polished deck library and editor with an Anki-grade distinction between notes and generated cards, safe customizable templates, media, version-aware editing, and all target card types. Public read-only deck preview must become real in this phase.

## 1. Database schema

Create additive migrations for:

- folders and nested folder items;
- decks;
- deck members/owner relation sufficient for this phase;
- tags and note tags;
- note types;
- note type fields;
- card templates;
- notes;
- note field values;
- generated cards;
- card choices;
- cloze definitions;
- image occlusions;
- diagram hotspots;
- ordering items;
- list-answer items;
- audio prompt metadata;
- drawing reference layers;
- media assets and references;
- note revisions;
- deck versions/content snapshots sufficient for safe editing;
- stars/favorites for a learner’s own content state if useful now;
- content-change impact records.

Follow the canonical meanings in the blueprint.

Constraints:

- stable card IDs when semantic generation identity remains;
- deterministic generation key;
- uniqueness constraints that prevent duplicate generated siblings;
- soft deletion/tombstones where offline sync will need them;
- extracted plain text for search;
- content hashes;
- version columns for optimistic concurrency;
- no arbitrary HTML persisted as trusted output;
- RLS for owner/editor/viewer/public projections;
- indexes for library lists, note lookup, tags, versions, and public slug.

Create a safe, versioned public projection/view that includes only published deck fields and current published card content. It must obey RLS/security-invoker requirements.

## 2. Domain types and repositories

Implement framework-independent domain models and typed repositories/services for:

- deck lifecycle;
- note type and field schema;
- note validation;
- template compilation;
- card generation/reconciliation;
- media linking;
- revision creation;
- content-change classification;
- public projection.

Every mutation validates authorization and optimistic version. Conflict responses must be typed and actionable.

## 3. Safe template system

Implement an Anki-inspired but safe template DSL supporting:

- field interpolation;
- front/back references;
- conditional display for nonempty fields;
- bounded iteration over list fields;
- approved helpers such as cloze text, type-answer field, hint, media, and language;
- front-side inclusion on the back;
- sanitized, scoped CSS;
- live preview with representative note data.

Forbidden:

- arbitrary JavaScript;
- arbitrary network requests;
- untrusted iframe;
- unsafe event handlers;
- global CSS escape;
- server template execution from user strings.

Use an AST/parser or a tightly constrained maintained templating engine. Do not render untrusted strings with `dangerouslySetInnerHTML` unless sanitized through a centralized audited path and covered by XSS tests.

## 4. System note types and card types

Ship real system note types and authoring experiences for all of these:

1. Basic front → back.
2. Basic plus reversed.
3. Optional reversed controlled by a field.
4. True bidirectional card.
5. Custom multi-field template.
6. Typed-answer card.
7. Cloze deletion with multiple and overlapping cloze groups where semantically valid.
8. Image occlusion.
9. Multiple choice.
10. Select all that apply.
11. True/false.
12. Ordering/sequencing.
13. List-answer.
14. Diagram label/hotspot.
15. Audio-prompt.
16. Pronunciation/voice-recording.
17. Drawing/handwritten-answer.

For each type:

- define schema;
- define generated-card behavior;
- define editor;
- define preview;
- define renderer contract for study phases;
- define accessible fallback;
- create fixtures and tests;
- ensure bulk import can target it later.

### Reversed and sibling behavior

A note can generate multiple cards. Each card has its own stable ID and later schedule. Sibling relationships are derivable from `note_id`. Card generation must deactivate obsolete generated cards rather than silently reassigning their IDs to different semantics.

## 5. Rich editor

Use Tiptap/ProseMirror-compatible versioned JSON. Implement:

- paragraphs/headings;
- bold/italic/underline/strike;
- lists and task-like lists only where semantically appropriate;
- blockquote;
- links with safe protocol validation;
- tables;
- code blocks with syntax highlighting;
- inline code;
- KaTeX/LaTeX blocks and inline math;
- horizontal rule;
- callout/hint;
- citations/source block;
- images with alt text;
- image crop/rotate/basic annotation;
- audio attachment;
- in-browser audio recording;
- safe external video embed from an allowlist;
- Markdown shortcuts and paste handling;
- plain-text paste;
- undo/redo;
- keyboard shortcuts;
- word/character count where useful;
- content-language metadata;
- accessible toolbar and command palette;
- mobile-friendly controls.

Persist editor JSON and derived plain text. Sanitize on ingest and render. Create schema-version migration functions for stored editor documents.

## 6. Image occlusion and diagram tools

Build a usable visual authoring tool:

- upload/select image;
- zoom and pan;
- create rectangle/ellipse/polygon masks;
- select/move/resize/delete;
- group masks into cards;
- choose “hide one, reveal others” or “hide all, reveal one” behavior;
- label and alt-text each region;
- keyboard-accessible mask list;
- accessible textual fallback;
- deterministic card generation;
- responsive study renderer contract.

Do not depend only on canvas pixels; persist vector geometry in normalized coordinates.

Diagram hotspots support labels, accepted aliases, optional prompt direction, and nonvisual text fallback.

## 7. Audio, pronunciation, and drawing

Audio:

- upload with MIME/magic-byte validation;
- record through MediaRecorder when supported;
- trim metadata if practical;
- playback speed;
- transcript field;
- local/browser TTS interface for text fields;
- no auto-upload before explicit save.

Pronunciation cards:

- reference audio or TTS;
- optional learner recording stored only with explicit action;
- self-review interface contract;
- no cloud speech upload in this phase.

Drawing cards:

- pointer/touch drawing canvas with undo/redo/clear;
- optional reference overlay;
- export a compact stroke/vector payload or local image only when user saves;
- keyboard/nonvisual alternative such as typed answer;
- do not make drawing correctness automatic yet.

## 8. Media pipeline

Implement:

- client preprocessing and compression for images;
- magic-byte verification server-side;
- hash before upload;
- content-addressed deduplication per owner;
- quota checks;
- private and published access rules;
- signed URL strategy;
- reference counting;
- delayed deletion;
- alt-text requirement/warning;
- upload progress/cancel/retry;
- no uploaded video by default;
- external video URL allowlist and privacy-enhanced embed option.

Create storage buckets and RLS policies via migration/setup scripts, not dashboard-only undocumented steps.

## 9. Deck library and editor UX

Build:

- library dashboard with folder tree/list/grid views;
- create, rename, duplicate, archive, delete/restore deck;
- nested folders with cycle prevention;
- tags;
- deck cover/theme;
- bulk card add;
- spreadsheet-like quick editor;
- rich single-note editor;
- drag/reorder where meaningful, with keyboard alternative;
- search/filter within deck;
- duplicate note warning;
- autosave with clear states;
- version conflict dialog;
- card-generation preview;
- sibling list;
- note/card browser;
- bulk tag, move, suspend-placeholder metadata only if schedule does not yet exist;
- version history with read-only diff and restore for content;
- content-change classification.

Do not reset future scheduling automatically. Store enough impact metadata for the SRS phase to ask preserve/relearn/reset.

## 10. Public deck preview

Implement:

- public/unlisted/private visibility states needed now;
- publish/unpublish;
- unique public slug or ID;
- public deck page;
- card flip/swipe preview without persistent progress;
- creator attribution;
- license display;
- card count and supported type summary;
- safe media rendering;
- sign-in CTA preserving return URL;
- no private fields/revisions/member list;
- robots/noindex for unlisted;
- embed-safe read-only projection contract.

Password sharing and advanced permissions are implemented in the sharing phase; do not fake them now.

## 11. Tests

Add:

- template parser/render XSS corpus;
- deterministic card generation;
- reverse/optional reverse/bidirectional siblings;
- multiple cloze generation;
- image geometry serialization;
- all card-type schema validation;
- rich-document schema migration;
- media authorization;
- optimistic editing conflicts;
- version restore;
- public projection privacy;
- folder cycle prevention;
- large deck list/query fixture;
- Playwright authoring flows on desktop and mobile;
- accessibility tests for editor toolbar, dialogs, occlusion list, and public card preview.

## Required acceptance criteria

- every target card type can be authored, saved, reopened, previewed, and rendered through a typed study-view contract;
- no arbitrary script can run through imported/editor/template content;
- media policies protect private files;
- public deck preview contains only published data;
- versions and restore work;
- card generation is stable and tested;
- editor has functional keyboard and mobile behavior;
- migrations and RLS tests pass;
- production build and full verification pass;
- implementation status documents any deferred study-only behavior but contains no deferred card authoring type.

Do not implement FSRS scheduling in this phase.

<!-- END 02_CONTENT_MODEL_EDITOR_CARD_TYPES.md -->

---

<!-- BEGIN 03_SRS_REVIEW_ENGINE.md -->

# Phase 3 — FSRS-first scheduling, SM-2 compatibility, canonical review flow, custom study, and statistics

Read the full blueprint and the completed content model. Implement the long-term memory kernel. This is a correctness-critical phase; prioritize auditable domain behavior and database invariants over decorative extras, while still delivering a premium review interface.

## Objective

Create an Anki-grade review system using `ts-fsrs` behind a project-owned scheduler interface, with optional SM-2 compatibility, per-learner schedules, append-only review logs, atomic online reviews, offline-ready event IDs, undo, rebuild, custom study, advanced controls, and meaningful statistics.

## 1. Scheduler package

Create `packages/srs` with no dependency on React or Next.js.

Expose typed APIs for:

- preset validation and serialization;
- empty card creation;
- previewing Again/Hard/Good/Easy;
- applying a rating;
- retrievability;
- rollback;
- forget/reset;
- reschedule/rebuild from logs;
- schedule migration;
- SM-2 compatibility;
- due-queue helpers;
- study-day calculation.

Pin and record the `ts-fsrs` version/model assumptions. Persist scheduler version in review logs.

Default FSRS configuration:

```text
requested retention: 0.90
max interval: 36500 days
learning steps: 1m, 10m
relearning steps: 10m
short-term enabled
fuzz enabled
```

Do not expose a fabricated “ease factor” for FSRS. Store/display difficulty and stability. Preserve `legacy_ease_factor` only for SM-2/import compatibility.

## 2. Database schema

Create additive migrations for:

- `srs_presets`;
- `deck_srs_settings`;
- `card_schedules`;
- `review_logs`;
- `study_sessions`;
- `study_session_items`;
- `study_filters`;
- `daily_study_counters`;
- `schedule_snapshots` if needed for efficient replay;
- `review_undo_events` or a compensating-log representation;
- scheduler optimization job metadata, feature-flagged.

Constraints:

- schedule primary key is learner profile + card;
- shared decks never share schedule state;
- schedule version increments atomically;
- review log ID is client-generated and unique;
- idempotency key prevents double application;
- check constraints on ratings/states/durations;
- due and learner/card indexes;
- review log append-only permissions;
- RLS scopes all rows to accessible learner profile;
- public users cannot read schedules or logs;
- content deletion/deactivation preserves historical review references safely.

## 3. Presets and deck configuration

Implement UI and services for:

- create/duplicate/rename/delete personal preset;
- FSRS or SM-2 compatibility selection;
- requested retention;
- learning and relearning steps with parser/validation;
- maximum interval;
- new cards/day;
- reviews/day;
- new-card order;
- review order;
- new/review mixing;
- sibling bury settings;
- leech threshold and action;
- interval fuzz toggle;
- apply preset to one or multiple decks;
- restore system defaults;
- estimate workload when retention changes.

Settings are per learner/deck, not content-global.

## 4. Atomic online review RPC

Implement a database-backed canonical mutation. Inputs include:

- learner profile ID;
- card ID;
- study session ID;
- rating;
- reviewed-at;
- duration;
- timezone;
- study-day start;
- device ID;
- current schedule version;
- review ID/idempotency key;
- source.

The RPC/service must:

1. verify the caller can use the learner profile and study the card;
2. lock or atomically compare the schedule row;
3. return an existing result for duplicate review ID;
4. reject or return a typed stale-version conflict;
5. calculate the transition using the scheduler package or a trusted server path;
6. insert immutable before/after log;
7. update schedule and daily counters;
8. update session item;
9. handle sibling burying;
10. return new state, due count, and next-action data.

Do not calculate canonical state only in the browser. A local preview may use the same package.

If calling TypeScript from a Postgres function is impossible, use a server transaction pattern that still guarantees lock/idempotency and document the boundary. Do not create a race-prone read-then-write sequence.

## 5. Review queue

Implement deterministic queue construction honoring:

- learner profile;
- active deck/folder/filter;
- suspended/buried/inactive cards;
- due/new/relearning;
- daily limits;
- order settings;
- sibling separation;
- custom study;
- retrievability where relevant;
- deck hierarchy/folder selection;
- time zone and study-day cutoff.

Support:

- default Today queue;
- one deck;
- folder/multi-deck;
- new only;
- due only;
- forgotten today;
- leeches;
- starred;
- tag query;
- review ahead;
- cram/preview;
- relative overdueness;
- random;
- interval range;
- card state.

A preview-only session must not reschedule. A rescheduling filtered session follows the configured rule and records source.

## 6. Review interface

Build a polished review screen:

- prompt side;
- media, math, code, diagrams, and safe templates;
- reveal action before rating;
- Again/Hard/Good/Easy with next interval preview;
- keyboard shortcuts;
- touch/swipe option that never causes accidental grading;
- typed-answer comparison when card type supports it;
- audio autoplay preference;
- progress and remaining counts;
- optional timer;
- pause;
- edit note;
- star;
- bury card;
- bury siblings;
- suspend;
- report content;
- undo last review;
- offline-ready state indicator;
- accessible live announcements;
- reduced-motion card transition;
- serious mode.

Do not use red/green alone. Never expose the answer in the DOM before reveal in a way that trivial scripts/assistive navigation accidentally reads it; still ensure the revealed answer is accessible.

## 7. Advanced operations

Implement authorized and audited operations:

- suspend/unsuspend;
- bury until next study day;
- bury siblings;
- reset/forget;
- manual due date;
- reschedule range;
- set due order for new cards;
- mark leech;
- leech auto-suspend or tag action;
- undo last canonical review using scheduler rollback/compensating event;
- rebuild schedule from logs;
- detect schedule/content version mismatch;
- choose preserve/relearn/reset after semantic note edits.

Bulk operations need preview, count, confirmation, and transaction-safe behavior.

## 8. Statistics

Create learner-private statistics:

- due today;
- cards by state;
- review count/time;
- accuracy by rating;
- retention/retrievability estimate;
- stability and difficulty distribution;
- lapses/leeches;
- interval distribution;
- forecast;
- calendar heatmap;
- answer-time distribution;
- deck/tag breakdown;
- review history timeline per card;
- workload estimate;
- mature/young/new counts.

Use accessible charts with text/table alternatives. Avoid false precision and explain the metric.

## 9. Scheduler optimization

Create a feature-flagged optimizer adapter:

- requires a documented minimum number/quality of review logs;
- exports logs in a compatible schema;
- can run locally/worker-side when dependency is available;
- previews old/new parameter effects;
- requires user confirmation;
- stores versioned parameters;
- can roll back to previous preset.

Do not require Python or a paid worker for core operation. It is acceptable for the adapter to be implemented and locally testable while disabled by default, but not acceptable to display a working “Optimize” button if no execution path exists.

## 10. Tests and invariants

Add comprehensive tests:

- parity examples with `ts-fsrs`;
- default transitions;
- learning/relearning;
- max interval;
- fuzz boundaries;
- time zone/study-day;
- SM-2 ease and interval behavior;
- duplicate review idempotency;
- stale version conflict;
- concurrent review attempts;
- undo/rollback;
- rebuild from logs;
- import-style replay;
- sibling bury;
- daily limits;
- preview-only custom study;
- schedule isolation between learners;
- RLS;
- inactive/deleted content handling;
- property tests for nonnegative/bounded intervals and deterministic no-fuzz mode;
- Playwright review session with keyboard/mobile;
- accessibility;
- large due queue query performance.

## Required acceptance criteria

- FSRS is default and all four ratings work;
- schedules are per learner/card and never shared;
- canonical reviews are atomic and idempotent;
- review logs are append-only and replayable;
- undo produces a valid schedule without deleting history;
- SM-2 compatibility has tests and stores ease only in that mode;
- custom study includes preview and rescheduling semantics;
- advanced operations are authorized;
- statistics are based on real data;
- content changes surface schedule decisions;
- all checks, database tests, concurrency tests, and relevant E2E pass;
- implementation status records scheduler/package versions and measured queue performance.

Do not implement adaptive Learn mastery in this phase beyond the interface that can later offer an explicit SRS rating.

<!-- END 03_SRS_REVIEW_ENGINE.md -->

---

<!-- BEGIN 04_ADAPTIVE_LEARN_AND_STUDY_MODES.md -->

# Phase 4 — Adaptive Learn Mode, grading, flashcards, writing, tests, matching, spelling, diagrams, and exam planning

Read the existing SRS implementation carefully. Implement the practice/mastery layer as a separate system. Do not allow this phase to corrupt canonical review history.

## Objective

Deliver the polished consumer study experience: a Quizlet-quality flashcard interaction, a substantially stronger adaptive Learn Mode, deterministic flexible grading, practice tests, Match, spelling/pronunciation, diagrams, weak-area sessions, and transparent optional qualification into SRS.

## 1. Database schema

Create additive migrations for:

- `practice_sessions`;
- `practice_session_items`;
- `practice_attempts`;
- `concept_mastery`;
- `accepted_answer_rules`;
- `answer_overrides`;
- `learning_goals`;
- `exam_plans`;
- `practice_test_definitions`;
- `practice_test_attempts`;
- `practice_test_responses`;
- `personal_bests`;
- mode preference tables if not stored safely in profile settings.

Requirements:

- practice attempts are distinct from review logs;
- answer payload retention is configurable and minimized for child profiles;
- mastery is learner-private;
- SRS qualification status is explicit;
- overrides are auditable;
- no public RLS access;
- session resume is supported;
- all mode configurations are versioned JSON validated by shared schemas.

## 2. Grading package

Create `packages/grading`, framework-independent and exhaustively tested.

Implement answer types:

- text;
- aliases;
- ordered list;
- unordered set;
- numeric;
- unit-aware numeric;
- math expression where safely supported;
- multiple choice;
- multi-select;
- true/false;
- ordering;
- diagram hotspot/label;
- pronunciation self-review result;
- drawing self-review result.

Implement strict, moderate, relaxed, and custom grading.

Pipeline:

- Unicode NFKC;
- whitespace;
- case;
- punctuation;
- configurable accent/diacritic handling;
- exact match;
- aliases;
- required and forbidden keywords;
- list parsing;
- number formatting;
- unit conversion;
- safe math equivalence;
- Damerau-Levenshtein;
- token similarity;
- deterministic synonyms only when creator-authored;
- optional semantic-provider hook, disabled by default.

Return:

```ts
{
  correctness: number;       // 0..1
  verdict: "correct" | "partial" | "incorrect" | "needs_review";
  confidence: number;        // 0..1
  matchedRule: string;
  explanation: string;
  normalizedExpected: string[];
  normalizedReceived: string;
  overrideAllowed: boolean;
}
```

Do not use an LLM in the deterministic default path.

## 3. Mastery model

Create `packages/learning-engine`.

Mastery must be explainable and recalculable. Implement:

- recognition score;
- recall score;
- overall mastery;
- decay;
- attempt evidence weights;
- reduced evidence for immediate repeats;
- reduced evidence for multiple choice/true-false;
- stronger evidence for unaided delayed written recall;
- penalties for hints/retries/reveal;
- confidence/latency as bounded modifiers;
- content-version invalidation or weakening after semantic edits.

Stages:

```text
unseen
introduced
recognition
guided_recall
free_recall
mastered
needs_refresh
```

Write property tests ensuring mastery remains in bounds and games cannot call this API without an explicit practice-evidence adapter.

## 4. Adaptive selection

Implement a deterministic, seeded selector combining:

- current stage/mastery;
- due/overdue status;
- recent miss;
- time since last attempt;
- exam urgency;
- target session goal;
- tag/deck focus;
- question-type progression;
- sibling spacing;
- anti-repeat penalty;
- estimated item difficulty;
- accessibility preferences.

Default progression:

1. brief flashcard introduction;
2. recognition;
3. guided recall;
4. typed/free recall;
5. delayed retest;
6. session mastery after at least two appropriately spaced successes;
7. end summary and next recommendation.

A missed card is not repeated immediately unless the mode explicitly asks the learner to retype the correct answer; it reappears after intervening items.

## 5. Flashcards mode

Implement a premium non-SRS flashcard mode:

- flip, click, spacebar, swipe;
- orientation term/definition/both;
- shuffle with reproducible session seed;
- autoplay with pause;
- audio/TTS;
- star;
- know/still learning sorting;
- filter by starred/tag;
- progress;
- resume session;
- nonpersistent public preview;
- authenticated practice attempt recording only when the user classifies a card;
- reduced-motion fallback;
- screen-reader reveal behavior.

Clearly distinguish Flashcards from SRS Review.

## 6. Learn Mode

Implement:

- goal selection: time, count, mastery threshold, new, due, weak, starred, tags, exam date, mixed decks;
- question type selection;
- answer direction;
- strictness;
- audio;
- retype-correct-answer preference;
- hints policy;
- pause/resume;
- adaptive queue;
- mastery progress by concept;
- explanation of why an item returned;
- end summary;
- mistake review;
- recommended next session.

Question types:

- flashcard;
- multiple choice;
- select all;
- true/false;
- typed answer;
- ordering;
- list answer;
- diagram label/hotspot;
- audio/spelling;
- self-reviewed drawing/pronunciation where automatic grading is not valid.

### Explicit SRS qualification

After an eligible unaided free-recall/typed attempt on a due or new card:

- calculate a suggested Again/Hard/Good/Easy mapping;
- show why it is suggested;
- let the learner accept or choose another rating;
- apply through the canonical SRS review API;
- record practice attempt and linked review ID;
- never apply silently;
- ineligible attempts show no misleading scheduling claim.

## 7. Written practice

Create a focused Write mode:

- answer with either side or configured field;
- strictness;
- aliases/lists/math/units;
- two-pass default;
- revisit misses;
- require two spaced successes;
- “Don’t know”;
- reveal and optional retype;
- “I was correct” override;
- creator feedback path for wrong answer key;
- answer comparison that highlights differences accessibly.

## 8. Multiple-choice and distractors

Implement deterministic distractor generation:

- manual choices first;
- semantically related deck answers via tags/text similarity;
- same answer type/language;
- reject duplicates/correct answer/near duplicates;
- balance length/style;
- avoid choices from sibling cards that reveal answer;
- cache generated set per seeded session;
- allow deck creator preview/edit.

Track partial credit for select-all with a documented formula that discourages selecting every option.

## 9. Test mode

Build a test generator:

- question count;
- selected decks/tags;
- question-type mix;
- answer direction;
- timed or untimed;
- per-question or whole-test timer;
- random seed;
- one-page or question-by-question layout;
- answer review policy;
- partial credit;
- manual self-grade queue for unsupported open answers;
- pause policy;
- retakes;
- regenerate;
- mistake-only retest;
- printable answer key;
- no SRS side effects.

Store definition and attempts. Show accuracy, score, time, and concept breakdown.

## 10. Match mode

Implement:

- pair tiles;
- responsive layouts;
- keyboard selection;
- touch;
- accessible list alternative;
- timer;
- mistake feedback;
- personal best;
- seeded rounds;
- hide impossible duplicates;
- session summary;
- practice evidence with low weight;
- no SRS mutation.

## 11. Spell and pronunciation

Implement:

- audio or TTS prompt;
- typed answer;
- replay and slower speed;
- accents;
- language selection;
- optional learner recording;
- local playback/self-assessment;
- transcript;
- privacy notice for recording;
- no cloud upload without explicit provider phase;
- accessible text alternative.

## 12. Diagram mode

Implement:

- hotspot selection;
- typed label;
- drag label plus keyboard alternative;
- zoom/pan;
- occlusion practice;
- reveal/hint;
- text fallback;
- attempt evidence;
- accessible SVG labels.

## 13. Exam planning and custom study

Build:

- exam date;
- target decks/tags;
- available days/minutes;
- current due load;
- recommended daily practice plan;
- “today” session generation;
- weak-area focus;
- backlog catch-up;
- clear distinction between SRS due reviews and extra exam practice;
- adaptive recalculation based on completed work.

Do not promise a grade. Show assumptions.

## 14. UI and feedback

- premium transitions and microinteractions;
- no blocking celebration after every answer;
- concise explanation on incorrect/partial;
- confetti only for meaningful milestones and disabled in serious/reduced-motion mode;
- immediate local feedback;
- clear offline/sync state hooks;
- full keyboard support;
- mobile-first study layout;
- persistent but unobtrusive session controls;
- no dark patterns.

## 15. Tests

Add:

- grading corpus for languages, accents, Unicode, math, units, lists;
- distractor quality invariants;
- mastery bounds/decay;
- selection determinism and anti-repeat;
- SRS qualification eligibility and explicit consent;
- no SRS mutation from ordinary practice;
- all study modes;
- session resume;
- test scoring/partial credit;
- accessible Match fallback;
- audio unsupported-browser fallback;
- diagram keyboard flow;
- Playwright desktop/mobile/reduced-motion;
- large deck session performance.

## Required acceptance criteria

- every target study mode is functional with real deck content;
- Learn changes question type based on mastery;
- deterministic grading explains its result;
- user override is audited;
- SRS updates occur only through explicit qualified acceptance;
- practice and test results never masquerade as review logs;
- session resume and summaries work;
- accessibility alternatives exist for drag, audio, and visual diagrams;
- tests and production build pass;
- implementation status records formulas, thresholds, and measured performance.

Do not begin offline storage or cloud AI beyond interfaces required for later phases.

<!-- END 04_ADAPTIVE_LEARN_AND_STUDY_MODES.md -->

---

<!-- BEGIN 05_OFFLINE_PWA_AND_SYNC.md -->

# Phase 5 — Installable PWA, offline study/editing, outbox synchronization, and conflict resolution

Read the implemented SRS, practice, content, auth, and profile-switching systems before changing anything. This phase must make the application resilient without creating a second incompatible data model.

## Objective

Deliver an installable PWA that can pin decks, study and review offline, create/edit content offline, queue idempotent events, synchronize safely across devices, and surface conflicts rather than losing data.

## 1. Offline architecture package

Create `packages/offline` with framework-independent types for:

- local entities/projections;
- sync cursor;
- outbox operation;
- review event;
- practice event;
- content mutation;
- media mutation;
- conflict;
- sync result;
- retry policy;
- profile cache namespace.

Use a versioned protocol. Every outbox item includes:

```ts
{
  id: string;
  protocolVersion: number;
  learnerProfileId: string;
  deviceId: string;
  entityType: string;
  operation: string;
  baseVersion?: number;
  occurredAt: string;
  createdAt: string;
  payload: unknown;
  attemptCount: number;
  nextAttemptAt?: string;
}
```

Validate all payloads with shared schemas.

## 2. IndexedDB/Dexie schema

Implement versioned Dexie stores for:

- pinned decks;
- deck public/private content projections;
- note/card data required for study;
- learner card schedules;
- review outbox;
- practice outbox;
- content operation outbox;
- pending media;
- sync cursors;
- device state;
- local study sessions;
- conflicts;
- cached feature flags/capabilities;
- cache metadata and LRU information.

Rules:

- namespace every private record by account and learner profile;
- clear/switch caches safely on sign-out/profile switch;
- never store server secret keys;
- avoid raw long-lived auth tokens beyond the official client session mechanism;
- schema upgrades must be tested from previous versions;
- do not leave stale child-profile content accessible after guardian exit;
- store only media explicitly pinned or recently needed, with a quota.

## 3. PWA and service worker

Implement:

- web app manifest;
- icons and install metadata using original assets;
- service worker through a maintained approach compatible with the selected Next.js version;
- app-shell caching;
- offline fallback page;
- update-available prompt;
- safe cache versioning;
- static asset precaching;
- network-first authenticated navigation;
- stale-while-revalidate public content where safe;
- explicit deck/media pinning;
- background sync where supported;
- foreground retry fallback where background sync is unavailable;
- no shared caching of private server-rendered responses;
- no caching of secrets, auth callbacks, account settings, or destructive routes.

Clear profile-scoped caches on sign-out. Test installability and offline navigation.

## 4. Device identity and sync sessions

Use a client-generated device ID stored locally and registered to the account. Provide:

- device name and last seen;
- revoke device;
- rotate local sync credentials/session;
- sync cursor per entity stream/profile;
- last successful sync;
- pending count;
- error state;
- “sync now”;
- metered connection preference;
- media download preference.

Do not use invasive fingerprinting.

## 5. Offline review

Offline SRS Review must work for pinned decks.

Flow:

1. local queue is built from cached schedule/content;
2. local `packages/srs` previews/applies an event optimistically;
3. client-generated review ID and base schedule version are stored in outbox;
4. local schedule is updated with a pending marker;
5. sync submits a batch to a server endpoint/RPC;
6. server deduplicates and validates;
7. server accepts, rebuilds, or returns a conflict;
8. local state reconciles;
9. no event is silently dropped.

Implement deterministic replay for nonconflicting events.

Conflict case: two devices reviewed the same stale schedule chain. Store both events, fetch canonical history, replay deterministically where valid, and show a conflict center explaining the result. Allow the user to accept canonical replay or inspect events. Never ask the user to manually retype scheduler internals.

Undo offline:

- create a compensating local operation;
- preserve the original event;
- sync through canonical undo logic;
- handle “already synced then undone” and “not yet synced” paths.

## 6. Offline practice

Support offline:

- Flashcards;
- Learn using deterministic grading and cached mastery;
- Write;
- Test;
- Match;
- Diagram where required media is pinned;
- audio only when cached/local.

Queue practice attempts and mastery deltas as events. The server recomputes or validates mastery from attempts; do not trust a client-provided final mastery number.

## 7. Offline content editing

Support:

- create deck/note;
- edit note fields;
- add/remove tags;
- reorder;
- archive/delete with tombstone;
- safe rich-document edits;
- draft media metadata.

Use optimistic `base_version`.

Conflict rules:

- different fields changed: auto-merge;
- same plain field changed: show side-by-side diff;
- rich content: use Yjs-compatible update representation or a structured merge;
- delete versus edit: preserve edited copy in conflict recovery;
- folder/settings low-risk conflicts: documented last-write-wins when appropriate;
- media: hash dedup.

The conflict UI must allow:

- keep server;
- keep local as a new revision;
- merge;
- duplicate note/deck;
- dismiss only after resolution.

Do not overwrite server content silently.

## 8. Sync API

Create a batched, versioned sync endpoint/service:

- authenticated and profile-authorized;
- request size limited;
- idempotent;
- cursor-based;
- supports reviews, practice, content, deletes, and acknowledgments;
- transaction boundaries per entity chain;
- partial success with typed per-operation result;
- exponential backoff with jitter;
- dead-letter/conflict state after configured attempts;
- structured logs without raw sensitive answer content;
- rate limiting;
- no service-role exposure to browser.

Consider database functions for critical batches. Keep request/response schemas in a shared package.

## 9. Media offline flow

Implement:

- pin/unpin media;
- size estimate before pin;
- browser quota handling;
- LRU cleanup;
- audio/image cache;
- pending image/audio created offline;
- upload when online with hash/quota/magic-byte checks;
- conflict and retry;
- explicit error when browser storage is insufficient;
- no automatic large model/video download.

## 10. UX

Add:

- install prompt where browser permits;
- offline banner;
- sync status;
- per-deck pinned indicator and size;
- pending operation count;
- conflict center;
- update available;
- retry;
- device settings;
- clear offline data;
- storage usage;
- profile-safe switch behavior.

Do not show a green “Synced” state until the server acknowledged all critical events.

## 11. Testing

Add:

- Dexie migrations;
- cache namespace isolation;
- sign-out cleanup;
- service worker cache policy;
- offline navigation;
- offline review then sync;
- duplicate event;
- stale review conflict;
- undo before and after sync;
- two-device content edit conflict;
- delete/edit conflict;
- rich content merge;
- profile switch;
- offline media quota;
- retry/backoff;
- network interruption during batch;
- server partial result;
- Playwright offline context;
- multi-context device simulation;
- no private response in public cache;
- accessibility of conflict center.

## Required acceptance criteria

- the app is installable;
- a pinned deck can be reviewed offline;
- offline reviews synchronize idempotently;
- simultaneous-device conflicts are visible and recoverable;
- practice attempts sync without trusting client mastery;
- content edits do not silently overwrite conflicts;
- sign-out/profile switch prevents cross-profile local data exposure;
- storage quotas and cleanup work;
- PWA tests, E2E offline flows, database tests, and production build pass;
- documentation explains browser limitations and recovery.

Do not implement import/export in this phase beyond ensuring the offline schema can receive imported content later.

<!-- END 05_OFFLINE_PWA_AND_SYNC.md -->

---

<!-- BEGIN 06_IMPORT_EXPORT_AND_PORTABILITY.md -->

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

<!-- END 06_IMPORT_EXPORT_AND_PORTABILITY.md -->

---

<!-- BEGIN 07_SHARING_COLLABORATION_DISCOVERY.md -->

# Phase 7 — Sharing permissions, linked forks, realtime collaboration, version history, creator profiles, discovery, ratings, moderation, and copyright workflow

Read the existing identity, content, offline, and portability systems. Implement sharing without exposing private schedules or child data.

## Objective

Turn private decks into a safe collaborative/public ecosystem. Content may be shared; every learner’s schedule and mastery remain private. Deliver robust permissions, linked/independent copies, realtime editing, discovery, and moderation.

## 1. Database schema

Create additive migrations for:

- `deck_members` expansion to all canonical roles;
- `share_links`;
- `share_link_redemptions`;
- `deck_versions`;
- `deck_snapshots`;
- `deck_forks`;
- `source_update_offers`;
- `note_revisions` expansion;
- `suggestions`;
- `comments`;
- `comment_reactions` if allowed;
- `deck_follows`;
- `ratings`;
- `creator_profiles`;
- `search_documents`;
- `content_reports`;
- `user_blocks`;
- `moderation_cases`;
- `moderation_actions`;
- `copyright_notices`;
- `copyright_counter_notices`;
- `collab_documents`;
- `collab_snapshots`;
- `collab_update_batches`;
- collaboration access/audit rows only where necessary.

Add constraints, retention policies, indexes, RLS, and private authorization helpers.

## 2. Permission model

Implement roles:

- owner;
- manager;
- editor;
- suggester;
- viewer;
- study-only;
- host;
- assignment manager.

Implement actions:

- view;
- study;
- fork;
- comment;
- suggest;
- edit;
- manage members;
- publish;
- host;
- assign;
- restore;
- transfer ownership;
- delete.

Use centralized capability evaluation in both database and TypeScript. UI may consume the result but is not authoritative.

Test matrices for:

- public;
- unlisted;
- password link;
- invited viewer;
- editor;
- suggester;
- manager;
- owner;
- class-scoped user;
- blocked user;
- suspended content;
- child profile;
- expired/revoked link.

## 3. Visibility and share links

Implement:

- private;
- specific people;
- class;
- unlisted;
- password-protected;
- public.

Share links:

- high-entropy token;
- hash at rest;
- optional password with strong hash;
- permission;
- expiry;
- redemption limit;
- revoke;
- audit;
- safe preview;
- no token in analytics/referrer leakage where avoidable.

Unlisted pages use noindex. Public pages expose only the safe published projection. Password protection is enforced server-side, not by hiding content in the client.

## 4. Independent and linked forks

On copy:

### Independent

- new owner;
- new IDs;
- source attribution/license recorded;
- no automatic future source relationship unless license requires attribution.

### Linked

- records source deck/version;
- user edits remain in their fork;
- source updates create a previewable update offer;
- show additions/changes/deletions;
- allow selective merge;
- detect conflicts;
- never overwrite local content automatically;
- preserve attribution and lineage.

Implement source removal/takedown behavior without deleting a lawful independent user copy blindly; follow license/moderation policy and document edge cases.

## 5. Version history and restore

- create meaningful versions on explicit save/publish/bulk/import/source merge;
- do not create a permanent version for every keystroke;
- show author, time, summary, content counts;
- note-level diffs;
- deck-level summary;
- restore creates a new revision;
- content schedules are not shared or rolled back;
- if restored content semantically changes a learner’s cards, use the existing schedule-impact flow;
- immutable audit for permission/publish/restore.

## 6. Realtime collaborative editing

Use Yjs over authorized private Supabase Realtime Broadcast.

Implement:

- document ID per note/rich entity;
- binary update schema;
- private channel authorization tied to edit permission;
- Yjs awareness/presence;
- collaborator names/avatar seeds;
- debounced updates;
- offline merge;
- reconnect;
- durable snapshots;
- update compaction;
- expiry of raw updates;
- permission revocation;
- “user is editing” indicators;
- recovery from corrupt update/snapshot;
- version checkpoint on meaningful save.

Presence is for slow-changing state. Do not broadcast mouse position every frame. If cursors are shown, throttle heavily and disable first when quota is tight.

Non-rich metadata uses optimistic versioned mutations, not a CRDT everywhere.

## 7. Suggestions and comments

Suggestions:

- propose note/field changes;
- diff;
- accept/reject;
- author attribution;
- batch review;
- accepted suggestion becomes a normal revision;
- child restrictions.

Comments:

- deck/note anchored;
- edit/delete own;
- resolve;
- mention only eligible users if implemented;
- rate limits;
- report/block;
- no direct messages;
- under-13 profiles cannot post public comments;
- free-text classroom comments follow class policy and are disabled by default for child profiles.

Do not build unrestricted chat.

## 8. Creator profiles

Eligible users can create a public creator profile with:

- handle;
- display name;
- avatar;
- short biography;
- subjects/languages;
- published decks;
- followers/following counts where appropriate;
- licenses;
- verification placeholder only if a real admin process exists.

For minors:

- pseudonymous by default;
- no school/location/external links;
- under-13 profile not public;
- teen public profile rules configurable and conservative.

Creator ownership is account-level; learner schedules remain private.

## 9. Search and discovery

Implement Postgres FTS/trigram-based discovery:

- indexed public title/description/tags/terms only;
- subject;
- language;
- card type;
- card count;
- license;
- creator;
- rating;
- recency;
- verified/curated when real;
- pagination/cursor;
- typo tolerance;
- empty/no-result states.

Ranking combines:

- query relevance;
- quality/completeness;
- saves/follows;
- rating with Bayesian smoothing;
- study completion aggregate only when privacy-safe;
- recency;
- report/moderation penalty;
- diversity/new-creator opportunity.

Do not index private/unlisted/password content in public search.

## 10. Ratings, favorites, and quality

Implement:

- favorite/save;
- one rating per eligible account;
- update/delete rating;
- rating text optional only with moderation;
- anti-abuse limits;
- Bayesian aggregate;
- content quality indicators;
- creator cannot rate own deck;
- public view count with privacy-preserving aggregation and bot filtering where practical.

## 11. Moderation and safety

Build a real moderation workflow:

- report deck, note, comment, creator, nickname;
- categories;
- optional evidence;
- rate limits;
- duplicate aggregation;
- case queue;
- assign moderator;
- hide/restrict/remove/restore;
- warn/suspend account capability;
- audit reason;
- appeal state;
- user block;
- safe-name filter;
- prohibited personal information warnings;
- child publication approval queue.

Do not depend on paid AI moderation. Use local filtering and human/admin queue. Optional provider hooks can come later.

Create an admin interface protected by an application capability stored in trusted app metadata/database, never a client-editable flag.

## 12. Copyright and licensing

Implement:

- license choice on publish;
- attribution display;
- fork permission derived from license/owner setting;
- source lineage;
- notice form;
- complainant/contact data stored privately;
- counter-notice workflow;
- case status;
- takedown/hide action;
- repeat-infringer counter;
- audit;
- owner-facing policy templates marked for legal review.

Do not claim the generated template is legal advice.

## 13. Public embed

Implement read-only embeddable deck preview:

- iframe/embed route;
- allowed origin configuration;
- safe CSP/frame ancestors;
- light/dark;
- card flip;
- no private data;
- attribution;
- report link;
- sign-in/open-full-app CTA;
- no persistent cross-site tracking;
- no arbitrary parent messaging.

## 14. UI

Build:

- share dialog;
- member management;
- link management;
- publish settings;
- license choice;
- fork choice;
- source update review;
- version timeline/diff;
- collaborative presence;
- suggestion review;
- discovery;
- creator profile;
- favorites;
- ratings;
- report/block;
- moderation admin;
- copyright workflow.

All states need mobile and accessibility support.

## 15. Tests

Add:

- exhaustive permission/RLS matrix;
- token/password link security;
- revoked link;
- source fork/merge conflicts;
- version restore;
- Yjs two-user/offline/reconnect;
- permission revocation during collaboration;
- public search privacy;
- ranking determinism;
- rating abuse constraints;
- child restrictions;
- moderation actions/audit;
- copyright privacy;
- embed CSP/data exposure;
- Playwright multi-context collaboration;
- accessibility.

## Required acceptance criteria

- content can be privately shared, unlisted, password protected, or public;
- roles work at server/database boundaries;
- schedules/mastery never leak with content;
- independent and linked forks work with source updates;
- realtime editing merges and persists safely;
- version restore creates a new revision;
- public search excludes nonpublic content;
- child social/public restrictions are enforced;
- moderation and copyright workflows store real cases;
- embed is safe;
- tests and production build pass;
- documentation explains permissions, licenses, moderation, and provider quotas.

Do not implement classes/assignments here beyond permission hooks.

<!-- END 07_SHARING_COLLABORATION_DISCOVERY.md -->

---

<!-- BEGIN 08_CLASSES_ASSIGNMENTS_AND_REPORTS.md -->

# Phase 8 — Classes, rosters, assignments, accommodations, completion, grading, and reports

Read the content-sharing, learner-profile, practice, SRS, and game interface code. Implement classroom capabilities as an optional layer over the consumer product, not as the application’s organizing center.

## Objective

Allow any eligible user to create a class, invite learners, assign decks/study/test/game activities, provide accommodations, monitor completion, and download clear reports without gaining access to unrelated private study data.

## 1. Database schema

Create additive migrations for:

- `classes`;
- `class_members`;
- `class_invites`;
- `class_join_codes`;
- `class_content`;
- `assignments`;
- `assignment_targets`;
- `assignment_accommodations`;
- `assignment_attempts`;
- `assignment_item_results`;
- `assignment_manual_grades`;
- `assignment_extensions`;
- `curriculum_standards`;
- `content_standard_links`;
- `class_announcements` only if implemented without chat;
- `notification_preferences` and `notifications` for real in-app notifications.

Roles:

- owner;
- instructor;
- assistant;
- learner.

Statuses and timestamps must support draft, scheduled, open, paused, closed, archived.

RLS must ensure:

- class staff see class-scoped reports only;
- learners see own attempts and class information;
- no teacher access to personal decks or unrelated personal SRS history;
- guardian access follows learner-profile rules;
- public/guest users cannot enumerate classes;
- invite codes are hashed/limited/expiring.

## 2. Class creation and roster

Implement:

- create/rename/archive/delete class;
- description, subject, color/icon;
- join code/link;
- invite specific account;
- CSV roster import using pseudonymous identifiers where appropriate;
- approve/remove learner;
- change staff roles;
- transfer ownership;
- safe-name mode;
- class content library;
- member search;
- child and school-managed profile path in local child-enabled profile;
- no requirement that consumer accounts become “teacher accounts.”

For a school-managed child profile, represent the school authorization context but keep the production launch gate and legal-review warning.

## 3. Assignments

An assignment can target:

- deck or selected tags/cards;
- due-review goal;
- Learn mastery goal;
- Write practice;
- generated Test;
- Match/Spell/Diagram;
- a game mode once games exist;
- a custom activity sequence.

Settings:

- title/instructions;
- assigned class/individuals;
- start, due, close;
- time zone;
- attempt limit;
- target card count/mastery/accuracy;
- whole-test/per-question timer;
- randomization;
- answer release;
- late policy;
- required or optional;
- allow resume;
- leaderboard visibility;
- serious mode;
- guest completion policy;
- schedule-impact policy;
- accommodations;
- versioned content snapshot.

Assignments use a content version/snapshot so later deck edits do not silently change an active graded assignment. Staff may intentionally update with a visible version change.

## 4. SRS assignment semantics

Implement clear choices:

- **Practice only:** assignment attempts never change FSRS.
- **Qualified review:** eligible written recalls can offer explicit ratings to the learner.
- **Due review goal:** completion is based on canonical reviews the learner performs; staff sees completion/aggregate accuracy, not private unrelated history.

Never let a teacher directly alter a learner’s personal FSRS rating. A class assignment may provide a recommended schedule preset but cannot silently replace personal settings.

## 5. Accommodations

Per class or assignment/learner:

- extra time percentage;
- untimed;
- read-aloud/TTS;
- larger text;
- reduced motion;
- serious mode;
- fewer answer choices;
- keyboard-only/drag alternative;
- no leaderboard;
- alternate question type;
- allow pauses;
- extended due date;
- hide speed bonus.

Accommodations must not reduce XP or label a learner publicly. Reports expose only to authorized staff and learner/guardian.

## 6. Attempt lifecycle

Implement:

- start;
- resume;
- save;
- submit;
- auto-submit only with clear timer behavior;
- late;
- reopen;
- extension;
- retake;
- manual grade needed;
- graded;
- returned;
- excused.

Use idempotent submissions and content snapshot IDs. Offline attempts queue and reconcile through the existing sync engine.

## 7. Manual grading

For open, drawing, pronunciation, and teacher-reviewed answers:

- queue by assignment;
- rubric/point range;
- comment visible to learner;
- bulk navigation;
- keyboard shortcuts;
- save draft;
- finalize;
- regrade audit;
- no private direct messaging.

AI-assisted draft grading may be added later but can never auto-finalize without configured policy.

## 8. Reports

Implement views:

- assignment overview;
- completion;
- class accuracy;
- score;
- time;
- attempts;
- learner;
- question/card;
- concept/tag;
- standard;
- manual grading queue;
- longitudinal class trend where enough data exists.

Metrics:

- assigned/started/completed;
- on-time/late;
- accuracy and partial credit;
- game score separately;
- average/median response time;
- hints/retries;
- most missed questions;
- mastery change;
- question quality signal;
- accommodations applied;
- version used.

Provide:

- filters;
- sortable accessible tables;
- charts with table/text alternatives;
- CSV export;
- print/PDF-friendly report;
- share report with another authorized instructor;
- guardian/learner summary;
- no exposure of unrelated personal data.

## 9. Standards and tagging

Create optional standards taxonomy:

- custom standards;
- imported simple CSV taxonomy;
- link deck/note/card;
- report by standard;
- no paid standards API required;
- source/version metadata;
- avoid claiming official certification.

## 10. Notifications

Implement in-app notifications for:

- class invite;
- assignment published;
- due soon;
- extension;
- grade returned;
- class role change.

Email adapter is optional and disabled without configuration. Child notifications are conservative and guardian-configurable. Do not implement engagement-spam push notifications.

## 11. UI

Build:

- class dashboard;
- roster;
- join;
- content;
- assignment builder;
- learner assignment list;
- attempt launch;
- accommodation editor;
- grading;
- reports;
- export/print;
- empty/error/offline states.

The consumer dashboard should show assignments but remain centered on personal study.

## 12. Tests

Add:

- class role/RLS matrix;
- invite expiration/reuse;
- child/school profile restrictions;
- assignment content snapshot;
- schedule semantics;
- accommodations;
- timer/resume/offline;
- duplicate submission;
- manual grading audit;
- report privacy;
- CSV/print;
- staff role changes;
- archived class;
- Playwright instructor and learner contexts;
- accessibility.

## Required acceptance criteria

- users can create and join classes;
- assignments can target all implemented study modes;
- active assignments use stable content versions;
- accommodations affect the experience and do not penalize progression;
- teachers see assignment-scoped data only;
- manual grading is auditable;
- reports separate accuracy, mastery, score, and completion;
- CSV and print exports work;
- offline attempt resume works;
- tests, RLS, E2E, and production build pass;
- documentation clearly states the limits of school/child launch readiness.

Do not build the realtime game implementation here; use the existing game assignment interface and enable game targets after Phase 9.

<!-- END 08_CLASSES_ASSIGNMENTS_AND_REPORTS.md -->

---

<!-- BEGIN 09_REALTIME_GAME_PLATFORM.md -->

# Phase 9 — Authoritative realtime game platform, guest rooms, initial modes, reports, and recovery

Read `AGENTS.md`, the blueprint, architecture decisions, implementation status, all existing content/study/class code, and the current Realtime abstractions before changing anything. Implement the game platform as a real shared engine over reusable deck content. Do not build a collection of disconnected page-specific demos.

## Objective

Deliver a production-oriented solo, asynchronous, and realtime multiplayer platform that can turn eligible deck content into engaging games. The server/database is authoritative for joins, assigned questions, accepted answers, scores, power-ups, host commands, and final results. Clients render optimistic presentation only. Academic correctness, game score, mastery, and FSRS state remain separate.

Core study and deck use must continue to work when Realtime is unavailable or the room quota is reached.

## 1. Architecture and packages

Create or complete real APIs in:

- `packages/game-engine` for mode-neutral deterministic state, seeded randomization, reducers, scoring, question selection, answer adjudication contracts, and replay;
- `packages/realtime` for provider-neutral rooms, channels, presence, sequence recovery, reconnect, authorization, and message schemas;
- `packages/domain` for game/session/report entities;
- `packages/database` for typed repositories and authorized commands;
- `packages/ui` for reusable lobby, player, host, scoreboard, question, power-up, results, and accessibility components;
- `apps/web` for routes, Server Actions/Route Handlers, screens, and Realtime clients.

Do not let mode code import React, Supabase clients, or wall-clock globals. Inject time, seeded PRNG, and IDs so reducers are deterministic and replayable.

Define stable interfaces such as:

```ts
interface GameModeDefinition<Config, State, Event, PublicView> {
  id: string;
  version: number;
  configSchema: ZodType<Config>;
  initialState(input: GameStartInput<Config>): State;
  reduce(state: State, event: AuthoritativeGameEvent<Event>): State;
  getPublicView(state: State, viewer: GameViewer): PublicView;
  getEndResult(state: State): GameEndResult | null;
  mapToReport(state: State): GameReportProjection;
}
```

Use versioned registries. A recorded session must identify the exact mode/rules/scoring/content versions needed for replay and reports.

## 2. Database schema

Add additive migrations for the canonical game model, adapting names only when existing schema already owns them:

- `game_modes` or a code registry projection;
- `game_sessions`;
- `game_session_content_snapshots`;
- `game_join_codes`;
- `game_participants`;
- `game_participant_sessions` for reconnect/device presence when useful;
- `game_teams`;
- `game_team_members`;
- `game_rounds`;
- `game_question_instances`;
- `game_answer_submissions`;
- `game_score_events`;
- `game_resource_events`;
- `game_powerup_events`;
- `game_events` for critical authoritative events;
- `game_snapshots`;
- `game_host_commands`;
- `game_reactions` with short retention;
- `game_room_bans`;
- `game_reports` and report projections;
- `daily_challenge_definitions` and attempts where needed;
- retention/cleanup job records.

Requirements:

- immutable content snapshot or snapshot reference for every started session;
- protocol, mode, config, content, scoring, and reducer versions;
- sortable authoritative sequence per game;
- idempotency keys on joins, commands, and answers;
- accepted/rejected answer status with reason code;
- correctness and partial-credit fields separate from score delta;
- integer score/resource ledgers, not mutable client-owned totals;
- server timestamps and deadline timestamps;
- reconnect token hashes only, never raw tokens;
- short-lived guest identity metadata with documented cleanup;
- indexes for join-code lookup, active rooms, participant reconnect, sequence reads, reports, and retention;
- no public table that permits room, participant, or join-code enumeration.

Use atomic Postgres RPCs or equally strong server-side transactions for join, start, answer acceptance, host command, power-up use, and game completion. Set explicit `search_path`, validate authorization, and test concurrent calls.

## 3. Authorization and RLS

Implement and test policies for:

- host/owner;
- co-host or authorized class staff;
- authenticated participant;
- ephemeral guest participant;
- team member;
- spectator;
- class member;
- blocked/kicked/banned participant;
- expired room;
- public versus private room;
- parent/guardian context where applicable;
- service/cleanup worker.

Rules:

- a participant receives only the public projection and private question/answer data assigned to that participant;
- clients cannot write score totals, correctness, deadlines, teams, inventory, or authoritative events directly;
- spectators cannot submit answers or infer hidden answers;
- team-private state is visible only to authorized teammates/host;
- a guest claim authorizes one room/participant and expires quickly;
- host capability is checked server-side for every command;
- game reports obey class/content permissions and do not expose unrelated personal study data;
- child profiles never expose real names or private profile fields through room payloads.

Add SQL policy tests and application-level capability tests.

## 4. Realtime provider and event protocol

Use authorized private Supabase Realtime Broadcast channels for compact ephemeral events and Presence only for low-frequency connected-state information. Persist critical transitions in Postgres. Do not broadcast timer ticks; broadcast a server deadline and let clients derive display time.

Implement a versioned protocol containing at least:

```text
room.created
room.locked
room.unlocked
participant.joined
participant.left
participant.reconnected
participant.kicked
participant.banned
participant.role_changed
team.changed
game.started
round.started
question.assigned
answer.received
answer.accepted
answer.rejected
score.updated
streak.updated
resource.updated
powerup.granted
powerup.used
reaction.sent
host.command
game.paused
game.resumed
round.ended
game.ended
snapshot.available
room.closed
```

Every envelope includes:

- protocol version;
- game/session ID;
- event ID;
- authoritative sequence;
- server timestamp;
- safe actor reference;
- event type;
- schema-validated payload;
- optional correlation/idempotency ID.

Create shared Zod schemas and exhaustive event handling. Reject unknown versions safely, log a diagnostic without secrets, and trigger snapshot recovery when a sequence gap is detected.

## 5. Snapshot, reconnect, and recovery

Implement a reconnect protocol:

1. client retains its participant ID and single-use/rotating reconnect credential in safe session storage;
2. server validates room, participant, hash, expiry, and ban state;
3. client requests the latest authorized snapshot and events after its last sequence;
4. server rotates the reconnect credential where practical;
5. client reconstructs state through the deterministic reducer;
6. duplicate answer/command submissions resolve idempotently;
7. expired games open in read-only results mode when authorized.

Persist snapshots at game start, round boundaries, material host changes, configurable event intervals, and game end. Compact or expire raw low-value events according to retention while preserving the report and score ledger.

Handle:

- tab refresh;
- brief network loss;
- host disconnect;
- participant device switch;
- duplicate tabs;
- late join;
- room full;
- Realtime connection limit reached;
- Postgres write succeeds but Broadcast fails;
- Broadcast arrives before local fetch completes;
- clock skew;
- session pause/resume;
- server restart.

## 6. Guest join and lobby

Implement a polished join flow at `/join` and `/join/[code]`:

- human-friendly high-entropy join code with collision handling;
- normalized input and rate-limited lookup;
- room preview containing only safe fields;
- optional generated nickname or filtered custom nickname;
- safe-name mode;
- generated avatar/icon without personal photos;
- optional Supabase anonymous auth or a signed room-scoped ephemeral claim behind an adapter;
- explicit guest privacy notice;
- host approval option;
- team choice or auto-balance;
- spectator option when enabled;
- reconnect support;
- guest cleanup within configured retention;
- no account needed to join an enabled room;
- account conversion after the game is optional but never dark-patterned.

Lobby features:

- host-ready controls;
- participant list with connection status;
- team management;
- capacity indicator;
- lock/unlock;
- safe names;
- remove/ban;
- reaction mute;
- late-join policy;
- spectators;
- accommodations/serious mode;
- game rules preview;
- accessible “copy code/link”;
- QR code generated locally, without an external tracking service.

Unrestricted text chat and direct messages are out of scope and must not be added. Implement curated, rate-limited reactions/phrases only.

## 7. Game creation and configuration

Any content owner, host, or authorized class staff member can create a game from a deck, selected tags, assignment snapshot, or supported question subset.

Configuration supports:

- mode;
- solo, synchronous, self-paced, team, or asynchronous variant when the mode allows it;
- public/private/unlisted room;
- maximum players, capped by `MAX_GAME_PLAYERS`;
- guests;
- spectators;
- late join;
- manual/automatic team assignment;
- question count;
- question selection and card-direction rules;
- multiple-choice/written/mixed question types;
- answer retries;
- whole-game/per-question timers;
- randomized order and options;
- same question for all versus individualized assignment;
- power-ups;
- speed influence;
- streak behavior;
- leaderboard visibility;
- serious/reduced-stimulation mode;
- assignment/report linkage;
- accessibility accommodations;
- content language and TTS settings;
- deterministic seed;
- end condition.

Validate incompatible combinations and explain them in the UI rather than failing at start.

## 8. Question eligibility and answer adjudication

Use the existing content and grading engines. Build a question adapter that maps supported cards/notes to game-safe question instances. Preserve the source card/note/version reference for reports, but never leak the answer before adjudication.

Rules:

- use manually authored distractors when available;
- deterministic deck-derived distractors otherwise;
- do not require cloud AI;
- avoid sibling answers that trivially reveal the correct option;
- deduplicate choices after normalization;
- support partial credit only for compatible modes/types;
- accessibility accommodations can reduce choice count or replace drag interactions;
- question-instance tokens are server issued and expire;
- one accepted answer per participant/question unless retries are explicitly enabled;
- server computes correctness using the shared grading package;
- a game submission never becomes an FSRS review automatically;
- optional post-game “review missed cards” creates a practice/custom-study session, not retroactive ratings.

## 9. Scoring and streaks

Implement a versioned scoring strategy with the blueprint default:

```text
base = 1000 * correctness
speedComponent = clamp((deadline - answerTime) / allowedTime, 0, 1)
speedMultiplier = 0.75 + 0.25 * speedComponent
streakMultiplier = 1 + min(streak, 10) * 0.03
difficultyMultiplier = clamp(questionDifficulty, 0.9, 1.2)
score = floor(base * speedMultiplier * streakMultiplier * difficultyMultiplier)
```

Requirements:

- incorrect answers earn no correctness score;
- speed never outweighs accuracy;
- submitted-at time is server-clamped with documented latency handling;
- accessibility accommodations may remove speed scoring without reducing academic credit or persistent XP fairness;
- mode overrides are explicit and versioned;
- every score change is derived from an append-only score event;
- scoreboard is a projection that can be rebuilt;
- ties use deterministic, documented rules;
- score, accuracy, time, streak, mastery, XP, and SRS remain separate fields.

## 10. Power-ups

Implement the mode-neutral power-up framework and an initial set:

- 50/50;
- erase one distractor;
- retry shield;
- score x2 for a bounded eligible event;
- streak shield;
- time freeze/extension represented server-side;
- gift to teammate/player where allowed;
- risk/reward double jeopardy.

Each power-up has:

- registry definition/version;
- eligibility;
- grant rule;
- target rule;
- duration/consumption;
- reducer event;
- accessible explanation;
- visual treatment;
- serious-mode treatment;
- audit/ledger row;
- abuse tests.

Power-ups affect only game score/resources/presentation, never correctness, mastery, assignment academic score, or FSRS scheduling. Do not add paid or pay-to-win acquisition.

## 11. Host controls

Implement server-authorized controls:

- start;
- pause/resume;
- end;
- lock/unlock;
- enable/disable late join;
- kick/ban;
- mute reactions;
- rename to generated safe name;
- move/balance teams;
- promote co-host where policy permits;
- toggle spectator;
- skip/replace an invalid question with report annotation;
- extend a deadline;
- enable/disable power-ups;
- show/hide leaderboard;
- serious mode;
- accommodations;
- download report.

Define host-disconnect policy: a co-host takes over when present; otherwise allow a configurable grace period and server-driven continuation/pause. Never let an ordinary participant acquire host rights through a client event.

## 12. Initial game modes

Implement all of these as registered, tested modes using the common engine—not as stubs:

1. **Classic Quiz** — synchronized or self-paced, solo/individual/team.
2. **Speed Round** — rapid sequence with bounded speed multiplier and clean transition timing.
3. **Match Race** — term/definition matching with penalties for incorrect matches and a keyboard/list alternative.
4. **Streak Challenge** — streak-focused run with shields and accuracy-first ranking.
5. **Survival** — limited lives, progressive difficulty, no humiliating elimination display; eliminated players can spectate or practice.
6. **Mastery Peak** — individual and optional team progress toward a mastery-like session target; does not write canonical mastery unless the ordinary practice qualification policy applies.
7. **Team Relay** — controlled turns or contribution windows with reconnect/absence handling.
8. **Daily Challenge** — date/locale-aware seeded solo challenge, one canonical scored run plus practice reruns, private/friend/class ranking only.
9. **Head-to-Head Duel** — short synchronized match with fair same-content policy and disconnect resolution.
10. **Host-Paced Classroom** — host advances the same question for everyone, with answer reveal and discussion pause.

Every mode must include:

- rules and examples;
- typed configuration schema;
- deterministic reducer;
- end conditions;
- question compatibility declaration;
- reconnect behavior;
- solo/local fallback where sensible;
- keyboard and touch controls;
- reduced-motion/serious alternative;
- results mapping;
- unit/property/E2E tests.

Do not implement the advanced strategy games owned by Phase 10 in this phase.

## 13. Reports and post-game experience

At game end, create an immutable report projection containing:

- participants/teams using safe display identities;
- completion/disconnect state;
- game score;
- academic accuracy and partial credit;
- answer count;
- response-time summary;
- streaks;
- question/card/concept performance;
- most missed concepts;
- power-up/resource summary separate from academics;
- skipped/invalid question annotations;
- assignment completion mapping;
- content/mode/scoring versions;
- suspicious-event flags as signals, never automatic guilt.

Build:

- animated but reduced-motion-safe podium/summary;
- personal recap before public standings;
- accuracy/improvement/team views, not only speed rank;
- “study missed cards” action;
- rematch with a new seed;
- host report dashboard;
- CSV export;
- print/PDF-friendly report;
- class/assignment report integration;
- privacy-aware participant labels;
- report retention and deletion behavior.

Guests see their own result during the session without gaining permanent access to class reports.

## 14. Anti-cheating and abuse controls

Implement proportionate protections:

- server-issued question-instance token;
- server deadlines;
- one accepted submission/idempotency;
- sequence validation;
- duplicate-tab/device rules;
- impossible-latency and impossible-volume signals;
- rate limits for join, name change, answer, command, reaction, reconnect;
- optional disclosed focus/visibility/fullscreen signals;
- normalized name filtering;
- room ban list;
- no camera/microphone surveillance;
- no browser fingerprinting;
- no automatic punitive action from a heuristic alone.

Record privacy-minimized audit information and expose a host-readable explanation for flags.

## 15. Free-tier and graceful-degradation behavior

Default to 40 active players per room and read all limits from validated configuration. Minimize Realtime usage:

- deadline timestamps instead of timer ticks;
- deltas instead of full snapshots;
- Presence only when useful;
- coalesce cosmetic updates;
- disable cursor-like/nonessential presence first;
- keep authoritative events compact;
- batch safe report writes;
- measure approximate message count in load tests.

When capacity is unavailable:

- prevent starting an over-cap room before participants invest time;
- show a clear owner/host message;
- offer solo/asynchronous fallback where possible;
- never corrupt an active game;
- keep results and exports available;
- do not claim that free-tier limits guarantee a particular load.

## 16. UI and visual quality

Build premium, original responsive experiences for:

- game picker and mode previews;
- create/configure flow;
- lobby;
- host console;
- participant screen;
- spectator screen;
- synchronized question reveal;
- self-paced question flow;
- team status;
- power-up tray/targeting;
- scoreboard;
- pause/reconnect/offline/full-room states;
- results/podium/recap;
- reports.

Use the established design tokens. Motion must communicate state, not delay input. Respect reduced motion and serious mode. Keep controls reachable on phones, avoid layout shift, use safe-area insets, and give every drag/timed interaction an accessible alternative. Announce time, answer status, score changes, and round transitions without overwhelming screen-reader users.

## 17. Tests and verification

Add meaningful automated coverage:

- reducer unit and property tests for deterministic replay;
- score, ties, streaks, deadlines, partial credit, and accommodations;
- power-up invariants;
- question eligibility/no answer leakage;
- concurrent answer idempotency;
- join-code collision/expiry/rate limits;
- guest/reconnect/rotation/ban;
- host authorization;
- RLS matrix;
- sequence gaps/snapshot recovery;
- host disconnect;
- Realtime failure after DB commit;
- all ten modes and end conditions;
- assignment/report mapping;
- child/safe-name/social restrictions;
- axe/keyboard/reduced-motion checks;
- Playwright multi-context host, players, spectator, late join, reconnect, kick, teams, and game end;
- k6 or equivalent room simulations at documented free-beta targets using a safe local/test environment;
- production build.

Use deterministic clocks and seeds. Do not make CI depend on paid services. Document any true provider behavior that is implemented but not live-verified without credentials.

## Required acceptance criteria

- a host can create a game from real deck content and configure a supported mode;
- guests can join by code without a permanent account when enabled;
- authenticated and guest participants can reconnect safely;
- the server/database—not the client—adjudicates answers, scoring, power-ups, host commands, and completion;
- all ten initial modes are actually playable and share the common engine;
- teams, spectators, late join, safe names, curated reactions, and host controls work;
- academic accuracy is visibly separate from game score;
- no game action silently changes FSRS;
- reports and CSV/print exports work and integrate with assignments;
- sequence recovery and idempotency prevent duplicate scoring;
- room limits and Realtime failure degrade gracefully;
- RLS, database, unit, E2E, accessibility, load, and production-build checks pass;
- implementation status, data model, event protocol, setup, and operating documentation are updated with exact evidence.

<!-- END 09_REALTIME_GAME_PLATFORM.md -->

---

<!-- BEGIN 10_ADVANCED_GAMES_AND_GAMIFICATION.md -->

# Phase 10 — Advanced strategy games, persistent progression, quests, cosmetics, seasons, and fair leaderboards

Read the completed game engine, event protocol, reports, SRS/mastery separation, identity/privacy model, and design system. Extend the platform through registered modules and append-only progression ledgers. Do not fork the realtime architecture or duplicate content/question logic.

## Objective

Deliver a compelling long-term game ecosystem around real learning: advanced strategy modes, solo progression, asynchronous challenges, XP, meaningful study streaks, achievements, quests, earnable cosmetic currency, inventory, and privacy-aware leaderboards. Gamification must make studying exciting without rewarding guessing, excluding accessible users, manipulating children, enabling pay-to-win, or corrupting academic/SRS data.

The beta contains no purchases. Design future monetization seams without adding checkout, loot boxes, paid power, ads, or dark patterns.

## 1. Architectural boundaries

Extend `packages/game-engine` with mode plugins and shared systems:

- deterministic resource/economy primitives;
- grid/board primitives where useful;
- wave and encounter engines;
- target selection;
- status effects;
- upgrade definitions;
- campaign progression contracts;
- asynchronous challenge verification;
- renderer-neutral public projections.

Add or complete:

- `packages/progression` only if it has real consumers and tests; otherwise keep progression in an appropriate domain package;
- game-renderer interface supporting DOM/CSS first and Canvas/WebGL only for modes that materially need it;
- dynamic loading so advanced renderers do not inflate normal study and dashboard bundles;
- deterministic seeded simulation with no renderer-dependent rules;
- versioned registries for modes, items, cosmetics, achievements, quests, and seasons.

The authoritative reducer remains capable of headless replay. Rendering receives a sanitized view model and emits intent commands; it never owns score, health, inventory, board truth, or answers.

## 2. Database schema

Create additive migrations, reconciling existing tables rather than duplicating them:

- `progression_accounts` or per-learner projection;
- `xp_events`;
- `level_definitions`;
- `streak_events` and `streak_projections`;
- `achievement_definitions`;
- `achievement_progress`;
- `achievement_unlock_events`;
- `quest_definitions`;
- `quest_instances`;
- `quest_progress_events`;
- `currency_events`;
- `catalog_items`;
- `inventory_events` and inventory projection;
- `loadouts`;
- `season_definitions`;
- `season_participation`;
- `leaderboard_definitions`;
- `leaderboard_entries` or materialized projections;
- `friend_connections` only if the existing social model safely supports mutual/guardian-aware relationships;
- `campaign_definitions`;
- `campaign_progress_events`;
- `challenge_definitions`;
- `challenge_attempts`;
- `challenge_invites`;
- `reward_claims`;
- `progression_adjustments` for compensating/admin corrections;
- anti-farming counters/projections where needed.

Requirements:

- XP, currency, rewards, inventory, and campaign progress use append-only or compensating ledgers;
- unique source-event keys prevent double awards;
- definitions are versioned and can be retired without invalidating history;
- no floating-point currency;
- projections are rebuildable;
- season boundaries use UTC with clear display zones;
- leaderboard eligibility and privacy are explicit;
- child, class, room, friend, and public scopes are distinguishable;
- indexes support daily award caps, projections, season rank, inventory, quests, and replay;
- retention preserves earned ownership while allowing raw telemetry minimization;
- all sensitive mutations occur through authorized transactions/RPCs.

## 3. Persistent progression principles

Implement one progression service that consumes trusted domain events, not arbitrary client claims. Eligible source events include:

- canonical due reviews;
- qualified written recall;
- reaching new mastery thresholds;
- completing meaningful study goals;
- assignment completion;
- validated game participation/performance;
- challenge completion;
- useful creator contribution after anti-abuse checks.

Never award from:

- opening the app;
- repeatedly revealing answers without retrieval;
- self-authored trivial content loops;
- repeated retries beyond configured diminishing returns;
- client-supplied score totals;
- deleted/replayed offline events with duplicate IDs;
- cosmetic clicks or time spent idle.

Separate progression presentation from academic truth. A level is a motivation indicator, not a claim of subject mastery.

## 4. XP and levels

Implement transparent versioned award rules:

- base XP by meaningful activity;
- quality multiplier for recall/accuracy when appropriate;
- smaller participation XP so less-skilled learners are not excluded;
- first-completion and improvement bonuses;
- diminishing returns for repeated content/mode farming;
- daily soft cap and configurable hard abuse cap;
- no penalty for reduced-motion, untimed, TTS, fewer choices, or other accommodations;
- no speed-exclusive XP;
- no XP loss for ordinary mistakes;
- compensating event for invalidated/duplicate awards rather than history deletion.

Build:

- level curve defined in data/code with tests;
- progress-to-next-level UI;
- XP receipt/details showing why it was earned;
- daily/weekly summary;
- serious mode that minimizes celebration;
- owner/admin diagnostics for duplicate/failed event processing.

Do not use manipulative endless bars, artificial near-miss purchase prompts, or notifications designed to shame a learner.

## 5. Meaningful daily study streak

A day counts only when a learner reaches a configurable meaningful threshold, such as:

- completes a minimum number of genuine SRS reviews;
- completes a minimum amount of active-answer study;
- reaches a mastery/session goal;
- completes an assignment;
- completes a validated challenge/game with enough genuine answers.

Implement:

- per-learner IANA time zone and study-day cutoff;
- preview of progress toward today’s streak;
- current, longest, and calendar history;
- idempotent daily qualification;
- time-zone change abuse protections without punishing legitimate travel;
- optional limited streak repair earned through study, not purchased in beta;
- grace behavior for service outage documented and auditable;
- guardian/serious-mode control for celebration intensity;
- no punitive messaging or public exposure by default.

Opening the app or leaving a timer running never qualifies.

## 6. Achievements

Create a data-driven achievement registry with categories:

- study consistency;
- review milestones;
- mastery/improvement;
- content creation quality;
- collaboration;
- assignment completion;
- mode-specific skill;
- accessibility-inclusive alternatives;
- community contribution where safely measurable.

Each achievement defines:

- stable key/version;
- localized title/description;
- criteria schema;
- hidden/visible state;
- progress metric;
- reward;
- icon token, not a hard-coded external asset;
- eligibility restrictions;
- retirement/migration behavior.

Avoid achievements for unhealthy session length, all-night usage, humiliating failure, excessive speed alone, spamming public content, or sharing personal data.

Unlock atomically and once. Notify accessibly. Provide a low-stimulation rendering. Add property tests for criteria and duplicate event delivery.

## 7. Daily and weekly quests

Implement a quest generator using trusted activity types and deterministic seeds. Quest examples:

- complete a small due-review goal;
- practice weak concepts;
- use written recall;
- improve accuracy relative to a personal baseline;
- finish a game without random guessing;
- create/revise a few quality cards;
- collaborate inside an authorized deck/class;
- complete an assignment before due date.

Rules:

- quests scale to account history and available content;
- always provide a non-speed alternative;
- never require social sharing, public posting, spending, ads, or cloud AI;
- do not assign impossible activities when a feature is disabled;
- allow one limited reroll without manipulation;
- use local date boundaries correctly;
- rewards claim idempotently or auto-claim with a clear receipt;
- child profiles receive conservative, privacy-safe quests;
- missed quests disappear without guilt-inducing loss language.

Build daily/weekly quest panels, completion animation, serious-mode display, and history.

## 8. Currency, catalog, cosmetics, and inventory

The beta currency is earned only. Implement:

- integer currency ledger;
- award/spend/refund/adjustment event types;
- idempotent transactions;
- catalog availability windows;
- inventory ownership projection;
- equip/unequip loadouts;
- preview;
- duplicate handling;
- refunds for retired/broken items;
- age-appropriate labels;
- serious mode that hides currency/catalog/cosmetics;
- configurable global disable switch.

Initial cosmetic categories:

- generated-avatar parts;
- profile frames;
- card backs;
- study table/background themes;
- game trails/effects with reduced-motion alternatives;
- podium poses/stickers;
- room banners;
- sound packs with mute controls;
- badges/titles.

Requirements:

- no random paid rewards, loot boxes, wagering, trading, cash value, scarcity pressure, or pay-to-win;
- no user-uploaded marketplace in this phase;
- cosmetics cannot obscure questions/answers or impair accessibility;
- effects have motion/flash/audio limits;
- all item assets are original, locally owned/licensed, or generated from project primitives;
- future commerce can plug into a separate entitlement interface but remains unimplemented and disabled.

## 9. Leaderboards and social ranking

Implement opt-in scoped leaderboards:

- personal best/history;
- private room;
- class;
- mutually approved friends, only if the safe relationship model exists;
- team;
- seasonal eligible-user leaderboard behind a disabled-by-default public feature flag.

Support ranking by:

- game score;
- accuracy;
- improvement;
- mastery progress;
- consistency;
- team contribution.

Privacy/safety:

- under-13 profiles never appear on global/public leaderboards;
- child profiles use class/private room/family-approved scopes only;
- pseudonyms and generated avatars by default;
- users can opt out and hide rank;
- blocked users do not appear to one another where feasible;
- class staff control class leaderboard visibility;
- accommodations do not create a visible label or ranking penalty;
- minimum cohort sizes where aggregate privacy matters;
- ties are deterministic and documented;
- suspicious runs may be withheld pending review, never publicly accused.

Prevent rank manipulation with unique verified source events, daily caps, content diversity checks, impossible-rate signals, and administrative compensating adjustments.

## 10. Seasons

Implement a configurable season framework without creating pressure to pay:

- start/end/grace dates;
- eligible scopes;
- season points from trusted activities;
- tier definitions;
- free reward track only in the beta;
- opt-in participation;
- private-by-default display;
- end-of-season snapshot and reward grant;
- archived history;
- no loss of purchased value because there is no purchasing;
- no child global participation;
- no countdown dark patterns or aggressive notifications.

Provide a seeded development season and an admin/owner setup workflow. A season may be disabled entirely without breaking XP, streaks, or games.

## 11. Advanced game modes

Implement each mode as a complete registered plugin over Phase 9 infrastructure. All use real deck questions, deterministic reducers, versioned configs, reports, reconnect, and accessibility alternatives.

### 11.1 Battle

- correct answers charge actions such as attack, shield, heal, cleanse, or team support;
- targets and effects are abstract/friendly rather than violent or harassing;
- no targeting based on protected/personal characteristics;
- eliminated players remain engaged through support/spectate/practice mechanics;
- strategy affects game resources/score, not correctness;
- team and free-for-all variants;
- prevent dogpiling with target cooldowns or defensive balancing;
- report academic and battle outcomes separately.

### 11.2 Economy

- correct answers earn bounded in-game income;
- players choose transparent upgrades with deterministic costs/effects;
- no real money, wagering, or randomized purchases;
- anti-snowball balancing and catch-up paths;
- solo, team, and asynchronous variants;
- end conditions based on score/objective/time;
- strategy log and accessible non-animated shop.

### 11.3 Territory

- teams claim/defend cells or zones through correct answers;
- board seed and adjacency rules are deterministic;
- simultaneous conflicts resolve through documented fair rules;
- color plus shape/pattern labels for accessibility;
- reconnect reconstructs the board;
- compact event deltas rather than full-board broadcast;
- keyboard/list alternative to map interaction.

### 11.4 Tower Defense

- correct answers generate placement/upgrade resources;
- deterministic waves and pathing;
- no answer activity while a visually inaccessible real-time action is required—support pause/turn windows or auto-resolution;
- tower, upgrade, enemy, wave, and map registries;
- difficulty scales without making questions unfair;
- solo first, cooperative team variant where stable;
- save/resume solo campaign run;
- Canvas renderer only if justified, with DOM/list strategy alternative.

### 11.5 Board Control

- turn or phase-based movement/area control driven by correct answers;
- deterministic board and action order;
- no physical dexterity advantage;
- compact rule set, tutorial, and projected legal actions;
- solo AI opponent may be deterministic/rule-based, not cloud AI;
- team and head-to-head variants;
- accessible grid/list controls.

### 11.6 Solo Campaign

- map/stage definitions;
- encounters, bosses, modifiers, and rewards;
- uses decks/tags selected by the learner;
- adapts question selection through existing mastery signals without writing false mastery;
- save/resume;
- three-star or equivalent goals based on accuracy/improvement, not only speed;
- practice failed stage without resource punishment;
- content/version migration strategy;
- offline-capable where dependencies allow.

### 11.7 Asynchronous Challenge

- host/player creates a seeded challenge from authorized content;
- shareable high-entropy invite with expiry and attempt policy;
- content snapshot and exact rule version;
- one canonical scored attempt plus unranked practice attempts;
- server-verifiable event/answer log;
- private/friend/class standings;
- late/offline upload policy with signed start/end windows;
- no public child exposure;
- report and rematch.

### 11.8 Assignment Game wrapper

- any compatible game mode can be attached to an assignment snapshot;
- assignment completion, academic score, game score, and XP are separate;
- accommodations override mode settings safely;
- teacher can disable leaderboard/power-ups/speed;
- report maps to existing class views;
- replay/rematch does not silently replace a submitted graded attempt.

## 12. Renderer and media behavior

Prefer semantic DOM/CSS for lobbies, questions, economy panels, cards, simple boards, and results. Use Canvas/WebGL only for advanced game scenes that need it, behind a lazy-loaded adapter.

Renderer contract:

- receives immutable public projection;
- emits validated intents;
- no database/network calls;
- deterministic interpolation from state/timestamps;
- pause/resume;
- resize and safe-area handling;
- keyboard/touch/gamepad only where accessible;
- reduced-motion mode;
- high-contrast/pattern mode;
- screen-reader summary and equivalent controls;
- audio manager with mute, volume, captions/text cues;
- disposes resources on route/session end;
- no hidden animation loop on inactive tabs.

Enforce performance budgets and avoid adding a heavy game dependency to the core dashboard bundle.

## 13. Fairness, healthy engagement, and child safeguards

Implement product-level guardrails:

- accuracy-first defaults;
- no negative currency/debt;
- no purchased advantages;
- no random monetized rewards;
- no public under-13 profiles/rankings;
- no direct messages or unrestricted chat;
- no shame messages for broken streaks or losses;
- configurable celebration intensity;
- session-duration reminders after a reasonable configurable period;
- quiet hours for optional notifications;
- guardian controls for social scopes, cosmetics, and celebration intensity;
- serious mode globally available;
- accommodations never reduce academic credit or progression opportunity;
- age-appropriate naming/content moderation for catalog assets.

Do not claim clinical or educational outcomes. Gamification is a motivational interface over real practice, not proof of learning.

## 14. UI and journeys

Build polished routes/components for:

- progression home/summary;
- XP receipt and history;
- study streak calendar/progress;
- achievements gallery/detail;
- daily/weekly quests;
- catalog;
- inventory/loadout;
- cosmetics preview;
- personal/class/private leaderboards;
- seasons;
- campaign map/stage setup/play/results;
- asynchronous challenge create/join/results;
- rules/tutorial/configuration/play/results for every advanced mode;
- serious/reduced-motion equivalents;
- owner/admin definition diagnostics where appropriate.

The main dashboard should surface a compact “continue learning” priority before optional games/progression. Avoid casino styling, deceptive scarcity, or clutter. Celebrations must be satisfying, brief, skippable, and accessible.

## 15. Tests and verification

Add:

- ledger idempotency/rebuild/compensation tests;
- concurrent reward claim/spend tests;
- XP caps/diminishing returns/content-farming tests;
- streak timezone, DST, study-day cutoff, travel, and outage tests;
- achievement/quest property tests;
- inventory ownership/equip/refund tests;
- season boundary tests;
- leaderboard privacy/tie/eligibility/block tests;
- child/guardian/class restrictions;
- deterministic reducer/replay tests for all advanced modes;
- board/wave/economy invariant/property tests;
- reconnect/save/resume/asynchronous verification;
- renderer disposal/bundle split/performance tests;
- keyboard/touch/reduced-motion/high-contrast/screen-reader tests;
- Playwright journeys for earning XP, streak, quest, cosmetic purchase with earned currency, equip, campaign, each advanced mode, challenge, assignment wrapper, and opt-out;
- load tests for compact territory/battle events and leaderboard projections;
- production build and bundle analysis.

Use fixed clocks/seeds and deterministic fixtures. Tests must prove game strategy cannot change academic correctness, mastery, or FSRS state.

## Required acceptance criteria

- all eight advanced mode/wrapper capabilities are implemented as real common-engine plugins;
- solo campaign and asynchronous challenges persist and recover correctly;
- XP, streaks, achievements, quests, currency, inventory, and rewards use trusted idempotent ledgers/events;
- meaningful streaks require real study behavior;
- cosmetics are earned-only, nonfunctional, accessible, and hideable;
- leaderboards are opt-in/scoped and exclude under-13 users from public/global scopes;
- accommodations and serious mode work across progression and games without penalty;
- no pay-to-win, ads, checkout, loot boxes, or dark patterns are introduced;
- advanced renderers are isolated and do not bloat ordinary study routes;
- reports keep academic and strategic results separate;
- RLS, database, property, E2E, accessibility, performance, load, and production-build checks pass;
- implementation status, event protocols, data model, rules registry, accessibility notes, and setup documentation are updated with exact evidence.

<!-- END 10_ADVANCED_GAMES_AND_GAMIFICATION.md -->

---

<!-- BEGIN 11_AI_FEATURES.md -->

# Phase 11 — Deterministic intelligence, local models, optional cloud AI, document-to-cards, semantic grading, and grounded tutor

Read the completed content/editor, grading, import/export, privacy, job, quota, collaboration, and child-profile systems. Implement AI as an optional, provider-neutral enhancement. The application’s core deck creation, studying, SRS, games, import/export, and grading must continue to work with every AI feature disabled and with no cloud credentials.

## Objective

Deliver a safe, transparent intelligence layer with four levels:

1. deterministic local algorithms that always work;
2. optional browser-local models when the device supports them;
3. optional server-side cloud providers, disabled until explicitly configured and reviewed;
4. a secondary, feature-flagged tutor grounded only in selected user material.

AI output is untrusted draft material. It must be validated, attributed to source chunks, reviewable, editable, and never silently published, graded as authoritative, or written into FSRS/mastery state.

## 1. Package and provider architecture

Create or complete `packages/ai` with no React or direct database dependency. Define versioned contracts such as:

```ts
type AiCapability =
  | 'generate_cards'
  | 'generate_distractors'
  | 'generate_hints'
  | 'explain_answer'
  | 'rewrite_card'
  | 'translate'
  | 'quality_review'
  | 'semantic_grade'
  | 'summarize_source'
  | 'tutor';

interface AiProvider {
  id: string;
  capabilities: ReadonlySet<AiCapability>;
  health(): Promise<ProviderHealth>;
  estimate(input: AiRequest): Promise<UsageEstimate>;
  execute<T>(request: ValidatedAiRequest<T>): AsyncIterable<AiProviderEvent<T>>;
}
```

Add:

- provider registry and capability negotiation;
- strict per-capability Zod input/output schemas;
- normalized usage/cost units without assuming money is charged;
- timeout, cancellation, retry, and circuit-breaker behavior;
- deterministic mock provider for tests/dev;
- local deterministic provider;
- browser-local model adapter;
- optional Cloudflare Workers AI adapter or equivalent free-tier-capable adapter behind server/worker code;
- optional generic OpenAI-compatible/BYOK adapter for eligible adult users/owners, disabled by default;
- no provider hard-coded into domain logic;
- no provider key in the browser except an explicitly designed adult BYOK flow that stores it only in a secure server-side secret mechanism; prefer not to persist BYOK at all;
- structured logging with content/redaction boundaries;
- provider terms/review metadata and launch gate.

Do not make Gemini API the default for this mixed-age product. Do not automatically enable any provider merely because an environment variable exists; require an explicit provider enable flag and document that current terms/privacy must be reviewed.

## 2. Database schema and jobs

Create additive migrations, adapting existing job infrastructure:

- `ai_provider_configs` containing non-secret metadata/status only;
- `ai_feature_policies`;
- `ai_jobs`;
- `ai_job_inputs` or secure references, avoiding unnecessary duplication of source content;
- `ai_job_events`;
- `ai_job_outputs`;
- `ai_usage_events`;
- `ai_quota_windows` or projections;
- `ai_consents`/disclosures if not covered by the existing consent model;
- `ai_drafts`;
- `ai_draft_items`;
- `ai_source_documents`;
- `ai_source_chunks`;
- `ai_source_citations`;
- `ai_feedback`;
- `local_model_preferences`;
- retention/deletion state.

Requirements:

- tenant/profile/deck ownership on every job/draft/source;
- provider/model/capability/prompt-template/schema version;
- status state machine: draft, queued, running, awaiting_review, completed, failed, cancelled, expired, deleted;
- idempotency key and deduplication;
- bounded attempts/backoff;
- input/output content hashes;
- token/neuron/compute/request usage where supplied;
- no provider secret in Postgres rows exposed through the app;
- output remains a draft until an authorized user accepts it;
- source-to-output citations at chunk/card/note granularity;
- retention and deletion cascade compatible with privacy requests;
- indexes and RLS for owner, authorized collaborator, class staff in assignment-owned contexts, and worker;
- no child data visible to a generic worker beyond the exact approved job payload;
- server/worker claims the job atomically and handles duplicate execution safely.

Use a portable worker boundary. Local development must run jobs without paid infrastructure, either inline in a safe development mode or through `apps/worker`/Supabase-compatible functions. Long jobs must not assume unlimited Vercel request duration.

## 3. AI policy engine

Implement one server-side policy decision before any model call. Inputs include:

- deployment profile;
- authenticated account and active learner profile;
- age band/child status;
- guardian/school/consent context;
- capability;
- provider/model terms-review status;
- source visibility/sensitivity label;
- deck/class permissions;
- daily/account/global quota;
- feature flag;
- owner/admin disable switch;
- geographic/launch constraints where configured.

Outputs include allow/deny, permitted providers, redaction requirements, maximum size, disclosure text/version, review requirement, retention, and reason code.

Default rules:

- deterministic local features are broadly available;
- browser-local models require explicit model-download notice and device support;
- direct cloud prompts and cloud tutor are disabled for under-13 learner profiles;
- child identifiers, age, school, location, activity history, guardian data, and private profile metadata never enter provider prompts;
- an eligible adult/teacher may initiate generation over content they are authorized to process after disclosure;
- AI-generated material may be shared with learners only after human review;
- cloud semantic grading is opt-in and never the sole basis of a consequential class grade;
- private/restricted deck content is never sent without explicit action and policy permission;
- exhausted quota returns a clear local/manual alternative;
- no model call occurs from public preview crawling or in the background without user action.

Create policy matrix tests, not only UI conditions.

## 4. Layer 1 — deterministic local intelligence

Complete and unify always-available functionality:

- Unicode normalization;
- case/punctuation/whitespace options;
- accent-sensitive/insensitive comparison;
- aliases and accepted alternatives;
- required/forbidden keywords;
- ordered/unordered list matching;
- numeric tolerance;
- unit normalization/conversion for an allowlisted unit library;
- safe math-expression equivalence for supported syntax;
- typo distance with length/language-aware thresholds;
- stemming/token overlap where appropriate;
- deck-derived distractors with sibling/duplicate/leakage protection;
- duplicate detection with canonical hashes, trigram similarity, and field weighting;
- card-quality heuristics: non-atomic prompt, ambiguous pronoun, answer leakage, overly long answer, duplicate cloze, missing source, invalid media, low-quality distractors;
- rule-based cloze candidates;
- language detection;
- source coverage metrics;
- scheduler/mastery recommendations from existing engines;
- deterministic hints using progressively revealed answer structure when the card permits it.

Expose confidence and reasons. Users can override a practice grade with an audit event. Deterministic rules remain the default grading path even when cloud AI exists.

## 5. Layer 2 — optional browser-local models

Implement a progressive adapter, using a maintained browser ML runtime only when it meets bundle/security requirements. Capabilities may include:

- text embeddings;
- semantic similarity;
- duplicate clustering;
- concept grouping;
- lightweight summarization;
- supported local translation;
- optional speech/language assistance where browser APIs/models permit it.

Requirements:

- dynamic import; no model in the ordinary app bundle;
- capability detection for WebGPU/WASM/memory/storage;
- explicit model name, source/license, approximate download/storage size, and privacy explanation before download;
- user opt-in and cancel;
- progress, retry, pause where feasible;
- Cache Storage/IndexedDB management;
- delete downloaded models;
- no silent cellular-scale download;
- model integrity/version metadata;
- local processing indicator;
- worker thread/off-main-thread execution;
- timeout/memory failure fallback;
- reduced device mode;
- no claim that local similarity alone proves correctness;
- no local model requirement for tests/CI; use deterministic fixtures/mocks.

Local semantic grading may supplement deterministic grading but must display uncertainty and preserve user override.

## 6. Source ingestion pipeline

Build a reusable, secure source-to-draft pipeline for authorized inputs:

- pasted text;
- Markdown;
- plain text;
- PDF;
- DOCX;
- PPTX;
- images through optional local/server OCR adapter;
- audio through optional transcription adapter;
- supported webpage URL fetch;
- existing deck/notes;
- imported files already owned by the user.

Implement stages:

1. validate permission, type, size, quota, and policy;
2. MIME sniff rather than trust extension;
3. malware/file-bomb defenses appropriate to available tooling;
4. extract locally/server-side with open-source parsers where feasible;
5. sanitize and normalize text;
6. preserve page/slide/section/source-location metadata;
7. detect language and obvious corruption;
8. chunk with overlap and semantic/heading boundaries;
9. compute hashes and deduplicate;
10. show extracted preview and let the user exclude sections;
11. invoke deterministic or configured AI generation;
12. validate structured output;
13. map every generated item to source chunks;
14. place results in a review workspace;
15. accept/edit/reject/merge into a chosen note type/deck transactionally.

### URL fetching security

- allow only `http`/`https`;
- block localhost, link-local, private networks, cloud metadata addresses, and unsafe redirects;
- resolve/check DNS safely and re-check redirect targets;
- enforce response size, content type, timeout, and redirect count;
- do not execute page JavaScript;
- strip scripts/styles/trackers;
- respect authorization/copyright: no authenticated scraping, paywall bypass, or third-party login automation;
- show source URL/title/retrieval timestamp;
- make robots/terms limitations clear where relevant;
- rate limit.

### File safety

- reject encrypted/unsupported files with a helpful message;
- cap archive entries/uncompressed size/depth;
- never execute macros or embedded scripts;
- sanitize hyperlinks and HTML;
- extract images/media only when explicitly chosen and within quota;
- do not log raw private file contents.

## 7. Document-to-flashcard generation

Build an AI generation workspace supporting:

- target deck/new deck;
- subject/language/reading level;
- desired number/range;
- note/card types: basic, reversed, optional reverse, cloze, typed, multiple choice, multi-select, true/false, list, ordering, diagram candidate, audio candidate;
- difficulty distribution;
- focus/exclusion instructions;
- concise/atomic preference;
- source citation requirement;
- duplicate avoidance against target deck;
- tags and suggested concepts;
- custom note-type field mapping;
- no unsupported claims beyond source;
- answer/explanation separation.

Use structured output containing stable temporary IDs, fields, card-type proposal, accepted alternatives, grading rules, distractors, explanation, difficulty, tags, confidence, source chunk IDs, and warnings.

Review UI:

- source beside draft;
- accept/reject/edit/bulk actions;
- duplicate/quality warnings;
- merge with existing note;
- change card type;
- regenerate selected item only;
- compare revisions;
- keyboard workflow;
- accessible diff;
- save as private by default;
- no automatic public publishing;
- transaction summary and undo/version history.

For public or class content, require an authorized human confirmation that the material was reviewed.

## 8. Card assistance features

Implement optional actions in the editor and study result views:

- improve wording;
- make prompt atomic;
- simplify/expand explanation;
- generate accepted aliases;
- generate manual distractors;
- generate hints;
- propose clozes;
- propose reverse direction;
- translate selected fields;
- pronunciation/phonetic suggestion;
- identify ambiguity/answer leakage;
- suggest tags/concepts;
- compare against possible duplicates;
- explain an answer from the source;
- generate practice variants.

Every action:

- shows exactly which fields/content will be processed;
- respects policy/quota;
- produces a diff/draft;
- never overwrites silently;
- allows undo;
- records provider/model/version and source links where applicable;
- marks generated text in revision metadata without visually stigmatizing the learner;
- works through deterministic alternatives when possible.

## 9. Semantic answer grading

Implement a conservative layered pipeline:

1. deterministic exact/alias/list/math/unit checks;
2. local semantic similarity if enabled;
3. optional cloud adjudication only when policy allows and ambiguity remains;
4. user or teacher override/audit.

Cloud request includes only the minimum needed:

- prompt;
- expected answer/aliases/rubric;
- learner answer;
- language;
- grading constraints;
- no learner identity, history, deck owner identity, or unrelated content.

Structured result:

- verdict: correct, partially_correct, incorrect, uncertain;
- score range/value;
- concise rationale;
- matched/missing concepts;
- confidence;
- rubric version;
- safety flag.

Rules:

- uncertain defaults to manual/user decision, not incorrect;
- model output cannot directly write canonical SRS rating;
- in Learn Mode it can advise the existing qualified-practice policy;
- assignment consequential grading requires teacher review unless a documented low-stakes policy explicitly allows otherwise;
- cache only privacy-safe normalized requests under user/deck scope;
- expose “why” and override;
- measure disagreement and false-positive fixtures;
- resist prompt injection inside learner answers/expected content by treating all content as data and enforcing structured schemas.

## 10. Explanations, hints, and source grounding

Implement source-grounded explanations:

- retrieve selected note/card/source chunks only;
- require citations to internal chunk/note/card identifiers;
- render clickable source references;
- distinguish source-supported content from optional general knowledge, with general knowledge disabled by default for private study explanations;
- say when source material is insufficient;
- never fabricate a citation;
- sanitize Markdown/HTML;
- allow report/feedback;
- keep an explanation as a draft unless intentionally saved to a note field.

Hints should be progressive and not reveal the full answer immediately unless the learner requests it. Hint use remains visible in practice history but does not shame or reduce accessible progression unfairly.

## 11. Secondary grounded tutor

Implement behind `ENABLE_AI_TUTOR=false` by default and a separate policy gate.

Tutor behavior:

- user selects a deck, tags, notes, or source documents;
- retrieval is limited to authorized selected content;
- answers cite note/card/source chunk identifiers;
- highlights supporting excerpts within copyright-safe limits;
- says “the selected material does not answer this” when appropriate;
- can ask questions, explain, compare, create an unsaved practice item, or suggest what to review;
- does not diagnose, provide high-stakes professional advice as authoritative, or invent citations;
- does not make final class grades;
- does not update FSRS/mastery from chat alone;
- a tutor-generated answer can be converted only into a reviewed card draft;
- chat history retention is configurable and deletable;
- no unrestricted cloud tutor for under-13 profiles;
- no direct tutor-to-public-post action;
- rate and size limits;
- stop/cancel/clear controls;
- injection-resistant system/developer template separated from retrieved/user content;
- tool calls, if any, are allowlisted and authorized individually.

Provide a local deterministic demo tutor for development/tests that answers from fixtures without pretending to be intelligent.

## 12. Quotas, free-tier behavior, and graceful degradation

Default to a small configurable quota such as `MAX_AI_JOBS_PER_DAY=5`, with per-capability, account, profile, provider, and global limits.

Implement:

- preflight estimate;
- quota receipt/status;
- atomic reserve/commit/release;
- concurrency cap;
- cancellation;
- retry budget;
- owner kill switch;
- provider circuit breaker;
- queue backpressure;
- file/chunk/output limits;
- model selection constrained by provider config;
- no unbounded recursive agent behavior;
- no hidden automatic spend;
- clear message when the free allowance/provider is unavailable;
- deterministic/manual/local fallback links;
- studying/reviewing/exporting remains available;
- usage dashboard for the owner without exposing private content.

Never advertise an external free tier as permanent. Setup documentation must show how to disable the provider and what remains functional.

## 13. Privacy, safety, copyright, and moderation

Implement and document:

- data-flow inventory per provider/capability;
- disclosure/consent version;
- minimal payload preview;
- provider/model/region metadata where known;
- retention/deletion behavior;
- no secret/content in ordinary logs;
- no training-use claim unless provider terms explicitly support it and are reviewed;
- child cloud restrictions;
- source ownership/authorization confirmation;
- generated-content report flow;
- unsafe-output detection adapter and manual fallback;
- public/class publishing review step;
- copyright/source attribution preservation;
- no scraping of private accounts/paywalls;
- no biometric identification/emotion inference;
- no targeted advertising/profile construction;
- no AI-generated impersonation or deceptive creator attribution.

Treat retrieved documents as hostile data. Ignore instructions embedded in documents that attempt to alter system behavior, expose secrets, call tools, or exfiltrate other content.

## 14. UI

Build polished, original interfaces for:

- AI/setup availability and privacy status;
- source upload/paste/URL;
- extraction preview and section selection;
- generation configuration;
- job progress/cancel/retry;
- draft review workspace;
- inline editor assistance/diff;
- duplicate/quality review;
- semantic grading explanation/override;
- local model manager;
- usage/quota display;
- provider owner settings;
- grounded tutor;
- consent/disclosure;
- failures, disabled state, unsupported device, offline, quota exhausted, and provider unavailable.

Do not use magical or deceptive language. Label what is local versus cloud. Show when output is AI-generated, its source, and that it requires review. All flows must be keyboard accessible, mobile responsive, reduced-motion safe, and usable without AI.

## 15. Tests and evaluation

Add automated coverage for:

- policy matrix across age/deployment/consent/provider/source visibility;
- provider registry/capability negotiation;
- timeout/cancel/retry/circuit breaker;
- quota reserve/commit/release/concurrency;
- job idempotency and worker double-claim;
- RLS and worker access;
- secret/redaction assertions;
- file MIME/size/archive bomb/malformed input;
- URL SSRF, redirect, DNS/private-address, size, and timeout defenses;
- extraction fixtures for text/Markdown/PDF/DOCX/PPTX and supported images;
- chunking/source-location stability;
- structured-output validation/repair/rejection;
- source citation integrity/no invented IDs;
- duplicate/quality heuristics;
- deterministic grading corpus;
- semantic grading adversarial fixtures, uncertainty, and override;
- prompt injection in documents, card text, learner answers, and tutor messages;
- unsafe/invalid model output sanitization;
- local model unsupported/download/delete/failure paths through mocks;
- draft review/accept/undo/version history;
- child cloud denial and adult-approved generation;
- tutor grounding, insufficient-source response, no SRS/mastery mutation;
- offline/core workflows with all AI disabled;
- Playwright source-to-reviewed-deck, editor assistance, quota exhaustion, provider failure, and tutor journeys;
- accessibility;
- production build and bundle analysis proving models/providers are not in core client bundles.

Create a small versioned evaluation suite with expected ranges and false-positive/false-negative tracking. Do not claim model quality from a few happy-path examples.

## Required acceptance criteria

- core application works completely with AI disabled and no provider credentials;
- deterministic intelligence is available and integrated throughout grading/editor quality flows;
- optional local models are explicit, removable, and gracefully degraded;
- cloud providers are adapter-based, server-side, quota-limited, disabled by default, and policy-gated;
- under-13 profiles cannot directly send private prompts/content to cloud AI;
- text/PDF/DOCX/PPTX/paste and supported source inputs produce a cited, editable draft review flow;
- AI never silently overwrites, publishes, grades consequential work, or mutates FSRS/mastery;
- semantic grading exposes confidence/reasons and supports override;
- tutor is secondary, grounded, cited, feature-flagged, and does not update learning state from chat;
- URL/file ingestion resists SSRF, injection, file bombs, and malformed content;
- quotas/provider outages fail gracefully without blocking study/export;
- RLS, unit, evaluation, security, E2E, accessibility, bundle, and production-build checks pass;
- provider setup, terms-review gate, privacy data flow, local-model behavior, environment variables, and exact verification status are documented.

<!-- END 11_AI_FEATURES.md -->

---

<!-- BEGIN 12_FINAL_INTEGRATION_SECURITY_AND_LAUNCH_AUDIT.md -->

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

<!-- END 12_FINAL_INTEGRATION_SECURITY_AND_LAUNCH_AUDIT.md -->

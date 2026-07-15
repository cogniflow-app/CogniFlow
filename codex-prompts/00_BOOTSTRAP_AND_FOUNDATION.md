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

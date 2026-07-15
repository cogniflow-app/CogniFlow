# Implementation status

**Current phase:** Phase 00 — Bootstrap, architecture foundation, and premium design system  
**Status:** Complete  
**Evidence captured:** 2026-07-15 UTC  
**Next phase:** Phase 01 has not started

This record describes implemented and verified repository behavior. Product intent remains canonical in [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md), and cross-cutting choices are recorded in [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md).

## Completed Phase 00 scope

- Initialized a Git repository and a seven-project pnpm/Turborepo workspace pinned to Node `24.18.0`, pnpm `11.13.0`, and exact compatible dependency versions.
- Added strict shared TypeScript, ESLint/Next/React/accessibility and dependency-boundary enforcement, Prettier, secret scanning, deterministic root commands, a frozen lockfile, and a five-job GitHub Actions workflow with SHA-pinned actions.
- Built the Next.js App Router foundation with typed metadata, security headers and CSP, error/loading/not-found handling, a real public landing route, honest `/app` and `/auth` foundation routes, a non-sensitive `/api/health` route, robots handling, and a noindex design-system gallery.
- Added centralized replaceable branding, build-local self-hosted fonts with system fallbacks, original SVG assets, responsive mobile navigation, light/dark/system themes, reduced motion, and serious mode. Appearance preferences persist without delaying public-route rendering; theme changes are atomic so transitional colors cannot create a contrast failure.
- Implemented the Phase 00 UI inventory in `packages/ui`: shells, actions, forms, overlays, navigation, content/status primitives, feedback states and toasts, data tables, accessibility helpers, card flip, timer/progress, score, and streak components. Critical keyboard, focus, loading/error, live-region, and reduced-motion behavior is covered by tests and the interactive gallery.
- Added typed public/server environment parsing and sanitized capabilities. Every Next production phase fails fast even when `NODE_ENV` is misleading, Server Action keys are format-validated, server modules are client-inaccessible through two enforced boundaries, and `vercel_beta` forcibly disables child profiles, public child content, and free-text game chat. Deterministic checks use an in-memory inert environment rather than a local secret file.
- Added framework-independent runtime/provider contracts, typed Supabase factories for browser/server/Route Handler/test contexts, current SSR cookie handling, an atomic generated-type workflow, and test fixtures used by multiple consumers.
- Initialized local Supabase with a migration-only foundation, an executable empty seed, reproducible pgTAP checks, and documented RLS/security-definer conventions. No identity, content, scheduling, mastery, sharing, class, game, progression, or AI product tables were created.
- Added Vitest/Testing Library/fast-check, Playwright desktop/mobile/reduced-motion projects, axe checks, Lighthouse CI budgets, a real k6 health smoke, an OpenNext/Cloudflare portability build, bundle analysis, and failure-only CI artifacts. Browser/load servers clear generated development output before startup, and the full gallery CSS is route-split away from the public critical path.
- Added architecture, data, event, security/privacy, setup, testing, deployment, and this status documentation, including the visible under-13 and provider launch gates.

## Database and migration evidence

| Migration                       | Implemented objects                                                                                                                                          | Verification                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `20260714000000_foundation.sql` | `extensions` and non-exposed `private` schemas; `citext`, `pgcrypto`, `pg_trgm`, and `pgtap`; hardened `private.set_updated_at()` helper; restrictive grants | Applied successfully both during `pnpm db:start` and from an empty database during `pnpm db:reset`; 11/11 pgTAP assertions passed |

`supabase/seed.sql` ran during each reset and intentionally inserted no application data. `pnpm db:types` regenerated `packages/database/src/generated/database.ts` from the running local schema using an atomic temporary-file replacement.

## Validation evidence

Validation ran on macOS `26.5.2` arm64 with Node `24.18.0`, pnpm `11.13.0`, Supabase CLI `2.109.1`, Docker Desktop `29.6.1`, Playwright `1.61.1`, and k6 `2.1.0`. The Supabase stack remained local-development-only on a trusted, firewalled machine; its configured client URLs use loopback even though Docker can publish backing ports on host interfaces.

| Command                                   | Exact result                                                                                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                            | Exit 0; all seven workspace projects installed, then remained up to date after the explicit web test dependency was added.                                                                                                          |
| `pnpm install --frozen-lockfile`          | Exit 0; lockfile accepted unchanged and workspace already up to date.                                                                                                                                                               |
| `pnpm exec playwright install chromium`   | Exit 0; the Chromium revision pinned by Playwright `1.61.1` was installed.                                                                                                                                                          |
| `pnpm db:start`                           | Exit 0; Docker Desktop stack started, the foundation migration applied, and the empty seed ran. No hosted credentials were used.                                                                                                    |
| `pnpm db:status`                          | Exit 0; local API, database, Auth, Storage, Realtime, Studio, and mail development endpoints were available. Optional analytics/image/pooler services remained intentionally disabled.                                              |
| `pnpm db:reset`                           | Exit 0 inside the final aggregate; local database recreated from empty, migration `20260714000000_foundation.sql` applied, empty seed executed, and services restarted.                                                             |
| `pnpm test:db`                            | Exit 0 inside the final aggregate; 1 SQL file, 11 assertions, all successful (`Result: PASS`).                                                                                                                                      |
| `pnpm db:types`                           | Exit 0; live local schema types generated successfully and formatted through atomic replacement.                                                                                                                                    |
| `pnpm format:check`                       | Exit 0 inside the final aggregate; every matched file uses the configured Prettier style.                                                                                                                                           |
| `pnpm secret:scan`                        | Exit 0 inside the final aggregate; no credential finding.                                                                                                                                                                           |
| `actionlint -color`                       | Exit 0; all five GitHub Actions jobs, expressions, action inputs, and embedded shell steps passed static workflow validation.                                                                                                       |
| `pnpm lint`                               | Exit 0 inside the final aggregate; ESLint reported no warnings/errors and the custom dependency/client-server boundary scan passed.                                                                                                 |
| `pnpm typecheck`                          | Exit 0 inside the final aggregate; 6/6 workspace projects passed strict TypeScript.                                                                                                                                                 |
| `pnpm test`                               | Exit 0 inside the final aggregate; 19 files and 64 tests passed. V8 coverage: statements `71.45%`, branches `49.45%`, functions `57.14%`, lines `71.91%`; all configured thresholds passed.                                         |
| `pnpm build`                              | Exit 0 inside the final aggregate; UI package build and optimized Next.js build passed. Seven routes were produced: six static routes and dynamic `/api/health`.                                                                    |
| `pnpm build:verify`                       | Exit 0; the same production build passed with deterministic, visibly inert verification values.                                                                                                                                     |
| scrubbed `pnpm --filter @lumen/web build` | Expected exit 1 before compilation with `DEPLOYMENT_PROFILE is required in production`, proving missing production configuration cannot be bypassed by `NODE_ENV`.                                                                  |
| `pnpm build:portable`                     | Exit 0 inside the final aggregate; OpenNext generated `.open-next/worker.js` for the pinned Cloudflare compatibility group. This is build verification, not a live provider deployment.                                             |
| `pnpm test:e2e`                           | Exit 0 inside the final aggregate; 9/9 Playwright tests passed across desktop, mobile, and reduced-motion projects, including visible mobile navigation and manual reduced-motion card behavior.                                    |
| `pnpm test:a11y`                          | Exit 0 inside the final aggregate; 5/5 tests passed with no serious/critical axe violations on light or dark checked surfaces and working skip-link focus on primary and secondary routes.                                          |
| `pnpm test:lighthouse`                    | Exit 0 inside the final aggregate. Scores: performance `99`, accessibility `100`, best practices `96`, SEO `100`; FCP `0.758 s`, LCP `2.159 s`, TBT `1 ms`, CLS `0`, transfer `174,444` bytes over 12 requests. All budgets passed. |
| `pnpm test:load`                          | Exit 0 inside the final aggregate; 15/15 checks passed over 3 real health requests, failure rate `0%`, and request-duration p95 `9.22 ms` against a `<1000 ms` threshold.                                                           |
| `pnpm verify`                             | Exit 0; formatting, secret scan, lint/boundaries, types, unit coverage, empty database reset, pgTAP, standard and portable production builds, Playwright, axe, Lighthouse, and k6 all passed in one aggregate.                      |
| `shasum -a 256 -c SHA256SUMS.txt`         | Exit 0; all 19 canonical source-pack files retained their supplied checksums.                                                                                                                                                       |

Targeted regression runs also passed: `pnpm --filter @lumen/config typecheck` and `test` (3 files/14 tests), `pnpm --filter @lumen/ui typecheck` and `test` (6 files/17 tests), `pnpm --filter @lumen/web typecheck`, the two-file environment/boundary Vitest run (15 tests), and the appearance/card-motion Vitest run (2 files/7 tests).

During remediation, automated checks exposed and then verified three concrete fixes: the first mobile run was 8/9 because a stale generated development stylesheet still hid navigation; the isolated-server harness fixed the rerun to 9/9. The first expanded dark-theme axe run was 4/5 because semantic colors transitioned through a low-contrast midpoint; atomic theme application fixed it to 5/5. An aggregate Lighthouse run measured LCP `2.612 s` against the `2.5 s` limit; route-splitting gallery CSS and removing speculative navigation prefetches reduced the final aggregate to `2.159 s`.

## Configuration and owner setup

- `.env.example` is the canonical variable inventory. Local runtime use requires copying it to ignored `apps/web/.env.local` and substituting the publishable/secret values printed by the local Supabase CLI. These local values are not committed or reproduced here.
- No paid service or hosted credential is required for Phase 00 verification.
- A live Vercel preview requires an owner-controlled Vercel project plus a separate non-production Supabase project and provider-stored secrets.
- A live OpenNext/Cloudflare preview requires an owner-controlled Cloudflare account, Worker configuration, routes, and encrypted secrets. The adapter is implemented and build-verified but not live-verified.
- Production encryption, guest signing, and stable Server Action encryption keys must be generated independently and stored in the deployment provider; local/test values are deliberately inert.
- Under-13 profiles remain disabled. Enabling child profiles requires the technical, provider, privacy, consent, retention, incident-response, and legal gates documented in [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).

## Deferred scope and constraints

- Phase 01 owns real authentication, account/profile records, privacy settings, consent records, and guardian boundaries. The current `/auth` route is accurate account-boundary information, not a login simulation.
- Phase 02 owns the product content schema and editor. Later phases own SRS, adaptive study, offline sync, import/export, collaboration, classes, games, progression, and AI in the order defined by the blueprint.
- No product RLS matrix exists yet because Phase 00 intentionally exposes no application table. Every later exposed table must add RLS, supporting indexes, and actor-matrix database tests in its owning migration.
- Lighthouse values are one local lab run, not real-user field data. The k6 result verifies the health route only and is not evidence for future realtime-game capacity.
- Cloudflare portability is implemented but not live-verified because no owner account or deployment authorization was supplied.

There is no known blocker to completing Phase 00 and no Phase 01 implementation has begun.

# Architecture decisions

**Project:** Lumen (temporary, configuration-driven brand)  
**Decision baseline:** Phase 00  
**Last updated:** 2026-07-15

This file is the architectural decision record (ADR) for implementation choices that affect more than one package or phase. The product target remains canonical in [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md). A later decision must add a new ADR and mark the earlier record superseded; do not silently rewrite a decision after it has shipped.

## Decision index

| ADR  | Decision                                               | Status                    |
| ---- | ------------------------------------------------------ | ------------------------- |
| 0001 | Pinned Node and pnpm Turborepo workspace               | Accepted                  |
| 0002 | Mutually compatible dependency baseline                | Accepted                  |
| 0003 | Framework-independent domain and provider boundaries   | Accepted                  |
| 0004 | Typed environment and deployment-profile capabilities  | Accepted                  |
| 0005 | Accessible, token-driven design system                 | Accepted                  |
| 0006 | Migration-first Supabase foundation                    | Accepted                  |
| 0007 | Vercel beta plus provisional OpenNext portability      | Accepted with launch gate |
| 0008 | Layered verification and controlled dependency updates | Accepted                  |

## ADR-0001: Pinned Node and pnpm Turborepo workspace

**Context.** The product needs shared domain code, a Next.js application, database tooling, and future portable workers without duplicating configuration. Reproducible installs matter more than opportunistically taking a new package release.

**Decision.** Use a pnpm workspace orchestrated by Turborepo. Pin Node `24.18.0` LTS in `.nvmrc` and `.node-version`, pnpm `11.13.0` in `packageManager` and `engines`, and Turborepo `2.10.5`. Root scripts are the stable public interface for local development and CI. Package scripts remain independently runnable.

Only packages with a real Phase 00 API, test, or consumer are created. Phase 00 contains the web application and the `config`, `database`, `domain`, `test-utils`, and `ui` foundations; later packages are created by their owning phase.

**Consequences.**

- CI uses the exact Node and pnpm releases and a frozen `pnpm-lock.yaml`.
- `packages/domain` cannot import Next.js, React, Supabase, or provider SDKs.
- Cross-package build outputs and tests are cacheable without caching secrets or local environment files.
- The Node pin may be updated only through the policy in ADR-0008.

## ADR-0002: Mutually compatible dependency baseline

**Context.** The newest independent release of every package is not a valid stack. In particular, TypeScript 7 is outside the supported range of typescript-eslint 8, and ESLint 10 is outside peer ranges of plugins bundled by the current Next.js ESLint preset.

**Decision.** Pin exact versions in manifests and the lockfile. The Phase 00 compatibility set selected on 2026-07-14 is:

| Concern                   | Exact selection                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Runtime and workspace     | Node `24.18.0`, Corepack `0.35.0`, pnpm `11.13.0`, Turbo `2.10.5`                                              |
| Application               | Next.js `16.2.10`, React `19.2.7`, React DOM `19.2.7`                                                          |
| Type system               | TypeScript `6.0.3`, `@types/node` `24.13.3`, React types `19.2.17`, React DOM types `19.2.3`                   |
| Styling                   | Tailwind CSS `4.3.2`, `@tailwindcss/postcss` `4.3.2`, PostCSS `8.5.19`                                         |
| Validation and motion     | Zod `4.4.3`, Motion `12.42.2`                                                                                  |
| Self-hosted fonts         | Manrope variable `5.2.8`, Newsreader variable `5.2.10`                                                         |
| Supabase                  | `@supabase/supabase-js` `2.110.5`, `@supabase/ssr` `0.12.3`, CLI `2.109.1`                                     |
| Portable build            | `@opennextjs/cloudflare` `1.20.1`, Wrangler `4.110.0`, `rclone.js` `0.6.6`                                     |
| Unit tests                | Vitest and V8 coverage `4.1.10`, Vite `8.1.4`, jsdom `29.1.1`, fast-check `4.9.0`                              |
| Browser and accessibility | Playwright `1.61.1`, axe-core and Playwright axe `4.12.1`                                                      |
| Lint and format           | ESLint and `@eslint/js` `9.39.5`, `eslint-config-next` `16.2.10`, typescript-eslint `8.64.0`, Prettier `3.9.5` |
| Repository security       | Secretlint and recommended preset `13.0.2`                                                                     |

The UI layer uses exact Radix releases rather than a floating aggregate package:

| Primitive       | Version  | Primitive     | Version  |
| --------------- | -------- | ------------- | -------- |
| Accordion       | `1.2.16` | Avatar        | `1.2.2`  |
| Checkbox        | `1.3.7`  | Context menu  | `2.3.3`  |
| Dialog          | `1.1.19` | Dropdown menu | `2.1.20` |
| Popover         | `1.1.19` | Progress      | `1.1.12` |
| Radio group     | `1.4.3`  | Select        | `2.3.3`  |
| Switch          | `1.3.3`  | Tabs          | `1.1.17` |
| Toast           | `1.2.19` | Tooltip       | `1.2.12` |
| Visually hidden | `1.2.7`  | Slot          | `1.3.0`  |

Tailwind 4 uses the CSS-first `@import "tailwindcss"` and `@tailwindcss/postcss` integration. It must not be configured using assumptions specific to Tailwind 3.

**Compatibility constraints.**

- typescript-eslint `8.64.0` supports TypeScript `>=4.8.4 <6.1.0`; therefore TypeScript `6.0.3` is the newest compatible stable selection, not `7.0.2`.
- Plugins used by `eslint-config-next` `16.2.10` cap their declared ESLint support at major 9; therefore ESLint `9.39.5` is selected instead of major 10.
- OpenNext `1.20.1` accepts Next.js `>=15.5.18 <16` or `>=16.2.6`; Next.js `16.2.10` satisfies that peer range.
- Supabase JS `2.110.5` requires Node 22 or newer; Node 24 satisfies it.
- `@types/node` stays on major 24 so compile-time APIs do not exceed the deployed runtime.

## ADR-0003: Framework-independent domain and provider boundaries

**Decision.** React components do not query Supabase directly. Server Components, Route Handlers, and later Server Actions call typed repositories or services. Browser Supabase access is limited to explicitly authorized Realtime, Storage, and offline-sync workflows.

Provider-specific concerns are abstracted where migration cost is material: hosting/runtime, mail, object storage, realtime, rate limiting, jobs, AI, analytics, and error reporting. SQL itself is not hidden behind a generic database abstraction. Atomic behavior remains explicit in Postgres functions and typed repositories.

ESLint restrictions and a repository boundary check enforce at least these directions:

```text
apps/web -> packages/ui, config, domain, database
packages/ui -> packages/config and framework-neutral types
packages/database -> packages/config and domain types
packages/domain -> no application framework or provider SDK
Client Components -X-> server-only modules and server environment
```

All external inputs are unknown until validated. Public package APIs use strict TypeScript and runtime schemas at trust boundaries.

## ADR-0004: Typed environment and deployment-profile capabilities

**Decision.** Split configuration into browser-safe values and server-only values. A Client Component may import only the browser module. Runtime server entry points are marked `server-only`; the pure parser used by `next.config.ts` is protected by both ESLint and the repository boundary scanner.

Supported profiles are local/test, `vercel_beta`, and a provisional portable Cloudflare profile. A typed capability projection, rather than scattered environment checks, controls child profiles, public child content, and free-text game chat.

For `vercel_beta`, child profiles are forcibly disabled even if a tampered environment variable says otherwise. The UI receives only a sanitized capability subset. Production configuration fails at startup/build when required values are missing or malformed; deterministic defaults are restricted to tests and documented local development.

Next production build, export, analysis, and server phases force production validation regardless of an inherited `NODE_ENV`, including a stable 32-byte base64 Server Action encryption key. Verification commands inject a fixed, visibly inert environment without writing `.env.local`; normal builds and deployments remain strict.

Brand text comes from `NEXT_PUBLIC_APP_NAME`, with a safe default in the centralized brand module. Build metadata exposed by `/api/health` is non-sensitive.

## ADR-0005: Accessible, token-driven design system

**Decision.** Build the reusable UI in `packages/ui` with semantic CSS custom properties and typed component APIs. Radix supplies behavior for complex widgets, but visual appearance is original. Components use semantic HTML first, visible focus, keyboard interaction, live regions where state changes, and non-color status cues.

Theme preference supports light, dark, and system. Reduced motion follows `prefers-reduced-motion`; serious mode is a separate user preference that removes celebratory motion and sound without changing OS preferences. Motion is progressive enhancement, so card flip and game-ready primitives retain a meaningful non-motion state.

Fonts are stored in the application dependency/build output and never fetched from a third-party font CDN at runtime. SVG brand and empty-state art is original and replaceable.

The public shell loads only token and bespoke route styles. The full Tailwind component inventory is emitted as a separate design-gallery route chunk, so a developer verification surface does not become render-blocking public CSS. Plain public navigation anchors avoid speculative product-route prefetch traffic before authentication and data routes exist.

## ADR-0006: Migration-first Supabase foundation

**Decision.** Supabase provides Postgres, Auth, Storage, and Realtime. Schema changes are append-only migration files. An applied migration is never edited or reordered. Phase 00 creates only safe database conventions and a private helper schema; it does not pre-create the product schema from the blueprint.

Every future table reachable through an exposed API schema must enable RLS before use. Security-definer functions live outside exposed schemas, set an explicit or empty `search_path`, validate and authorize input, receive minimal grants, and have database tests. Views exposed through the API are security-invoker or isolated from exposed schemas.

Browser, server, Route Handler, and test database clients have separate factories. The browser factory can receive only the publishable key. The secret key is server-only and never exported through a public module.

Generated TypeScript database types are reproducible through `pnpm db:types`; generated output is not hand-edited.

## ADR-0007: Vercel beta plus provisional OpenNext portability

**Decision.** Vercel is the preview and initial 13+ beta target. Node 24 is selected for Vercel builds and functions. The portable candidate uses OpenNext for Cloudflare Workers and is validated with `pnpm build:portable`.

OpenNext uses the Next.js Node runtime. OpenNext's Node Middleware support is not yet complete, so Phase 00 does not depend on Node Middleware for correctness or authorization. Domain packages contain no Vercel or Cloudflare API calls.

The Cloudflare path is an engineering portability candidate, not a child-safety or legal approval. Under-13 profiles remain disabled until the owner completes the provider, privacy, consent, retention, incident-response, and legal gates in [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).

## ADR-0008: Layered verification and controlled dependency updates

**Decision.** Verification is layered so failures identify their boundary:

1. deterministic formatting and secret scan;
2. lint and import-boundary enforcement;
3. strict type checking;
4. unit, interaction, accessibility, and property tests;
5. migration and pgTAP tests against local Supabase;
6. production and portable builds;
7. Playwright desktop/mobile/reduced-motion checks;
8. axe, Lighthouse budgets, and a k6 health smoke check.

`pnpm verify` is the local aggregate and supplies deterministic inert build values. Browser/load checks own an isolated development server and clear generated `.next/dev` output before startup so a preceding production build cannot supply stale assets. CI invokes layers explicitly so database cleanup and failure artifacts run even when a preceding layer fails.

Dependency updates are deliberate maintenance changes:

- use exact manifest versions and a frozen lockfile in CI;
- review release notes, engine ranges, peer ranges, migration notes, and security advisories;
- update a related compatibility group together (for example Next/React/ESLint or Vitest/Vite);
- run the complete verification suite and both production builds;
- add or supersede an ADR for a framework, runtime, provider, database, or security-boundary change;
- never perform an unrelated upgrade during a product phase;
- an urgent security patch may be expedited, but still requires a reviewed lockfile diff and proportional regression tests.

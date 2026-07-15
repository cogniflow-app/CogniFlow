# Testing and verification

**Scope:** Phase 00 harness and expectations  
**Evidence:** Exact measured results belong in [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md), not this guide.

## Test layers

| Layer            | Root command           | What it protects                                                               | External prerequisite         |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------ | ----------------------------- |
| Formatting       | `pnpm format:check`    | Deterministic source/config/docs formatting                                    | None                          |
| Secret scan      | `pnpm secret:scan`     | Accidental credentials in repository content                                   | None                          |
| Lint/boundaries  | `pnpm lint`            | Next/React/a11y rules and forbidden dependency directions                      | None                          |
| Types            | `pnpm typecheck`       | Strict package and application contracts                                       | None                          |
| Unit/property/UI | `pnpm test`            | Environment guards, domain invariants, UI interaction, health/landing behavior | None                          |
| Database         | `pnpm test:db`         | Migrations, foundational functions, grants, and pgTAP assertions               | Running local Supabase        |
| Production build | `pnpm build`           | Next.js and package production compilation plus fail-fast environment checks   | Complete environment values   |
| Portable build   | `pnpm build:portable`  | OpenNext/Cloudflare transform compatibility                                    | None for build; no deployment |
| End-to-end       | `pnpm test:e2e`        | Landing and design-system routes across configured browser projects            | Pinned Chromium               |
| Accessibility    | `pnpm test:a11y`       | axe serious/critical violations and keyboard workflows                         | Pinned Chromium               |
| Lighthouse       | `pnpm test:lighthouse` | Public performance/accessibility/best-practice budgets                         | Chrome/Chromium               |
| Load smoke       | `pnpm test:load`       | Real `/api/health` availability and latency threshold                          | k6 `2.1.0`                    |

`pnpm verify` runs the practical local aggregate, including local database reset/tests, both production builds, browser and accessibility checks, Lighthouse budgets, and the k6 smoke test. It therefore requires Docker/Supabase, Chromium, and k6. The wrapper supplies deterministic, visibly inert configuration values without creating an environment file. Normal `pnpm build` and deployment builds remain strict and require real configuration. CI invokes the layers explicitly so cleanup and failure-artifact steps are reliable.

## Unit and property tests

Vitest uses jsdom only for browser-like component tests; framework-independent packages prefer the Node environment. React Testing Library tests behavior through accessible roles/names rather than component internals. `@testing-library/user-event` is used for keyboard and pointer interaction.

Phase 00 critical coverage includes:

- public/server environment validation;
- Next production-phase fail-fast behavior that cannot be bypassed with `NODE_ENV`;
- server-secret/client import boundary;
- the `vercel_beta` child-profile override;
- representative Button, dialog/menu, form control, tab/accordion, toast/live-region, card-flip, and timer interactions;
- keyboard and focus behavior;
- reduced-motion fallback;
- landing-page rendering without fake statistics/actions;
- health Route Handler status and non-sensitive shape;
- migration availability and foundational SQL conventions.

fast-check is available for invariants that benefit from generated input. A property test must define useful bounds and failure reproduction; random examples are not a substitute for explicit edge cases.

Run one workspace while iterating:

```bash
pnpm --filter @lumen/ui test
pnpm exec vitest run apps/web
```

Do not commit `.only`, skipped critical tests, or snapshots that hide meaningful behavior changes.

## Database tests

Start and reset local Supabase before the pgTAP suite:

```bash
pnpm db:start
pnpm db:reset
pnpm test:db
```

Database tests run from an empty migration chain. Later phases extend the matrix for RLS actors and atomic RPC behavior. Do not point these commands at a hosted project.

When a database test fails:

1. inspect the first failed migration/assertion;
2. fix it with a new migration if the original was already applied in a shared environment;
3. rerun `pnpm db:reset` and the entire database suite;
4. regenerate types with `pnpm db:types` if the public schema changed.

CI always stops the local Supabase stack, including on failure. It does not upload environment/status output that could contain local secret keys.

## Playwright end-to-end tests

Install the exact browser revision associated with Playwright `1.61.1`:

```bash
pnpm exec playwright install chromium
```

The Playwright `webServer` configuration owns starting/stopping an isolated app instance for browser tests. The harness clears only generated `.next/dev` output before startup so a preceding production build cannot leave stale development CSS or route artifacts. Tests never reuse a developer's existing server.

Phase 00 coverage opens at least:

- `/` at desktop and mobile widths;
- `/dev/design-system` with production indexing disabled;
- reduced-motion behavior;
- responsive navigation exposing only implemented destinations;
- implemented preference controls and representative widget keyboard flows.

Traces, screenshots, and video are diagnostic artifacts, not assertions. CI uploads Playwright reports/test results only after a failure and retains them briefly.

## Accessibility

`pnpm test:a11y` runs axe against the landing and design-system routes and fails on serious or critical violations. Automated axe checks complement, but do not replace:

- complete keyboard traversal and escape behavior;
- visible focus and sensible focus restoration;
- semantic heading/landmark order;
- screen-reader names/descriptions/errors;
- live-region announcements without duplicate noise;
- 44 px practical target sizing;
- non-color status/progress cues;
- reduced-motion and serious-mode inspection;
- zoom/text scaling and responsive reflow.

When suppressing an axe rule is genuinely necessary, scope it to the smallest element, link an upstream issue or standards rationale, and add a manual assertion. Blanket rule disablement is prohibited.

## Lighthouse budgets

`lighthouserc.json` uses local filesystem output and no hosted Lighthouse token. Phase 00 budgets target:

- Largest Contentful Paint: at most 2.5 seconds;
- Cumulative Layout Shift: at most 0.1;
- Total Blocking Time: at most 300 ms as a lab responsiveness proxy;
- accessibility score: at least 0.95;
- performance score: at least 0.85 initially.

These are configured thresholds, not measured claims. Record measured runs and environment in `IMPLEMENTATION_STATUS.md`. INP needs real-user or suitable interaction measurement and is not inferred from a Lighthouse lab run.

## k6 smoke check

`k6/smoke.js` makes real requests to the health route. The root script starts the Phase 00 web server first. To target an already running local instance directly:

```bash
BASE_URL=http://127.0.0.1:3100 k6 run k6/smoke.js
```

The smoke test requires successful JSON health responses and checks failure rate and p95 latency. It is not evidence for the future multiplayer capacity target.

## Fixtures and factories

- Use deterministic IDs/timestamps/seeds unless the test is explicitly property-based.
- Keep representative prose and accessible labels; do not use lorem ipsum for component behavior.
- Never copy production user data into fixtures.
- Clearly mark credential-shaped fixture strings as inert and keep them out of public/client bundles.
- Shared factories belong in `packages/test-utils` only when at least two consumers exist.
- Large deck, import, multiplayer, and child-profile fixtures are owned by later phases.

## CI behavior

The checked-in workflow:

- uses exact Node/pnpm and a frozen lockfile;
- runs formatting, secret scan, lint, typecheck, unit tests, standard build, and portable build;
- starts local Supabase, resets from empty, runs pgTAP, and cleans up;
- installs pinned Chromium and runs Playwright plus axe;
- runs Lighthouse budgets and the real k6 health smoke in a dedicated performance job;
- uploads diagnostic artifacts only on failure;
- supplies inert local/test configuration, never production secrets;
- pins third-party Actions by full commit SHA.

## Reporting a phase result

For every command, record in `IMPLEMENTATION_STATUS.md`:

- exact command;
- UTC date/environment where relevant;
- exit code and test/assertion count when reported by the tool;
- important measured budgets;
- whether an adapter was only build-tested or live-verified;
- any environmental limitation, without presenting an unrun check as passing.

# Testing and verification

**Scope:** Phase 00 harness and Phase 01 identity/privacy verification  
**Evidence:** Exact measured results belong in [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md), not this guide.

## Test layers

| Layer            | Root command           | What it protects                                                                                             | External prerequisite              |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Formatting       | `pnpm format:check`    | Deterministic source/config/docs formatting                                                                  | None                               |
| Secret scan      | `pnpm secret:scan`     | Accidental credentials in repository content                                                                 | None                               |
| Lint/boundaries  | `pnpm lint`            | Next/React/a11y rules and forbidden dependency directions                                                    | None                               |
| Types            | `pnpm typecheck`       | Strict package and application contracts                                                                     | None                               |
| Unit/property/UI | `pnpm test`            | Environment/auth/profile/privacy/guest schemas, security helpers, and UI behavior                            | None                               |
| Database         | `pnpm test:db`         | Migration chain, provisioning, grants, RLS actors, token/session/job RPCs, and pgTAP assertions              | Running local Supabase             |
| Production build | `pnpm build`           | Next.js and package production compilation plus fail-fast environment checks                                 | Complete environment values        |
| Portable build   | `pnpm build:portable`  | OpenNext/Cloudflare transform and Edge-middleware compatibility                                              | None for build; no deployment      |
| End-to-end       | `pnpm test:e2e`        | Public/guest gates, protected redirects, under-13 refusal, local signup/onboarding/settings, and UI behavior | Local Supabase and pinned Chromium |
| Accessibility    | `pnpm test:a11y`       | axe checks across public, auth, onboarding, join, information, and gallery routes plus keyboard workflows    | Local Supabase and pinned Chromium |
| Lighthouse       | `pnpm test:lighthouse` | Public performance/accessibility/best-practice budgets                                                       | Chrome/Chromium                    |
| Load smoke       | `pnpm test:load`       | Real `/api/health` availability and latency threshold                                                        | k6 `2.1.0`                         |

`pnpm verify` runs the practical local aggregate, including local database reset/tests, database-type drift check, both production builds, browser and accessibility checks, Lighthouse budgets, and the k6 smoke test. It therefore requires Docker/Supabase, Chromium, and k6. The wrapper supplies deterministic, visibly inert configuration values without creating an environment file. Browser/a11y wrappers read the already-running local Supabase URL and generated keys into the child process without printing or writing them. Normal `pnpm build` and deployment builds remain strict and require real configuration. CI invokes the layers explicitly so cleanup and failure-artifact steps are reliable.

Request interception intentionally uses Edge-compatible `apps/web/middleware.ts` instead of Next 16's Node-only `proxy.ts`. The standard build checks the Next contract, and `pnpm build:portable` checks that OpenNext can transform the middleware without a Node-only runtime dependency. Browser/auth tests still verify protected routes themselves because middleware performs only best-effort cookie refresh and must never be treated as authorization.

## Unit and property tests

Vitest uses jsdom only for browser-like component tests; framework-independent packages prefer the Node environment. React Testing Library tests behavior through accessible roles/names rather than component internals. `@testing-library/user-event` is used for keyboard and pointer interaction.

Phase 00 foundation coverage remains in place. Phase 01 unit/property/UI coverage adds:

- public/server environment validation;
- Next production-phase fail-fast behavior that cannot be bypassed with `NODE_ENV`;
- server-secret/client import boundary;
- universal production child/profile-consent shutdown plus the additional `vercel_beta` and provider-owned `VERCEL=1` overrides;
- production rejection of HTTP application/Supabase origins;
- valid/invalid parental-consent modes and server-only verifier configuration; deterministic local evidence; and the external verifier's HMAC-subject/no-email request, timeout signal, accepted evidence, transport denial, streaming size limit, malformed response, and negative-evidence paths;
- email/password, magic-link, recovery, re-authentication, onboarding, provider, profile, privacy, family-code/PIN, and deletion input schemas;
- two-stage recovery state: signed pending nonce/normalized-email/return-path binding, lifetime and tamper rejection, callback/confirm denial for query-only recovery intent, and issuance of the account-bound reset capability only after the pending state matches;
- signed signup/onboarding age-gate structure, provider/normalized-email binding, callback nonce and expiry enforcement, under-13 pre-Auth refusal, provisional Auth-identity rejection/minimization, final onboarding rejection of a client age field, and exchange for a separate Auth-session/payload-bound proof;
- safe relative redirects, neutral provider/account errors, and configured-provider descriptors;
- public viewer normalization for the canonical public-shell families, denial of external/API/auth/account/traversal/double-encoded returns, anonymous fallback when Auth is unavailable, return-aware visitor links, verified workspace CTA, and middleware matcher coverage for every public family;
- generated and filtered safe nicknames, room-code normalization, non-enumerating room resolution, expiry/lock/capacity rules, and the empty production room adapter;
- guest issuance contracts proving the raw reconnect token is returned only once while the writer receives its digest;
- same-origin mutation enforcement and pseudonymous rate-limit subjects that do not return a network address;
- opaque-token, SHA-256, HMAC, compact-signature, and tamper-rejection helpers;
- profile/sign-out cache-isolation event contracts plus the concrete learner/private Web Storage and Cache Storage cleanup hook;
- successful profile switching always replacing the guardian document after the authoritative server mutation, including when browser cleanup rejects;
- current-device sign-out in managed/self contexts, password/proof-gated all-device sign-out in self context, application-device revocation, and identity-cookie clearing even when Supabase Auth invalidation fails;
- verified-child proof issuance/consumption using the same request-local proof digest, no proof disclosure in the response, strict child settings/scope allowlists, and explicit learner-preference RPC arguments;
- representative Button, dialog/menu, form control, tab/accordion, toast/live-region, card-flip, and timer interactions;
- keyboard and focus behavior;
- reduced-motion fallback;
- authoritative account/managed-learner appearance hydration, low-stimulation managed defaults, operating-system reduced-motion precedence, and immediate synchronization after a successful profile save;
- landing/public-information/join rendering without fake statistics, rooms, or completed jobs;
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

Database tests run from an empty migration chain. The Phase 01 suites cover:

- existence, RLS enablement, read-only policy posture, private-schema denial, explicit grants, empty `search_path`, and policy-supporting indexes;
- Auth-trigger and explicit account provisioning, anonymous exclusion, idempotent retry, and exactly one self learner;
- RPC-only authentication-profile lookup and live `auth.sessions`-verified device registration, including missing/cross-account session denial and canonical-device replay;
- anonymous, account owner, guardian, unrelated account, attacker metadata/tampered learner ID, teacher-observer projection, revoked observer/guardian, expired/revoked profile session, guest, and service-role boundaries;
- child creation plus guardian/access/consent transactionality, under-13 independent-account denial, verified child-creation proof issue/expiry/session/payload/one-time-consumption behavior, fail-closed missing/null/mistyped/extra payload fields, and exact authenticated/service RPC grants;
- verified JWT `session_id` binding for devices/profile sessions; stale-JWT denial for absent/revoked devices and deleted/suspended accounts; managed-mode isolation that remains locked after study expiry; proof-consuming guardian exit; and current/all sign-out cascades;
- cost-12 PIN and 16-character family-code bcrypt hashing, legacy family-digest rotation compatibility, profile/guest/re-authentication token digests, credential rotation, committed PIN throttling, profile-session exact replay/concurrency, maximum/expiry/revocation, and device-session cascade;
- atomic authenticated `current_*` mutations that derive `auth.uid()`, require the exact device/Auth session, and cannot race a managed-profile switch; explicit managed-learner settings mutation cannot smuggle arbitrary JSON;
- signed-age-gate onboarding proof issuance/expiry/session/payload/one-time-consumption behavior, raw proofless onboarding denial, exact replay checks, and provisional-account rejection restricted to incomplete child-free identities;
- append-only consent/audit enforcement, actor-scoped audit idempotency, mismatched-target replay denial, and idempotent compensating revocation;
- school-authorization proof issue/expiry/one-time consumption, actor/owner binding, teach-capability insufficiency, raw-proof removal, and service-only grants;
- school-managed creation restricted to minor age bands and a canonical privacy-safe seven-key settings object, including denial of missing, JSON-null, mistyped, extra, and unsafe settings;
- selected learner-profile session revocation through authenticated self context, including exact account ownership, fresh/single-use `security_change` proof, service-implementation grant denial, unchanged containing device/unrelated session, and one audit fact;
- export/deletion request state, authenticated atomic request/cancellation authorization, configured grace and elapsed-deadline enforcement, fresh/single-use re-authentication proofs, due deletion processing, Auth-subject deletion guards, tombstone minimization/idempotency, current-device versus reauthenticated all-device sign-out authorization, fixed-window rate limiting, guest redemption/expiry, and purge behavior.

The selected-session matrix is isolated in `supabase/tests/039_profile_session_revocation.test.sql`; it exercises 13 assertions without relying on route/UI hiding. School payload hardening extends `supabase/tests/035_school_authorization.test.sql` so invalid learner/settings input fails before proof consumption and successful creation stores only the canonical minimized document.

The teacher observer remains a placeholder projection for future class phases; these tests do not claim class membership exists. Later phases extend the matrix for their own resources. Do not point these commands at a hosted project.

Together, route/unit tests and pgTAP exercise the complete managed-profile foundation in local/test configuration: consent verification, strict proof issuance and consumption, child/access/consent creation, credential setup, managed switching and isolation, current-device sign-out, guardian exit, revocation, replay, expiry, and attacker payloads. The same configuration suite proves every production runtime resolves child capability and consent mode off. This is boundary verification, not evidence that any production child deployment is enabled or approved.

When a database test fails:

1. inspect the first failed migration/assertion;
2. fix it with a new migration if the original was already applied in a shared environment;
3. rerun `pnpm db:reset` and the entire database suite;
4. regenerate types with `pnpm db:types` if the public schema changed.

Then run `pnpm db:types:check`; a migration and generated contract that disagree is a failure, not a reason to hand-edit the generated file.

CI always stops the local Supabase stack, including on failure. It does not upload environment/status output that could contain local secret keys.

## Playwright end-to-end tests

Install the exact browser revision associated with Playwright `1.61.1`:

```bash
pnpm exec playwright install chromium
```

The Playwright `webServer` configuration owns starting/stopping an isolated app instance for browser tests. The harness clears only generated `.next/dev` output before startup so a preceding production build cannot leave stale development CSS or route artifacts. Tests never reuse a developer's existing server.

Current public browser coverage opens at least:

- `/` at desktop and mobile widths;
- `/join/[code]` and confirms the form never reports a joined nonexistent room;
- a protected settings route and onboarding while signed out, preserving only the safe return destination;
- the under-13 guardian path without sending an Auth mutation or revealing account credential/provider fields;
- one desktop local-email path through signed age-gated signup provisioning, onboarding, dashboard access, and locked child-profile settings;
- `/dev/design-system` with production indexing disabled;
- reduced-motion behavior;
- responsive navigation exposing only implemented destinations;
- implemented preference controls and representative widget keyboard flows.

Traces, screenshots, and video are diagnostic artifacts, not assertions. CI uploads Playwright reports/test results only after a failure and retains them briefly.

## Accessibility

`pnpm test:a11y` runs axe against the landing, Auth entry/status, onboarding, guest join, privacy, terms, safety, copyright, and design-system routes and fails on serious or critical violations. The live local signup smoke also checks the authenticated onboarding surface. Automated axe checks complement, but do not replace:

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

`lighthouserc.json` uses local filesystem output and no hosted Lighthouse token. Current budgets target:

- Largest Contentful Paint: at most 2.5 seconds;
- Cumulative Layout Shift: at most 0.1;
- Total Blocking Time: at most 300 ms as a lab responsiveness proxy;
- accessibility score: at least 0.95;
- performance score: at least 0.85 initially.

These are configured thresholds, not measured claims. Record measured runs and environment in `IMPLEMENTATION_STATUS.md`. INP needs real-user or suitable interaction measurement and is not inferred from a Lighthouse lab run.

## k6 smoke check

`k6/smoke.js` makes real requests to the health route. The root script starts the web server first. To target an already running local instance directly:

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
- Test Auth actors, child profiles, consent records, sessions, and guests are transaction-scoped or adapter-injected and never seed a deployed account.
- Fixture game rooms implement the same adapter as the production empty-room boundary; no environment flag can expose them.
- Large deck, import, and multiplayer fixtures are owned by later phases.

## CI behavior

The checked-in workflow:

- uses exact Node/pnpm and a frozen lockfile;
- runs formatting, secret scan, lint, typecheck, unit tests, standard build, and portable build;
- starts local Supabase, resets from empty, runs pgTAP plus generated-type drift checking, and cleans up;
- installs pinned Chromium, starts/resets local Supabase for each browser job, injects its runtime values without logging them, and runs Playwright plus axe;
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

# Testing and verification

**Scope:** Phase 00 harness, Phase 01 identity/privacy, Phase 02 content authoring, Phase 03 scheduling/review, and hosted checks  
**Evidence:** Exact measured results belong in [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md), not this guide.

## Test layers

| Layer            | Root command                                               | What it protects                                                                                              | External prerequisite                                                             |
| ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Formatting       | `pnpm format:check`                                        | Deterministic source/config/docs formatting                                                                   | None                                                                              |
| Secret scan      | `pnpm secret:scan`                                         | Accidental credentials in repository content                                                                  | None                                                                              |
| Lint/boundaries  | `pnpm lint`                                                | Next/React/a11y rules and forbidden dependency directions                                                     | None                                                                              |
| Types            | `pnpm typecheck`                                           | Strict package and application contracts                                                                      | None                                                                              |
| Unit/property/UI | `pnpm test`                                                | Identity plus card/rich/template/generation/media/worker/public-projection contracts and UI behavior          | None                                                                              |
| Database         | `pnpm test:db`                                             | Migration chain, identity/content grants, RLS actors, version/idempotency/publication/media RPCs, and pgTAP   | Running local Supabase                                                            |
| Production build | `pnpm build`                                               | Next.js and package production compilation plus fail-fast environment checks                                  | Complete environment values                                                       |
| Portable build   | `pnpm build:portable`                                      | OpenNext/Cloudflare transform and Edge-middleware compatibility                                               | None for build; no deployment                                                     |
| End-to-end       | `pnpm test:e2e`                                            | Identity flows plus desktop/mobile deck authoring, publication, preview, cleanup, and appearance persistence  | Local Supabase and pinned Chromium                                                |
| Accessibility    | `pnpm test:a11y`                                           | axe and keyboard checks across public/Auth plus library, dialogs, rich editor, visual tools, and deck preview | Local Supabase and pinned Chromium                                                |
| Lighthouse       | `pnpm test:lighthouse`                                     | Public performance/accessibility/best-practice budgets                                                        | Chrome/Chromium                                                                   |
| Load smoke       | `pnpm test:load`                                           | Real `/api/health` availability and latency threshold                                                         | k6 `2.1.0`                                                                        |
| Hosted database  | `pnpm db:verify:preview` / `pnpm db:verify:beta`           | Remote migration/grant/RLS/schema/storage/type parity without seed or reset                                   | Authenticated Supabase CLI and explicit operator authority                        |
| Hosted smoke     | `pnpm test:hosted:preview` / `pnpm test:hosted:production` | Non-mutating public/auth/redirect/neutral-response/header/no-index behavior                                   | Deployed HTTPS URL, Chromium, fresh Vercel auth, and one existing project bypass  |
| Hosted content   | `pnpm test:hosted:preview:content`                         | Guarded disposable Auth/dashboard/appearance/basic-card/publication flow plus enforced cleanup                | Exact Preview, authenticated Supabase CLI, fresh Vercel auth, and existing bypass |
| Hosted SRS       | `pnpm test:hosted:preview:srs`                             | Guarded disposable reveal/four-rating/idempotency/undo/resume/statistics/isolation flow plus enforced cleanup | Exact Preview, authenticated Supabase CLI, fresh Vercel auth, and existing bypass |

`pnpm verify` runs the practical local aggregate, including local database reset/tests, database-type drift check, both production builds, browser and accessibility checks, Lighthouse budgets, and the k6 smoke test. It therefore requires Docker/Supabase, Chromium, and k6. The wrapper supplies deterministic, visibly inert configuration values without creating an environment file. Browser/a11y wrappers read the already-running local Supabase URL and generated keys into the child process without printing or writing them. Normal `pnpm build` and deployment builds remain strict and require real configuration. CI invokes the layers explicitly so cleanup and failure-artifact steps are reliable.

Hosted verification is intentionally outside `pnpm verify`: it is an explicitly authorized operator
action against provider state. Use only the guarded commands and targets in
[HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md). Never substitute a hosted project for local
`pnpm db:reset` or `pnpm test:db`.

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
- signed signup/onboarding age-gate structure, provider/normalized-email binding, callback nonce and expiry enforcement, exact-email and lifetime enforcement when a successfully password-authenticated incomplete identity exchanges its pending signup decision, raw Auth-identity rejection/minimization without that authority, under-13 pre-Auth refusal, final onboarding rejection of a client age field, and exchange for a separate Auth-session/payload-bound proof;
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

Phase 02 unit/property/UI coverage adds:

- all 17 card schemas, authoring definitions, bulk-import keys, and typed study-renderer contracts;
- deterministic generation for forward/reverse/optional/bidirectional, multiple/overlapping cloze,
  occlusion groups, and bidirectional diagram hotspots;
- stable-ID reconciliation, reactivation, obsolete-card deactivation, and typed corruption
  conflicts rather than semantic ID reuse;
- normalized rectangle/ellipse/polygon geometry round trips, invalid/degenerate rejection,
  accessible labels/aliases, and a generated-coordinate invariant;
- rich-document v1-to-v2 migration, strict validation, recovery sanitization, safe protocols,
  allowlisted privacy-enhanced video descriptors, and output encoding;
- a template XSS corpus covering raw/prototype/unknown/unbalanced syntax, attacker literals and
  fields, loop bounds, front inclusion, approved helpers, safe markup, property-based escaping,
  selector scoping, and unsafe CSS rejection;
- cosmetic/metadata/prompt/answer/structural content-impact classification, trusted plain-text
  derivation, optimistic conflict shape, and public-projection private-marker stripping;
- library empty/query-backed states, managed learner creation denial, search/filter/grid/list,
  canonical `/app`, and `/app/library` redirect behavior;
- exactly 17 card options, type-specific authoring surfaces, generated sibling preview, note save,
  and explicit conflict recovery choices;
- stable client idempotency keys across lost/retryable responses, rotation after success or a
  definitive rejection/payload edit, and typed conflict metadata across deck/folder/note/bulk
  mutation surfaces;
- labelled rich-editor toolbar/block palette, keyboard access, safe JSON serialization, visual
  region mode/list alternatives, and drawing typed fallback/undo/redo;
- media explicit-upload behavior, SHA-256/transcript payload, honest MediaRecorder unsupported
  state, coalesced recording starts, and track cleanup after late permission or unmount;
- service-only physical-media worker claim/remove/complete behavior, conservative provider `404`
  requeue, bounded retry outcome, contradictory completion rejection, and invalid operator bounds;
  and
- frozen public card flip/traversal/keyboard controls, attribution/license/type summary, safe return
  links, applied frozen theme variants, and no claim of persistent progress;
- readable immutable-version differences for card type, prompt, answer, source, and tags instead of
  count-only history summaries.

Appearance tests additionally cover self-only persistence, managed/unauthenticated rejection,
complete-tuple writes, optimistic stale-projection reconciliation, expired/rejected fallback,
cross-tab/storage synchronization, reconnect retry, operating-system reduced motion, and
identity-boundary reset. Auth redirect tests use `/app` as the default and reject encoded or
Auth/onboarding lifecycle loops while retaining valid public/protected destinations.

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

The Phase 02 pgTAP suite starts after the complete Phase 00/01 chain and verifies:

- every content, specialized-card, revision/version, media, and publication table exists and has
  RLS enabled;
- all 17 deterministic system note-type codes plus their static/sibling templates are present;
- generated-card uniqueness and folder-cycle enforcement are database constraints/triggers;
- the three public views are security-invoker/security-barrier and anonymous roles have no draft or
  history table privilege;
- authenticated roles cannot directly insert/update/delete content tables and the service role
  retains its narrow RPC-only posture;
- the atomic note/media upsert is security-definer with empty `search_path`, granted only to
  authenticated callers, while its standalone note/link/release components have no browser grant;
- media finalization is service-only and public publication reads cannot invoke publication
  mutation; and
- the migration-owned content bucket is private, size-bounded, and protected by all four object
  policies.

`supabase/tests/060_content_rpc_rls.test.sql` adds real owner/attacker/anonymous actors and exercises
folder-cycle denial, direct-write denial, idempotent deck creation, trusted note/source
normalization, stale optimistic-version rejection, stable card IDs, optional-reverse/cloze/diagram
generation identities, service-only media finalization, reference-count/delayed-deletion behavior,
authorized frozen publication, anonymous-versus-unrelated draft privacy, immutable public snapshots
after a draft edit, direct unlisted lookup without enumeration, and restore-as-a-new-head at the
database boundary. Exact assertion counts and command results belong only in
[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md).

`supabase/tests/070_content_account_deletion.test.sql` runs the existing due deletion worker with
real Phase 02 content. It denies a direct account-status bypass; verifies publication withdrawal,
deck/note/field/card/custom-note-type minimization, history-payload redaction with structural
coordinates retained, mutation-receipt removal, immediately eligible owned media, preserved audit
evidence, and exact replay idempotency. pgTAP verifies eligibility and durable queue semantics; the
worker unit suite verifies the provider removal protocol. Neither is evidence that a hosted
recurring schedule is deployed.

`supabase/tests/080_content_integration_hardening.test.sql` covers the composed note/media graph,
bulk tag/move behavior, exact library counts, private media resolution, derived publication-only
identities, unused custom-field removal—including raw anonymous frozen projections when unused field
names collide with template helper/block keywords—opaque published media replacement, and
service-only Storage location. `supabase/tests/090_content_guarded_read_volatility.test.sql` fixes
the PostgREST transaction contract for guarded reads that take the shared device/session lock.

`supabase/tests/100_content_security_audit_hardening.test.sql` exercises the adversarial follow-up:
browser denial for non-atomic note/link/release components; expected-version `0` creation and null
rejection across every versioned/bulk boundary; per-account/key receipt serialization; current
permission recheck after editor revocation; pending-object write authorization versus ready-object
immutability; and reference-count/delayed-deletion transitions for deck covers, audio,
pronunciation, and drawing usage. The migration also backfills authoritative counts and retires
stale usages belonging to deleted notes.

`supabase/tests/110_content_atomic_authoring_and_media_deletion.test.sql` verifies that the only
browser-callable note boundary atomically validates and resolves custom definitions, uses
copy-on-write schema evolution, and rolls definition creation back with a failed note command. It
also covers atomic deck-settings/publication behavior and grants, private media-job isolation,
service-only bounded claim/complete leases, full usage/publication eligibility rechecks, successful
locator tombstoning, retry backoff, stale-lease denial, and expired-lease recovery.

`supabase/tests/120_content_receipt_payload_binding.test.sql` statically verifies every legacy
browser-reachable content implementation uses the payload-bound receipt lookup, then exercises an
exact successful retry and a changed-payload rejection for every affected folder, note-type, deck,
note, bulk, publication, media-registration, and version-restore RPC family. It enumerates all 21
authenticated content mutation grants, retains changed-payload coverage for the self-fingerprinted
atomic note and settings/publication boundaries, rechecks an exact retry after collaborator
revocation, and verifies advisory-lock plus pending/completed receipt constraints. It also proves a
pre-binding unbound receipt fails closed and newly completed receipts retain canonical 64-hex
command fingerprints.

`supabase/tests/130_content_version_media_graph.test.sql` verifies schema-v2 immutable version
snapshots capture and atomically restore the exact authored media-reference graph, while legacy
snapshots reconstruct only their valid deck-local references. It covers the cross-deck media guard,
direct RPC payload validation, owner-only version duplication, and remediation of frozen
publication payloads that formerly retained internal media identifiers. It also pins the hosted
catalog-safe `STABLE` volatility of the public-payload, public-ID, and embedded-media helpers.

### Hosted database verification

The remote verifier links only to a fixed project reference, compares exact local/remote migration
history, dry-runs pending migrations, lints `public,private`, runs the read-only
`hosted_invariants.test.sql`, requires the migration-owned Storage inventory (exactly the private
`lumen-content-media` bucket after Phase 02) and zero recursive objects, checks schema diff, verifies
generated database types, and unlinks in a `finally` path. The hosted invariant transaction rolls
back and creates no data. Before invoking Supabase, every hosted action requires the exact regular
on-disk migration set to equal `git ls-files`, so an ignored file or symlink cannot bypass ordinary
Git cleanliness checks.
Deployment uses a separate guarded action; neither path contains seed, reset, repair,
`--include-all`, or config-push behavior.

Preview promotion requires a tracked, clean migration directory. Beta promotion additionally
fetches `origin/main` and refuses anything except a completely clean `main` whose `HEAD` exactly
matches it.

When a database test fails:

1. inspect the first failed migration/assertion;
2. fix it with a new migration if the original was already applied in a shared environment;
3. rerun `pnpm db:reset` and the entire database suite;
4. regenerate types with `pnpm db:types` if the public schema changed.

Then run `pnpm db:types:check`; a migration and generated contract that disagree is a failure, not a reason to hand-edit the generated file.

CI always stops the local Supabase stack, including on failure. It does not upload environment/status output that could contain local secret keys.

## Hosted deployment smoke tests

The hosted runner has no local fallback, rejects non-HTTPS, credential-bearing, or non-origin
targets, and preflights the selected Vercel environment plus exact public Preview/Beta Supabase
project reference before Playwright starts. Its eleven checks cover the public landing page and canonical apex; safe
health/capability projection; auth-page rendering with OAuth disabled; protected-route redirect;
unsafe-return normalization; neutral invalid callback/confirmation routing; neutral recovery
initiation for a reserved nonexistent address plus host-only production cookie attributes;
rejection of the retired Production origin for a mutation; unauthenticated sign-out; random missing
public/embed projection denial; security headers; and site-wide no-index. It creates no Auth user
and submits no personal information.
Recovery initiation creates the normal bounded private rate-limit record under a server-HMACed
subject; it does not store the reserved test address. Every run treats a hostname match only as an
early filter: an authenticated `api.vercel.com` lookup first binds the exact URL/alias and ready
deployment to the linked project/team and requested target. A second read-only project GET requires
exactly one existing `automation-bypass` entry; the runner never creates, rotates, replaces, or
`PATCH`es it. An optional transient `VERCEL_AUTOMATION_BYPASS_SECRET` must equal that discovered
token. The runner uses the bypass once to mint a validated exact-host `_vercel_jwt`, removes both
long-lived Vercel credentials and other inherited operator/provider secrets from the child, and
installs no global Playwright request headers. The cookie-bearing attestation is a mode-`0600`
ephemeral file inside the child's fresh mode-`0700` sterile runtime; configurations use no-follow
and inode checks, only its locator enters the environment, and the parent destroys it when the
Playwright process tree exits. The child receives an allowlisted environment plus
an empty temporary home/config tree, not the operator's Vercel, Supabase, npm, cloud, SSH, or
database credential locators. CI supplies `VERCEL_TOKEN` and the standard project/team link
variables. Local operators run `npx vercel@56.3.0 whoami` immediately before each suite because the
runner validates but does not refresh the short-lived CLI OAuth access token. Trace capture stays
off while the scoped cookie is present.

Use `HOSTED_PREVIEW_URL` or `HOSTED_PRODUCTION_URL`, or pass an explicit `--url` through the runner
as documented in [HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md). Live email confirmation, delivered
recovery mail, custom SMTP, and OAuth remain provider-gated and are not simulated by this suite.

The canonical Production invocation is:

```bash
pnpm test:hosted:production --url https://recallflash.com
```

### Guarded Phase 02 Preview content acceptance

The persistent hosted flow is deliberately separate from the non-mutating baseline and is valid
only against this repository's Vercel Preview hostname family:

```bash
npx vercel@56.3.0 whoami
pnpm test:hosted:preview:content --url https://<exact-preview-host>.vercel.app
```

Before retrieving that key or creating an identity, the wrapper rejects Production aliases and
authenticates the exact ready Preview URL/alias, project, team, and environment through the fixed
Vercel API origin. It then reads that exact project's bypass inventory without mutation, requires
exactly one existing automation entry, and requires `/api/health` to report Vercel `preview`, a
non-development build, and the exact public Preview Supabase project reference. The bypass is sent
only after ownership authentication. The wrapper validates Vercel's same-origin cookie redirect,
then gives Playwright the host-scoped cookie through the private ephemeral file rather than a global
header or credential environment value. The wrapper generates one UUIDv4 run identity and reserved
`example.test` address and captures the fixed Preview project's secret key in parent memory through
the authenticated Supabase CLI. The parent creates and confirms only that exact Auth fixture through
Admin Auth, then writes a nonsecret completion marker in the child's private sandbox; the server key
never reaches a worker. This deliberately removes outbound SMTP from the disposable proof. The
browser still performs the public neutral signup/check-email flow, the retained `/app/decks/new` onboarding return,
the default `/app` sign-in return, zero-count empty library, durable dark theme through
settings/reload, deck creation, basic front/back/source save and reopen, card-browser inspection,
publish/anonymous reveal, and anonymous denial of both the exact slug and public ID after
unpublish, followed by deck deletion. The successful sign-in against the parent-provisioned Preview
identity also proves the application is using Preview Auth rather than the Beta project.
The reopen assertion parses the created note ID from the 201 response and waits for that exact
`?note=<id>` navigation before reloading, so it cannot accidentally assert against a fresh draft.

Normal test failure and the first graceful `SIGINT`/`SIGTERM` reach one cleanup attempt. It
serializes with other hosted database operations, links only the fixed Preview project, finds only
the exact email/run marker, uses provisional rejection or the normal reauthenticated due
account-deletion boundary, and asserts Auth removal, publication withdrawal, privacy-minimized
content tombstones, and zero recursive objects in `lumen-content-media` before unlinking/releasing
the lock. Required opaque/structural and append-only audit evidence remains. Cleanup failure,
`SIGKILL`, or process/host loss requires operator inspection and is never reported as leak-free. Do
not invoke `e2e/hosted-content.spec.ts` directly: that bypasses the key lifetime, locking, signal,
and cleanup contract. After success, rerun `pnpm db:verify:preview` and record exact results in
[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md).

## Playwright end-to-end tests

Install the exact browser revision associated with Playwright `1.61.1`:

```bash
pnpm exec playwright install chromium
```

The Playwright `webServer` configuration owns starting/stopping an isolated app instance for browser tests. The harness clears only generated `.next/dev` output before startup so a preceding production build cannot leave stale development CSS or route artifacts. Tests never reuse a developer's existing server.

Current public browser coverage opens at least:

- `/` at the exact 1920×1080, 1536×1024, 1440×900, 1280×800, 1024×768,
  768×1024, 430×932, 390×844, 360×800, and 320×568 acceptance matrix;
- the public header, hero, principles, and footer with computed shared-container alignment, bounded
  hero wrapping, contained actions/illustration, practical touch targets, and no page-level
  horizontal overflow;
- the landing page at a 125% browser-zoom equivalent and at 200% text enlargement with deliberately
  long translated-style navigation labels;
- every public/Auth status surface at 320 px with 200% text enlargement, including the signed-out
  onboarding redirect and not-found route;
- `/join/[code]` and confirms the form never reports a joined nonexistent room;
- a protected settings route and onboarding while signed out, preserving only the safe return destination;
- the under-13 guardian path without sending an Auth mutation or revealing account credential/provider fields;
- one desktop local-email path through signed age-gated signup provisioning, onboarding, dashboard access, and locked child-profile settings;
- `/dev/design-system` with production indexing disabled;
- reduced-motion behavior;
- responsive navigation exposing only implemented destinations, with keyboard activation, Escape
  closure, and focus restoration for the compact disclosure;
- implemented preference controls and representative widget keyboard flows.

Phase 02 browser coverage creates a fresh local adult account on desktop and mobile, preserves the
safe `/app/decks/new` return through signup/onboarding, verifies all 17 choices, persists explicit
dark appearance across protected navigation, creates a typed-answer deck/note/tags/source, observes
its generated sibling, publishes it, flips the frozen public card by keyboard, checks no internal
ID leaks or progress claim, opens the read-only embed projection, then unpublishes/deletes the deck.
The flow removes its product content; the local database reset remains the authoritative fixture
cleanup between suites.

Traces, screenshots, and video are diagnostic artifacts, not assertions. CI uploads Playwright reports/test results only after a failure and retains them briefly.

## Accessibility

`pnpm test:a11y` runs axe against the landing, Auth entry/status, onboarding, guest join, privacy,
terms, safety, copyright, design-system, authenticated library, deck creation/editor, visual-region
list, dialogs, and public card preview routes and fails on serious or critical violations. It
also checks the landing page in explicit light and dark themes, serious mode, operating-system
reduced motion, and with the compact navigation open; keyboard assertions verify skip-link focus,
visible primary-action focus, and compact-navigation behavior. The live local signup smoke also
checks the authenticated onboarding surface. Automated axe checks complement, but do not replace:

- complete keyboard traversal and escape behavior;
- visible focus and sensible focus restoration;
- semantic heading/landmark order;
- screen-reader names/descriptions/errors;
- live-region announcements without duplicate noise;
- 44 px practical target sizing;
- non-color status/progress cues;
- outer card-preview shortcuts ignoring nested inputs, buttons, links, editable content, and canvas
  controls;
- visual-region list editing, drawing typed fallback, recording cleanup, and prompt-before-reveal
  behavior without relying on pointer pixels alone;
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
- Phase 02 owns a large deck/library query fixture that exercises bounded list/query behavior
  without seeding hosted data. Import and multiplayer fixtures remain owned by their later phases.

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

## Phase 03 scheduling verification

`packages/srs/tests` covers exact upstream FSRS fixtures for every rating, state transitions,
short-term/relearning steps, retention and maximum interval, fuzz/no-fuzz, memory values, rollback,
forget, replay/rebuild/migration, genuine SM-2, optimizer gating, property bounds, time zones/DST,
study-day cutoffs, all queue modes, deterministic resume, and typical/10,000-card budgets.

`supabase/tests/150_srs_schema_and_rpc.test.sql` covers schema, RLS, exact grants/search paths, lazy
creation, complete-command idempotency, exact-response receipts, replay before mutable context,
altered-request denial, stale versions, append-only evidence, compensation, rebuild/replay, profile
isolation, public/deck-owner denial, inactive content, session limits, sibling/leech/manual/bulk/
content/filter/migration/deletion behavior. Test 155 measures 10,000-card
queue, Today, resume, and statistics query plans. Its actor has a registered Auth-session device,
the bulk fixture is analyzed before measurement, and a visibility assertion proves the timings are
for all 10,000 authorized rows rather than a fast RLS-denial path. `scripts/test-srs-concurrency.mjs`
uses two real database connections and requires exactly one commit, one typed stale conflict, one
log, and a sub-500 ms canonical mutation.

Web unit tests cover trusted route calculation, authorized HTTP replay before mutable session
preflight, malicious transition rejection, answer DOM separation, keyboard/typed/safe-swipe
behavior, duplicate-submit coalescing, preview-only behavior, truthful accessible statistics, and
deterministic repository pagination. `e2e/srs-review.spec.ts`
provisions isolated local learners and exercises pause/resume, lazy controls, reveal, typed answer,
keyboard review, canonical persistence, statistics, mobile Chromium, and axe. The aggregate
`pnpm verify` remains the final local gate and resets the database before pgTAP.

`e2e/phase-three-layout.spec.ts` is the visual and responsive acceptance layer for Study, deck
entry, custom queues, scheduling disclosure, review states, undo, statistics/history, content
decisions, serious mode, reduced motion, 320 px mobile, and 200% text. It waits for route-specific
stable content before measuring layout or capturing private diagnostic screenshots. The hosted
counterpart is `e2e/hosted-srs.spec.ts`, and it may run only through the guarded wrapper described
in [HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md). Its final isolation probe uses an independent
cookie-less transport with only the already-attested, exact-host Vercel bypass cookie; it asserts
that the streamed sign-in boundary contains no disposable deck title or private statistics.

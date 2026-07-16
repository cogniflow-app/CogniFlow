# Architecture decisions

**Project:** Lumen (temporary, configuration-driven brand)  
**Decision baseline:** Phase 01  
**Last updated:** 2026-07-15

This file is the architectural decision record (ADR) for implementation choices that affect more than one package or phase. The product target remains canonical in [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md). A later decision must add a new ADR and mark the earlier record superseded; do not silently rewrite a decision after it has shipped.

## Decision index

| ADR  | Decision                                               | Status                           |
| ---- | ------------------------------------------------------ | -------------------------------- |
| 0001 | Pinned Node and pnpm Turborepo workspace               | Accepted                         |
| 0002 | Mutually compatible dependency baseline                | Accepted                         |
| 0003 | Framework-independent domain and provider boundaries   | Accepted                         |
| 0004 | Typed environment and deployment-profile capabilities  | Accepted; qualified by 0015      |
| 0005 | Accessible, token-driven design system                 | Accepted                         |
| 0006 | Migration-first Supabase foundation                    | Accepted; qualified by 0012      |
| 0007 | Vercel beta plus provisional OpenNext portability      | Accepted; qualified by 0015/0016 |
| 0008 | Layered verification and controlled dependency updates | Accepted                         |
| 0009 | Account and learner identity are separate boundaries   | Accepted                         |
| 0010 | Child capability requires a consent-verifier adapter   | Accepted; qualified by 0015      |
| 0011 | Opaque session, privacy-job, and audit boundaries      | Accepted; qualified by 0015      |
| 0012 | Narrow public RPC entry points for PostgREST           | Accepted exception               |
| 0013 | Callback-bound age eligibility                         | Accepted                         |
| 0014 | Active learner owns the appearance projection          | Accepted                         |
| 0015 | Production Auth is HTTPS-only; managed identity is off | Accepted with launch gate        |
| 0016 | Edge middleware owns portable cookie refresh           | Accepted                         |

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

For `vercel_beta`, child profiles are forcibly disabled even if a tampered environment variable says otherwise. ADR-0015 strengthens this to every production runtime until managed learners have an independent opaque identity boundary. The UI receives only a sanitized capability subset. Production configuration fails at startup/build when required values are missing or malformed; deterministic defaults are restricted to tests and documented local development. Production application and Supabase origins must use HTTPS.

Next production build, export, analysis, and server phases force production validation regardless of an inherited `NODE_ENV`, including a stable 32-byte base64 Server Action encryption key. Verification commands inject a fixed, visibly inert environment without writing `.env.local`; normal builds and deployments remain strict.

Brand text comes from `NEXT_PUBLIC_APP_NAME`, with a safe default in the centralized brand module. Build metadata exposed by `/api/health` is non-sensitive.

## ADR-0005: Accessible, token-driven design system

**Decision.** Build the reusable UI in `packages/ui` with semantic CSS custom properties and typed component APIs. Radix supplies behavior for complex widgets, but visual appearance is original. Components use semantic HTML first, visible focus, keyboard interaction, live regions where state changes, and non-color status cues.

Theme preference supports light, dark, and system. Reduced motion follows `prefers-reduced-motion`; serious mode is a separate user preference that removes celebratory motion and sound without changing OS preferences. Motion is progressive enhancement, so card flip and game-ready primitives retain a meaningful non-motion state.

Fonts are stored in the application dependency/build output and never fetched from a third-party font CDN at runtime. SVG brand and empty-state art is original and replaceable.

The public shell loads only token and bespoke route styles. The full Tailwind component inventory is emitted as a separate design-gallery route chunk, so a developer verification surface does not become render-blocking public CSS. Plain public navigation anchors avoid speculative product-route prefetch traffic before authentication and data routes exist.

## ADR-0006: Migration-first Supabase foundation

**Decision.** Supabase provides Postgres, Auth, Storage, and Realtime. Schema changes are append-only migration files. An applied migration is never edited or reordered. Phase 00 creates only safe database conventions and a private helper schema; it does not pre-create the product schema from the blueprint.

Every future table reachable through an exposed API schema must enable RLS before use. Security-definer policy helpers and reusable privileged implementations live outside exposed schemas. ADR-0012 later narrows the schema-location rule only for minimal PostgREST-callable transaction wrappers. Every privileged function sets an explicit or empty `search_path`, validates and authorizes its boundary, receives minimal grants, and has database tests. Views exposed through the API are security-invoker or isolated from exposed schemas.

Browser, server, Route Handler, and test database clients have separate factories. The browser factory can receive only the publishable key. The secret key is server-only and never exported through a public module.

Generated TypeScript database types are reproducible through `pnpm db:types`; generated output is not hand-edited.

## ADR-0007: Vercel beta plus provisional OpenNext portability

**Decision.** Vercel is the preview and initial 13+ beta target. Node 24 is selected for Vercel builds and functions. The portable candidate uses OpenNext for Cloudflare Workers and is validated with `pnpm build:portable`.

OpenNext uses the Next.js Node runtime for application handlers. OpenNext's Node Middleware support is not yet complete, so correctness and authorization never depend on Node request interception. ADR-0016 uses the Edge-compatible `middleware.ts` contract only for best-effort cookie refresh/path forwarding. Domain packages contain no Vercel or Cloudflare API calls.

The Cloudflare path is an engineering portability candidate, not a child-safety or legal approval. ADR-0015 keeps managed/under-13 profiles disabled in every production runtime, including Cloudflare, until an independent opaque managed-learner identity boundary exists. Provider, privacy, consent, retention, incident-response, and legal gates in [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md) and [DEPLOYMENT.md](./DEPLOYMENT.md) remain additional requirements rather than substitutes for that technical boundary.

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

## ADR-0009: Account and learner identity are separate boundaries

**Context.** A person may learn, create, host, and teach without selecting a mutually exclusive account role. Study state belongs to a learner context, while authentication providers, email, devices, privacy requests, and administrative controls belong to the account. Guardian and future school relationships must not make account-private data visible to a child or observer.

**Decision.** Supabase Auth owns authentication identities. `public.profiles` is the one-to-one application account record, and every eligible non-anonymous Auth user is transactionally provisioned with:

- a private-by-default `privacy_preferences` row;
- independent `learn`, `create`, `host`, and `teach` capability rows; and
- exactly one `self` `learner_profiles` row plus explicit self access.

Provisioning is retriable and concurrency-safe through transaction advisory locks, unique constraints, and idempotent inserts. Anonymous Supabase Auth users are not provisioned; Phase 01 game guests use a separate pseudonymous guest identity.

Learner authorization is relational. `learner_profile_access` contains a role and explicit permission set, while an active guardian role must also have an active `guardian_relationships` row. A teacher observer receives only the `get_observed_learner_profiles()` projection and cannot select a full learner record. User-editable Auth metadata is never a capability source.

Authenticated clients receive only RLS-scoped reads and narrowly granted `current_*` RPCs. Direct table mutations are not granted. Every account-level `current_*` mutation derives the actor from `auth.uid()`, derives the Supabase Auth `session_id` from the verified JWT, requires the matching unrevoked application device, and takes the same transaction advisory lock used by managed-profile switching. The mutation and the self-context check therefore occur in one transaction; an application precheck may improve error handling but is not the authority. The runtime obtains authentication-profile state and registers a request device through narrow service-only RPCs that verify `auth.sessions`; the service role deliberately has no broad `SELECT` grant on identity tables. Service-only `admin_*` functions remain implementation or infrastructure boundaries for provisioning, device registration, opaque-session resolution, school authorization, deletion execution, rate limiting, guests, and generic audit writing. UI visibility and the session-refresh middleware are not authorization boundaries.

**Consequences.**

- Account settings require the self learner context; a child context cannot inherit the guardian's email, providers, devices, privacy jobs, or administrative controls.
- New domain tables must reference the learner profile for study state and the account only for account-owned state.
- Future school/class flows reuse permissioned access and safe projections rather than adding role claims to Auth metadata.
- `packages/auth` contains framework-independent input, redirect, provider, profile, privacy, nickname, guest, and cache-isolation contracts; provider and database execution remains in server adapters.

## ADR-0010: Child capability requires a consent-verifier adapter

**Context.** A feature flag alone cannot demonstrate parental consent or make a hosting profile appropriate for under-13 users. Local development needs a deterministic path for exercising guardian boundaries without describing test evidence as verified consent.

**Decision.** Child-profile activation requires all of the following at the server boundary:

1. a nonproduction local/test runtime (including a nonproduction Cloudflare-shaped adapter test), never a production runtime;
2. `ENABLE_CHILD_PROFILES=true`;
3. a compatible `PARENTAL_CONSENT_MODE`; and
4. successful evidence from the `ParentalConsentVerifier` adapter before the authenticated atomic child-creation transaction runs.

`test_only` is valid only for local/test profiles and produces evidence explicitly labelled `local_test`. `external_verified` is implemented for the portable Cloudflare adapter and may be exercised only in a nonproduction Cloudflare-shaped environment while ADR-0015 remains active. Its bounded HTTP adapter requires a server-only verifier URL and API key, sends an HMAC-pseudonymized account subject instead of an email together with the learner age band, policy version, and requested scope, and accepts only an affirmative response with a bounded evidence reference. It uses an eight-second timeout, an 8 KiB response limit, requires HTTPS whenever used with production-grade endpoints, and fails closed on transport, status, parsing, or evidence errors. The adapter is implemented but not live-verified without owner provider credentials; it is not a checkbox fallback and cannot override the production managed-identity gate.

`NODE_ENV=production`, `DEPLOYMENT_PROFILE=vercel_beta`, and the provider-owned `VERCEL=1` marker each force child profiles and parental-consent mode off regardless of other input. The database records grants and revocations as append-only `consent_records`; revocation locks a child with no remaining active guardian and revokes affected access and profile sessions.

**Consequences.**

- Enabling environment flags cannot make any current production deployment child-capable.
- A portable build passing does not live-verify consent or child eligibility.
- After a future opaque managed-identity boundary supersedes ADR-0015, production verifier credentials and live provider verification, direct parent notice, processor review, retention, incident response, and legal approval remain additional owner launch gates.
- Public child content is a separate capability and stays false even in child-enabled local tests unless explicitly exercised.

## ADR-0011: Opaque session, privacy-job, and audit boundaries

**Context.** Learner switching, destructive requests, and accountless game entry need limited identities without creating reusable plaintext database credentials. Export and deletion controls need durable, auditable request/job state and a deletion boundary that can preserve required evidence without preserving a live identity.

**Decision.** High-entropy raw credentials are issued only to narrowly scoped HttpOnly cookies or held inside one server request. Postgres stores fixed-length SHA-256 digests for profile-session tokens, guest reconnect tokens, re-authentication proofs, onboarding authorization proofs, and child-creation authorization proofs. Learner PINs and new 16-character, unambiguous family codes use independent cost-12 salted bcrypt hashes. A legacy 32-byte family-code digest is accepted only so an applied deployment can rotate it; newly written family-code hashes are 60-byte bcrypt strings.

A signed onboarding cookie or affirmative consent-verifier response is a server-route input, not a database capability. The server exchanges each accepted route decision for an independent random proof whose digest, exact canonical payload digest, account, verified Auth session, and maximum ten-minute expiry are stored in a private ledger. The corresponding authenticated `current_*` RPC recomputes the payload digest, locks the ledger row, consumes the proof once, clears its digest, and records the terminal state. A finalization trigger prevents later proof or payload rewriting. Child proof issuance is reachable only through the strict service wrapper that accepts the privacy-safe settings/scope allowlist; the lower-level issuer and child-creation implementation are not service-callable.

Devices and learner-profile sessions are bound to the verified Supabase Auth `session_id`, not merely to an account or a reusable browser identifier. The usable managed-study window is capped at 30 minutes, but an unrevoked managed-session row remains an account-settings lock after that study window expires. Only a reauthenticated guardian exit, credential/access/device revocation, sign-out, or another explicit revocation releases it. This prevents expiry from silently restoring guardian controls while a child still has the browser. Current-device sign-out is intentionally available even while managed mode is active and revokes only the JWT-bound application device/profile sessions. All-device sign-out is a separate self-context operation that consumes a fresh `security_change` reauthentication proof before revoking every application device. Both paths revoke Postgres state before Supabase refresh-session invalidation, so an already-issued access token is denied by RLS even if provider invalidation fails or has not propagated.

An account owner may also revoke one selected learner-profile session without revoking its containing application device. The authenticated `current_revoke_profile_session()` wrapper derives and locks self context, verifies that the target session belongs to the account, locks the target Auth-session boundary, consumes a fresh single-use `security_change` reauthentication proof, and delegates to the service-only implementation. It records the selected session revocation and audit fact while leaving unrelated account sessions and the device active.

Password recovery uses two signed states rather than trusting a callback query. Before requesting the email, the server issues an at-most-15-minute SameSite=Lax pending cookie bound to a random callback nonce hash, an HMAC of the normalized email subject, and the safe return path. `/auth/callback` and `/auth/confirm` validate that state only after Supabase establishes the recovered session; a missing, expired, mismatched, or query-only `intent=recovery` path signs the local session out and fails closed. Only that successful exchange creates the separate account-bound, SameSite=Strict, at-most-10-minute recovery capability used by the password-update route.

Application rate limits use fixed-window counters in the non-exposed `private` schema. Request-context subjects derived by server adapters, including network/account combinations, are HMAC-pseudonymized before reaching Postgres; raw network addresses are not stored. RPC-internal per-resource buckets derive a separate SHA-256 key from an already-authorized profile/account UUID. Separate buckets protect authentication, email recovery, PIN attempts, guest admission, exports, deletion, and other destructive requests.

Export and deletion requests create durable `privacy_requests` plus dedicated job rows. Archive assembly and expiring download creation remain later portability work. Phase 01 implements a service-only, idempotent deletion-worker transaction for a due job: it removes the Supabase Auth principal and product secrets, revokes access and active evidence, minimizes mutable identity rows into opaque account/learner tombstones, and preserves the required workflow plus append-only consent/audit history. The repository does not deploy a scheduler, so an owner-operated worker must call this boundary after the grace period. Account-deletion request and cancellation require a fresh password check and a short-lived, single-purpose, single-use server-side re-authentication grant.

A recent Auth identity that never presents valid callback/onboarding authority is not left as an independently usable raw Supabase account. The service-only provisional-rejection boundary accepts only incomplete, child-free onboarding accounts, revokes their application state, deletes the Auth principal, minimizes the profile/self learner into opaque tombstones, and records an idempotent audit fact. Completed accounts cannot enter this fast rejection path.

Sensitive accepted mutations append privacy-minimized `audit_events` with a correlation/idempotency key. Audit uniqueness is scoped to event plus the complete actor identity, with `NULLS NOT DISTINCT`; an idempotent replay must also match its original target. This prevents one actor from colliding with another actor's correlation key. Consent and audit records reject update/delete; corrections are new rows or compensating events.

**Consequences.**

- Raw session and reconnect tokens must never appear in database rows, logs, telemetry, or client-readable responses.
- Onboarding and child-creation proof values are request-local only; the database and audit catalog retain digests and terminal facts, never the bearer proof.
- Generic administrative audit writing, guest creation/purge, rate-limit consumption, and session resolution remain service-only.
- Scheduled retention, export assembly, deletion-worker invocation, and guest cleanup must be deployed and monitored separately; configuration values and an RPC do not themselves run a scheduler.
- Guest admission depends on an injected room adapter. The production Phase 01 adapter contains no rooms, so fixtures cannot become joinable in a deployment.

## ADR-0012: Narrow public RPC entry points for PostgREST

**Context.** ADR-0006 keeps policy helpers and reusable privileged implementation details outside exposed schemas. PostgREST can call only functions in an exposed schema, while Phase 01 needs atomic transactional entry points for authenticated self-service and server-held service-role adapters.

**Decision.** Policy predicates, credential verification, provisioning internals, audit insertion, and rate-limit mutation remain in `private`. A deliberately callable transaction entry point may live in `public` and use `security definer` only as a narrow exception when all of these controls hold:

- it fixes an empty `search_path` and schema-qualifies every object;
- execute is revoked from `public` and granted by exact signature only to `authenticated` for self-service or `service_role` for administration;
- an authenticated `current_*` RPC derives its actor from `auth.uid()`, validates the JWT-bound Auth session and application device, holds the managed-session lock, and authorizes the affected resource in the same transaction;
- only guardian exit and exact current-device sign-out are intentionally permitted while managed mode is active; guardian exit derives the same account/session context and consumes a recent re-authentication proof, while current sign-out can only revoke that JWT-bound device/profile session and cannot expose account controls;
- account/learner implementation RPCs that accept an actor remain `service_role` only and revalidate actor/target authorization; application routes do not use them as a substitute for the atomic `current_*` boundary;
- a service-infrastructure RPC with no end-user actor—generic audit writing, shared rate limiting, guest creation/purge, or opaque session resolution—accepts only bounded, prevalidated server-adapter input and is never exposed as a client pass-through; and
- pgTAP covers grants, anonymous/authenticated denial, actor/target tampering where applicable, malformed state, and idempotent replay.

These public functions are API entry points, not policy helpers. The exception does not permit browser table writes, `public` execute grants, a mutable search path, user-editable metadata authorization, or arbitrary client payload forwarding.

**Consequences.** Function reviews must distinguish self-derived authenticated authorization, account/learner administrative authorization, and service-infrastructure preconditions instead of claiming every service RPC can infer an end-user actor. Later phases should prefer a private implementation plus the smallest possible public transaction wrapper and must record any broader exception in a superseding ADR.

## ADR-0013: Callback-bound age eligibility

**Context.** A client-supplied age choice or OAuth callback query is mutable. Provisioning a recent independent Auth identity before the age decision is bound would allow a new OAuth or delayed email-confirmation flow to bypass the neutral age gate.

**Decision.** Under-13 selection is handled before any independent-account Auth mutation and resolves to the guardian-required surface. Eligible password and OAuth sign-up attempts produce short-lived signed pending-age state. When Auth requires a provider/email round trip, it is attached as an HttpOnly cookie whose payload binds the eligible band, flow, intent, safe return path, expiry, and callback nonce hash; password signup also binds an HMAC-normalized email subject, and OAuth binds the configured provider. An immediate password session converts the same server-validated decision directly into the account-bound onboarding gate. The application callback accepts a recent new Auth identity only when its signed pending state and callback nonce match. A recent unprovisioned identity without a valid signup gate is signed out, rejected, and submitted to the service-only provisional-account rejection/minimization boundary. Existing application accounts remain compatible with ordinary sign-in/provider-link callbacks, while explicitly recognized older unprovisioned identities use a migration path that requires a fresh choice.

After successful authentication, the server issues a separate short-lived signed onboarding cookie bound to the Auth account, eligible band, safe return path, and nonce. Final onboarding does not accept an age band in its JSON body; the authenticated route reads the bound cookie, exchanges it and the exact payload for a random at-most-ten-minute Auth-session/payload-bound proof, and passes that proof to the atomic database RPC for one-time consumption. Both cookies are cleared on completion/sign-out and use production `Secure`, HttpOnly, and bounded lifetime settings.

**Consequences.** Auth metadata is not an age authority, callback query parameters are not sufficient proof, and a visible provider button does not create an alternate onboarding path. Changing the callback or cookie format requires compatibility and tamper/expiry tests.

## ADR-0014: Active learner owns the appearance projection

**Context.** Theme and stimulation settings are part of the learner experience. Browser-local state from a guardian session must not override the managed learner selected on the same device.

**Decision.** The protected layout resolves an authoritative appearance projection from the active learner context. A self learner uses the account profile's theme, reduced-motion, and serious-mode fields. A managed learner uses only its own bounded settings; missing managed values fail closed to reduced motion and serious mode. A server-rendered hydration script applies and stores this projection before interactive hydration, and a client synchronization event updates the global appearance provider after a successful profile save. Operating-system reduced-motion remains authoritative even when the stored preference is less restrictive.

**Consequences.** Local storage is a cache, not an authorization or ownership source. After the server accepts a profile switch, the client best-effort clears current learner/private namespaced local storage, session storage, and Cache Storage entries and dispatches the identity-boundary hook for later offline consumers. It then replaces the guardian document even when a browser storage API is denied or cleanup rejects, so stale in-memory guardian state is not left mounted. The selected learner's server projection overwrites stale browser appearance state, and later study/game surfaces must consume the same resolved attributes and cache-isolation contract.

## ADR-0015: Production Auth is HTTPS-only; managed identity is off

**Context.** The local/test managed-learner experience intentionally overlays a child-facing application context on a guardian-owned Supabase Auth session. Database RLS, application-device binding, and managed-session locks protect product-table access, but a browser that holds the guardian's Supabase bearer credential can still present that credential directly to Auth or to a future service outside those database checks. Consent verification does not remove that credential-confusion risk. Production cookies also require a transport classification that cannot be weakened by configuring an HTTP application or Supabase origin.

**Decision.** Every runtime with `NODE_ENV=production` forces managed child profiles, public child content, free-text game chat, and parental-consent mode off. The existing Vercel-profile and provider-owned `VERCEL=1` hard stops remain in addition to this universal production gate. Local and test runtimes continue to exercise the complete guardian, consent-ledger, profile-switch, managed-isolation, current-device sign-out, and guardian-exit behavior; those tests are not production activation evidence. The `external_verified` verifier adapter remains implemented and testable for future portability work, but it cannot enable a production child profile while this ADR is active.

Re-enabling managed learners in production requires a superseding ADR and an independent opaque backend-for-frontend identity: a child-facing browser must not receive or retain the guardian's Supabase access/refresh credentials, and the managed claim must be narrowly scoped, short-lived, revocable, bound to the selected learner and device/session, and independently authorized at every downstream boundary. RLS/session locks remain required defense in depth after that identity split.

Production configuration also requires HTTPS for both `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SUPABASE_URL`. Cookie factories derive `Secure` from the server's production classification rather than from a caller-controlled URL string, so Auth and application identity cookies cannot be emitted without `Secure` in production.

**Consequences.**

- No current Vercel, Cloudflare/OpenNext, or other production build can activate a managed learner by changing feature flags, consent mode, or verifier credentials.
- Passing local child-profile, portable-build, or external-verifier tests proves those boundaries only; it does not authorize a child-capable deployment.
- Email/password, magic-link, recovery, and optional OAuth integrations remain self-account flows in production and still require owner-side provider configuration and live verification.
- The legal/provider/consent launch gate remains necessary after a future opaque identity boundary is implemented; neither gate substitutes for the other.

## ADR-0016: Edge middleware owns portable cookie refresh

**Context.** Next.js 16's newer `proxy.ts` convention runs on the Node runtime, while the pinned OpenNext/Cloudflare transform requires the equivalent request interception to remain Edge-compatible. The application needs best-effort Supabase SSR cookie refresh and an internal request-path header on protected routes plus canonical public-shell families, but neither operation is allowed to become an authorization dependency.

**Decision.** Use `apps/web/middleware.ts` with the Edge-compatible Next middleware contract for `/app`, `/onboarding`, `/auth`, and the canonical public-shell route families: `/`, `/discover`, `/deck`, `/creator`, `/embed/deck`, `/join`, and the copyright/privacy/safety/terms pages. It forwards the exact pathname/query as the internal `x-lumen-request-path`, lets the route database client copy refreshed Auth cookies onto the response, and marks the response `private, no-store`. The middleware uses no Node-only runtime API and calls only `auth.getClaims()` for refresh. Protected Server Components, Route Handlers, and atomic RPCs continue to authenticate and authorize independently; middleware absence, failure, or stale state must never grant access.

The public-shell viewer consumes that header through a server-only, minimal identity projection. It treats Auth failure as anonymous availability, accepts only the canonical public route families after the shared encoded-navigation-hazard checks, and creates encoded sign-in/sign-up links for that safe return destination. A verified account receives `/app` instead. This projection controls only the public call to action; it does not grant product access or replace protected-route authorization.

**Consequences.** Every new public-shell family that should preserve return intent must be deliberately added to both the middleware matcher and public-return allowlist and tested against traversal, external-origin, API/auth/account-route, and double-encoded navigation attempts. Both `pnpm build` and `pnpm build:portable` are required after changes to request interception, Supabase SSR cookie handling, or Next/OpenNext versions. A live provider preview remains necessary before promotion because a successful transform proves compatibility, not deployed routing or cookie behavior.

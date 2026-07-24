# Architecture decisions

**Project:** Lumen (temporary, configuration-driven brand)  
**Decision baseline:** Phase 05  
**Last updated:** 2026-07-23

This file is the architectural decision record (ADR) for implementation choices that affect more than one package or phase. The product target remains canonical in [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md). A later decision must add a new ADR and mark the earlier record superseded; do not silently rewrite a decision after it has shipped.

## Decision index

| ADR  | Decision                                                          | Status                           |
| ---- | ----------------------------------------------------------------- | -------------------------------- |
| 0001 | Pinned Node and pnpm Turborepo workspace                          | Accepted                         |
| 0002 | Mutually compatible dependency baseline                           | Accepted                         |
| 0003 | Framework-independent domain and provider boundaries              | Accepted                         |
| 0004 | Typed environment and deployment-profile capabilities             | Accepted; qualified by 0015      |
| 0005 | Accessible, token-driven design system                            | Accepted                         |
| 0006 | Migration-first Supabase foundation                               | Accepted; qualified by 0012      |
| 0007 | Vercel beta plus provisional OpenNext portability                 | Accepted; qualified by 0015/0016 |
| 0008 | Layered verification and controlled dependency updates            | Accepted                         |
| 0009 | Account and learner identity are separate boundaries              | Accepted                         |
| 0010 | Child capability requires a consent-verifier adapter              | Accepted; qualified by 0015      |
| 0011 | Opaque session, privacy-job, and audit boundaries                 | Accepted; qualified by 0015      |
| 0012 | Narrow public RPC entry points for PostgREST                      | Accepted exception               |
| 0013 | Callback-bound age eligibility                                    | Accepted                         |
| 0014 | Active learner owns the appearance projection                     | Accepted; qualified by 0018      |
| 0015 | Production Auth is HTTPS-only; managed identity is off            | Accepted with launch gate        |
| 0016 | Edge middleware owns portable cookie refresh                      | Accepted                         |
| 0017 | Semantic card identities and frozen publications                  | Accepted; qualified by 0019/0020 |
| 0018 | Mutation-aware appearance and workspace returns                   | Accepted; qualifies 0014         |
| 0019 | Retry-stable atomic authoring and leased media cleanup            | Accepted; qualifies 0017         |
| 0020 | Versioned media graphs and fail-closed projections                | Accepted; qualifies 0017/0019    |
| 0021 | Trusted SRS calculation plus transactional commit                 | Accepted; qualifies 0012         |
| 0022 | Practice mastery is separate evidence with explicit SRS promotion | Accepted                         |
| 0023 | Profile-namespaced offline projections and authoritative replay   | Accepted                         |

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

## ADR-0017: Semantic card identities and frozen publications

**Context.** One authored note may generate multiple independently scheduled cards. Display order,
mutable field text, and database row IDs are not sufficient generation identities. Public deck
preview also needs to remain available without granting anonymous access to mutable drafts,
membership, revision history, owner identifiers, or private storage metadata.

**Decision.** `packages/domain` owns the framework-independent schema for all 17 Phase 02 card
kinds, deterministic semantic generation, safe study-renderer contracts, rich-document migration,
template compilation, and content-change classification. Each generated card uses a canonical key
derived from generation-schema version, card kind, and semantic key. Reconciliation preserves or
reactivates the stored card ID for the same key, creates a row for a new key, and deactivates an
obsolete key. It never reassigns an existing card ID to different semantics. Database uniqueness
on note/template/generation key is a second enforcement boundary.

Authoring writes use actor-derived, version-checked, idempotent Postgres transactions. Creation at
a versioned upsert boundary uses the explicit expected-version sentinel `0`; every update and bulk
version vector must contain a non-null expected version. A null version is never a wildcard. When a
browser-created note does not yet have an ID, the atomic boundary derives its stable note ID from
the required idempotency UUID before entering the upsert implementation. Typed stale-version
detail is raised as user exception `P0001`, not serialization failure `40001`, so infrastructure
does not automatically retry a command already known to be stale. Per-account/idempotency-key
advisory locks serialize concurrent retries before receipt lookup, and a replay rechecks the
actor's current resource permission before returning the stored result. A collaborator cannot
retain mutation authority by replaying a receipt after access is revoked.

Note fields, specialized payload, sources, tags, explicit media links, generated siblings,
revision, deck-version bump, and impact classification are one atomic mutation graph. The browser
can call only that composed note/media boundary; the component note/link/release functions are
implementation details without browser-role execute grants. Note revisions and deck versions are
immutable snapshots; restoring a version creates a new head. Material-edit records classify an
impact for a future `preserve`, `relearn`, or `reset` choice but cannot mutate scheduling because
Phase 02 creates no schedule rows.

Rich content is versioned ProseMirror-compatible JSON plus trusted-boundary plain-text extraction.
Templates compile to a bounded AST with escaped fields, front-side inclusion, nonempty
conditionals, bounded list iteration, approved helpers, and scoped allowlisted CSS. Arbitrary
JavaScript, raw interpolation, network-capable template output, untrusted iframes, event handlers,
global CSS escape, and server evaluation are invalid.

Publishing atomically copies the current authorized content into deliberately minimal frozen
publication tables. Published cards receive deterministic publication-only IDs, unused custom
fields are removed, and attached internal media IDs are replaced by opaque media publication IDs.
Normal anonymous table/view reads enumerate only `public` rows through RLS and security-invoker
views. Narrow read-only RPCs can resolve an exact `public` or `unlisted` opaque ID or slug. Draft
tables, member rows, internal owner/card/media IDs, revisions, mutation receipts, storage locators,
and learner state never enter the client projection. A service-only locator projection exists only
to mint bounded signed delivery URLs. The underlying bucket remains private.

Storage objects are never mutable through a browser credential. The authenticated Route Handler
validates request size, digest, declared/detected MIME, magic bytes, and image dimensions before a
server-only client writes the exact pending object and a service-only RPC finalizes it. This keeps
the verified buffer and stored bytes on one trusted path. Explicit links plus deck covers, audio
prompts, pronunciation references, and drawing reference layers all participate in one
authoritative usage count. Active use revives an asset scheduled for deletion; the transition to
zero uses schedules the seven-day cleanup deadline. Physical byte removal remains an operated
worker boundary.

**Consequences.**

- Phase 03 schedules point to durable card IDs and can treat siblings independently.
- A template/card-type schema change must version the semantic key contract or provide a tested
  compatibility adapter; changing display order alone cannot change identity.
- Public rendering consumes the frozen projection and the same safe domain render contracts as
  authenticated preview, not draft table access or trusted stored HTML.
- Unlisted resources are direct-link readable but excluded from public enumeration and receive
  `noindex`; password links and advanced sharing remain Phase 07 work.
- The media bucket can use one private namespace because authorization depends on registered
  ownership/reference/publication rows rather than path obscurity.
- Actor-scoped reads that reuse the device/session guard are declared `VOLATILE`: the guard takes a
  row lock, so PostgREST must not place those functions in a read-only transaction.

## ADR-0018: Mutation-aware appearance and workspace returns

**Context.** ADR-0014 correctly makes the active learner's server projection authoritative, but
the prior public Appearance control wrote only browser-local state. Entering the protected
Workspace rendered the account's older `system` tuple, and the account hydrator applied that
projection unconditionally, resetting the user's fresh explicit light/dark choice before any
durable account mutation existed. Even once persistence is introduced, navigation can briefly
return a projection rendered before the in-flight write. Authentication flows also need one
canonical safe destination without accepting a return to an Auth/onboarding lifecycle route.

**Decision.** Account appearance controls optimistically apply a complete theme, reduced-motion,
and serious-mode tuple and attach a short-lived mutation identifier. A same-origin authenticated
route persists that complete tuple through the existing self-context profile mutation. The pending
write is serialized, shared across tabs, retried after reconnect, and becomes confirmed only after
the server accepts it. During a bounded 24-hour reconciliation window, that pending or confirmed
mutation may temporarily win over a differing protected-layout projection so a stale render cannot
undo the user's accepted choice. A rejected/expired write is discarded and the active learner's
server projection wins again. Managed learner contexts cannot persist account appearance.

The server bootstrap applies the chosen tuple before interactive hydration. System color is
resolved from the operating system; operating-system reduced motion remains the most restrictive
input. Serious mode and explicit reduced motion remain independent stored preferences even though
either results in low-motion presentation. Storage and custom events synchronize tabs. An identity
boundary clears the browser tuple/write metadata before the next active learner projection is
adopted, preserving ADR-0014's shared-device isolation.

Precedence is deterministic:

1. on a protected self route, the account's server projection wins;
2. the sole temporary exception is a fresh pending/confirmed complete-tuple account mutation (at
   most 24 hours old), which may outrank a stale render while the write confirms/retries;
3. on a managed route, the learner's server projection wins and guardian-local state is discarded;
4. on an anonymous/public route, a valid browser-local explicit tuple wins; no appearance cookie is
   used;
5. without stored color intent, `system` delegates only color resolution to the operating system;
   operating-system reduced motion is always an additional restrictive input; and
6. malformed/absent local state falls back to `system`, motion allowed, and serious mode off.

The root and account bootstrap scripts apply this choice before hydration, so a route mount does not
perform a visible light/dark correction. Light/dark selection is independent from motion and
serious mode; changing the operating-system color affects only an explicit `system` selection.

`/app` is the canonical authenticated library/dashboard and `/app/library` is a compatibility
redirect. Sign-in, signup, OAuth, recovery, confirmation, and onboarding normalize their return
through the shared safe-return contract. The default is `/app`; same-origin public/product and
protected application paths may be preserved, while absolute/protocol-relative paths, encoded
navigation hazards, and `/api`, `/auth`, `/onboarding`, or `/_next` destinations fall back to
`/app` to prevent open redirects and lifecycle loops.

**Consequences.**

- Local storage remains a presentation cache, never an identity or authorization source; the
  mutation marker is only an ordering hint tied to an already attempted server write.
- A protected navigation cannot silently revert a fresh accepted theme, and a failed account write
  cannot remain authoritative indefinitely.
- Public signed-out controls remain local-only; authenticated controls request durable account
  persistence. Profile switch/sign-out cleanup continues to reset shared-device state.
- New Auth entry or callback routes must use the shared authentication-return normalizer and keep
  `/app` as the safe fallback.

## ADR-0019: Retry-stable atomic authoring and leased media cleanup

**Context.** ADR-0017 established an atomic note/media graph, frozen publications, and delayed
logical media deletion. A final Phase 02 audit found four remaining split boundaries: creating or
editing a custom field/template definition occurred before its note transaction; saving deck
settings could occur before publish/unpublish; browser retries generated a new idempotency UUID;
and no repository worker crossed the gap from an elapsed media deadline to physical Storage
removal. The frozen theme was present in the projection but not applied by public rendering, and
version history exposed only aggregate change counts instead of reviewable content differences.

**Decision.** The only browser-callable note command is
`current_upsert_note_definition_with_media()`. For a custom authoring payload it validates the
closed field/template definition and its agreement with the payload, reuses the current
account-owned note type only when the canonical definition hash matches, and otherwise creates a
copy-on-write definition. Definition resolution, the note/media graph, generated cards, revision,
impact record, and deck-version bump are one transaction. The earlier composed note/media wrapper
and its component functions have no browser-role execute grant.

`current_apply_deck_settings_and_publication()` applies an optional validated metadata/theme patch
and publishes or unpublishes the resulting expected deck version in one transaction. A failed
publication precondition therefore cannot leave the form's settings committed independently.

Interactive authoring owns a per-surface pending-mutation ledger. It fingerprints the canonical
logical command and retains one client UUID after network or explicitly retryable failure while the
outcome is uncertain. Success, a definitive nonretryable response, or a changed payload retires the
entry. Typed API errors preserve the error code, current version, field errors, and retryable bit;
conflict recovery reloads server state rather than converting a stale command into last-write-wins.

The database independently binds every browser-reachable legacy content receipt to the hash of its
complete canonical command. Receipt lookup serializes the account/key pair, inserts a pending row in
the command transaction, and permits replay only when the operation and command fingerprint match
and current resource permission is re-established. A changed command under the same key and a
pre-binding receipt without a trustworthy fingerprint fail closed; a failed command rolls its
pending receipt back with its side effects.

Frozen public rendering consumes and visibly applies the publication's bounded deck theme.
Version-history comparison derives side-by-side card type, prompt, answer, source, and tag values
from immutable snapshots and the current sanitized authoring contract; it does not expose raw HTML
or private revision metadata.

Physical media cleanup uses `private.content_media_deletion_jobs` plus service-role-only claim,
completion, and failed-upload compensation entry points. Claim locks each due abandoned,
quarantined, or unreferenced asset, rechecks zero explicit and specialized usage, cover/reference
absence, and frozen-publication absence, then returns its private locator under a bounded lease.
The portable worker removes that exact Storage object and completes with the lease token. An
already-absent key is a successful empty bulk deletion. Every error actually reported by Storage,
including not-found, stores a bounded message and requeues with quadratic backoff capped at one day
because a `404` can describe a missing bucket rather than an object; an expired crash lease is
reclaimable. Successful completion tombstones the asset locator. Browser roles receive no job table
or locator access, and the first durable job permanently fences that old asset identity. Identical
bytes uploaded later receive a fresh public ID/path so a stale old worker cannot affect them.

**Consequences.**

- A custom schema edit cannot commit without its note, and it cannot silently rewrite other notes
  that still use the prior schema.
- A settings save and publication transition have one visible success/failure boundary.
- An exact browser content retry converges on the server receipt rather than repeating side effects;
  reusing that key for an edited command is rejected, and the client gives the edit a new key.
- Logical deletion eligibility, worker claim, provider byte removal, and database tombstoning are
  distinct auditable states. A timestamp or queued/leased job is not proof of physical deletion.
- The worker command runs one bounded batch and exits. Deployment, environment-scoped service
  credentials, recurring scheduling, monitoring, and alerting remain owner-operated and are not
  claimed by a successful application or migration deployment.

## ADR-0020: Versioned media graphs and fail-closed frozen projections

**Context.** The original immutable deck snapshot captured notes, fields, tags, and sources but not
the explicit `media_references` graph. A restore could therefore retire current links without
recreating the historical graph, leaving specialized payload IDs, authoritative reference counts,
and delayed-deletion fences inconsistent. Direct RPC callers also required an independent database
check that every embedded media discriminator, kind, and graph edge matched the closed authoring
shape. Legacy frozen projections could contain an internal media or deck-description identity that
had no safe public mapping.

**Decision.** New deck snapshots use schema version two and capture every exact active media edge
with its stable identity, attachment coordinates, purpose, position, accessibility fallback, and
creator metadata. The note transaction records the exact version row it created in a
transaction-local context and may finalize only that row, after link reconciliation, to the exact
current capture. This is an insertion-finalization exception, not a general update path; immutable
version triggers still reject every later or unrelated rewrite.

Restore preflights the complete snapshot before changing state, rejects a note identity that now
belongs to another deck, restores explicit links and specialized uses in the same transaction, and
reconciles exact counts/deletion fences. A schema-one restore constructs only the deterministic
links proven by its immutable payload and deliberately omits historical links it cannot prove.
Collaborators may retain a current same-note attachment but cannot import an arbitrary tombstone or
foreign asset. Duplicating a media-bearing deck is source-owner-only and relinks a complete safe
copy. The publicizer maps only attached verified internal media IDs to opaque publication IDs;
missing or inconsistent mappings fail closed. A forward remediation withdraws affected frozen
deck/card projections, including description documents, without rewriting authoring history.

**Consequences.**

- A version means the complete authored content graph required to reproduce that head, not only its
  textual fields.
- Restore failure is atomic: both decks, every media edge, counts, jobs, and immutable history remain
  byte-for-byte unchanged when validation fails.
- Version-one compatibility is conservative and deterministic; unavailable historical information
  is not guessed.
- Public content never exposes an internal media identity merely because it survived in a legacy
  payload or deck description.

## ADR-0021: Trusted SRS calculation plus transactional commit

**Context.** PostgreSQL cannot execute the pinned TypeScript FSRS implementation, while review
correctness requires one authoritative calculation, immutable evidence, idempotency bound to the
whole command, schedule locking, and no lost updates. A browser-computed transition is untrusted;
a TypeScript read followed by unrelated writes would be race-prone.

**Decision.** `packages/srs` pins `ts-fsrs` `5.4.1`, wraps FSRS-6.0 behind project types, and is the
only canonical calculator. Before loading mutable session or schedule context, the authenticated
server hashes the complete raw review intent and asks a service-only fixed-search-path replay RPC
for an existing exact receipt. An exact retry returns the original canonical response even after
the first commit advanced the session or schedule; the same review identity with a different hash
is rejected. A fresh command obtains its authorized context, computes exactly one transition, and
submits that transition plus the request hash to `admin_commit_srs_review_v2`. The wrapper repeats
authorization and replay checks, then delegates the first commit to the original locked mutation
and stores its exact response in an append-only private receipt. The commit locks or lazily creates
the learner/card schedule, compares its version and complete before-state, revalidates the exact
preset version, binds the client review UUID/idempotency key to the complete command and computed
transition, and atomically appends evidence plus schedule/session/counter and sibling/leech effects.
It never accepts a transition from a browser. Direct service-role table access is revoked; the RPCs
receive only the minimum execute grants.

Identical review UUID retries return the byte-equivalent prior canonical result before mutable
context validation. A differing payload under that UUID is an idempotency conflict. Two legitimate
commands for the same version serialize under the schedule lock: one commits and the other receives
a typed stale-version result. Undo and algorithm changes are separate compensating/replay
transactions with immutable audit evidence. Preview calculation uses the same package and preset
but is non-authoritative.

**Consequences.**

- Canonical scheduling is centralized without introducing a direct database connection or a
  second scheduler implementation.
- The trusted TypeScript calculation and PostgreSQL commit form one verified protocol rather than
  one process transaction; the commit's lock, before-state equality, preset-version check, and
  payload fingerprint reject any context drift between the two calls.
- An append-only private receipt is the stable response boundary for lost-response retries; replay
  lookup still repeats runtime actor, learner, and device authorization before returning data.
- Review evidence records `lumen-srs/1 (v5.4.1 using FSRS-6.0)`, the preset version, before and
  after schedules, source, timing, and idempotency identity for replay and audit.
- Public preview, authored-content reads, practice grading, games, and Phase 04 mastery cannot
  reach this mutation accidentally.

## ADR-0022: Practice mastery is separate evidence with explicit SRS promotion

**Context.** Recognition, guided recall, tests, matching, spelling, pronunciation, and visual
practice are useful learning signals but are not equivalent to a canonical FSRS review. Treating
every successful interaction as review evidence would inflate memory state, reward guesses, and
make scheduling effects impossible to understand. Adaptive selection and flexible grading also
need deterministic replay, learner-private persistence, and child-safe answer retention.

**Decision.** Phase 04 stores append-only practice attempts and maintains a separate concept-mastery
projection through `packages/learning-engine`. `packages/grading` is deterministic and offline-safe;
its optional semantic provider remains disabled. Sessions save a seed and ordered item set so
resume and test questions cannot drift. Choice/test/match/game-like evidence has deliberately low
or zero scheduling authority. Only a correct, unaided Learn/Write free-recall attempt on a new or
due card can be marked eligible. Eligibility merely enables a confirmation UI. A separate endpoint
uses the unmodified Phase 03 canonical review API with the learner-selected rating and records the
review link; it never writes the schedule directly.

Guide definitions are versioned checked-in code. Only bounded resume/suppression state is persisted
under account/learner RLS. The guide system emits no clickstream and uses no third-party analytics.

**Consequences.**

- Practice mastery cannot be described as FSRS stability or retrievability.
- Lucky choices, hints, reveals, retries, Test, Match, Flashcards, Spell, Pronunciation, Diagram,
  and future games cannot silently advance due dates.
- Identical session seeds and state produce identical candidates, distractors, and question order.
- Managed/minor answers remain discarded or hash-only; local pronunciation recordings never cross
  the browser boundary.
- Guide version changes can be offered once without erasing prior completion history.

## ADR-0023: Profile-namespaced offline projections and authoritative replay

**Context.** Phase 05 must make the product useful without a network while preserving the existing
identity, content, practice, and scheduling authorities. A service worker cache is not an
authorization system, a browser-computed schedule is not canonical, and a local rich document must
not overwrite a newer server revision merely because it was edited offline. Shared browsers and
managed learner sessions also make account/profile isolation a correctness requirement rather than
an optional cleanup.

**Decision.** Phase 05 uses offline protocol version `1` and IndexedDB schema version `1`.
`@lumen/offline` owns the framework-independent runtime schemas, deterministic canonical
serialization and SHA-256 payload fingerprints, causal ordering, retry/dead-letter transitions,
cursor comparison, merge classification, and the project-owned Dexie repository. The database name
is a fixed application constant; account IDs and learner-profile IDs are validated UUIDs stored in
row keys and are never interpolated into database names. Every private record carries the exact
account/profile namespace. Deliberately public projections use the separate `public` namespace and
cannot contain learner state, draft fields, membership, or private media locators.

The browser database contains projections and durable commands, never a second authority. Its
stores cover namespace metadata, pins, deck/card/study-card projections, media manifests/blobs,
schedule projections, typed outboxes, sessions/items, cursors, device state, receipts, conflicts,
capabilities/flags, cache/LRU metadata, temporary ID mappings, and worker-update state. Reads are
validated after IndexedDB returns them. Writes accept only closed schemas. Local schedule and
mastery values are visibly pending projections; sync submits review/practice evidence, not a trusted
final schedule or mastery score.

The service worker uses browser-standard APIs and a repository-owned versioned policy rather than a
Next.js PWA plugin. Next's App Router manifest support supplies install metadata. The worker
precaches only a deliberately public, user-neutral offline shell and same-origin static assets.
Authenticated navigation remains network-first and is never written to shared Cache Storage.
Auth callbacks, recovery/confirmation, account/settings pages, destructive routes, API mutations,
responses with `Set-Cookie`, and responses marked `private` or `no-store` are never cached. Public
frozen content may use its own allowlisted stale-while-revalidate cache. Private pinned deck
content and media live in profile-namespaced IndexedDB. This keeps Cache Storage cleanup simple and
prevents a private SSR response from surviving sign-out.

One authenticated `/api/sync/v1` boundary negotiates protocol `1`, validates request and operation
limits, reauthorizes the current account/profile/device, and returns a typed result for every
operation plus per-stream cursors and server time. It dispatches commands through the same
canonical Phase 02–04 mutation services/RPCs. A private operation receipt binds account, profile,
device, operation ID, idempotency key, operation kind, and complete payload fingerprint. Exact
retries replay the stored result; altered reuse is rejected. Independent operations may partially
succeed. Causal operations for one entity preserve order and stop behind a retryable predecessor.
The server may persist only minimal sequence/reference/audit metadata, not duplicate deck,
schedule, mastery, answer, or media-byte models.

Offline Review stores the acknowledged before-state, base schedule version, rating/time/context,
and prior local review reference before applying `@lumen/srs` optimistically. Reconnection sends the
event chain. The server replays through the trusted scheduler and existing locked canonical commit;
the returned schedule replaces the projection. A stale chain is either deterministically replayed
or retained as a review conflict. Undo is a compensating event and never deletes review evidence.
Offline practice stores minimized validated evidence and is regraded/recomputed by the server.
Ordinary practice cannot create a review; an eligible explicit promotion continues to use the
existing canonical review path.

Content commands use stable local IDs, base versions, and the existing idempotent atomic authoring
boundaries. Nonoverlapping scalar fields may auto-merge. Same-field edits, overlapping structured
rich-document changes, and delete-versus-edit create retained conflicts. Uncertain local work is
preserved as a recoverable copy; meaningful content never uses silent last-write-wins. Offline
publication remains prohibited. Media uses content hashes, validated local metadata, quota checks,
reference-aware LRU cleanup, pending blobs, and the existing server MIME/magic-byte/quota
validation before temporary IDs are mapped to canonical IDs.

A central namespace manager coordinates tabs using `BroadcastChannel` with storage-event fallback
and a renewable, expiring leader lease. Sign-out, account deletion, guardian exit, expired session,
profile switch, or device revocation stop sync, abort foreground work, close transactions, clear
rendered/query state, delete the affected private IndexedDB rows and Cache Storage entries, and
notify other tabs. Profile switching adopts the new namespace only after the old namespace is no
longer renderable. Public cache entries are retained only under explicit public policy. Revocation
cannot be enforced while a device is disconnected; after the first reconnect, authorization
failure halts sync, removes inaccessible private data, and explains the outcome.

Worker updates are nonblocking. A waiting worker is activated only after the user accepts and no
critical study/edit/media/sync transaction is in flight. Durable outbox work survives the update;
IndexedDB opens/migrates before new application code renders; a failed or future schema version
fails closed with recovery guidance instead of entering a reload loop. Background Sync is a
best-effort enhancement. Online, focus, visibility, periodic foreground, and explicit Sync now
signals provide the required fallback with exponential backoff, bounded deterministic jitter, and
no busy polling.

**Consequences.**

- Browser storage is protected by the browser/OS account boundary, not encrypted against a
  malicious extension or compromised operating-system account.
- Explicit pinning is the only durable offline-availability promise. Optional uncached media is
  disclosed, and background synchronization is never described as guaranteed.
- Previously cached public content cannot be remotely erased while the browser remains offline; it
  is withdrawn on the next authorized reconciliation.
- Protocol or schema changes require an additive, tested migration and bounded compatibility
  window. Unsupported future versions fail safely and retain recoverable user work.
- Phase 06 import/export and Phase 07 collaboration/Yjs remain unstarted; Phase 05 provides only the
  stable local-ID and structured-merge seams they will consume.

## ADR-0024: Versioned portability graph, hostile-file boundary, and leased jobs

**Context.** Phase 06 must exchange simple study text, CSV/TSV and `.xlsx` spreadsheets, structured
Lumen data, Markdown bundles, Anki packages, account archives, and printable study material without
treating any foreign file as trusted application state. The same feature must work on the Vercel
web runtime and in a portable worker, preserve current content/SRS/practice authorities, survive
retries and cancellation, and make every unsupported or lossy conversion visible. Archive formats
combine several dangerous boundaries: ZIP path traversal and decompression amplification, SQLite
files containing attacker-chosen schemas/data, spreadsheet formula/macro/external-link behavior,
template HTML/CSS, media type spoofing, and encrypted payloads whose passwords must never be
persisted.

**Decision.** `@lumen/import-export` owns a framework-independent, versioned normalized graph and
adapter registry. Adapters implement detect, inspect, map, and execute/export contracts over
validated byte/text sources and typed sinks; they do not import Next.js, Supabase, Storage, or a
native SQLite binding. The normalized graph represents folders, decks, note types, fields,
templates, notes, generated-card identity, tags, media descriptors, immutable revisions/versions,
permitted publication metadata, learner schedules/review history, separate practice/mastery,
settings, provenance, diagnostics, and explicit loss. Every graph and adapter result carries a
schema version, stable lineage identifiers, and a round-trip capability/loss report. Unknown future
versions fail closed; supported older versions pass through explicit migrations.

Text, Quizlet-style paste, CSV/TSV, XLSX, JSON, Markdown, internal backup, and Anki are separate
adapters behind the same contracts. CSV/TSV parsing is a bounded state machine with BOM/encoding,
quoted multiline fields, delimiter/header inference, formula-safe export, custom mapping, external
IDs, duplicate policy, and row diagnostics. JSON is parsed only into own-property closed schemas
and rejects prototype-like keys at every depth. Markdown accepts bounded front matter and stores
rich content through the existing sanitizer, never rendered source HTML.

XLSX parsing uses pinned `read-excel-file` `9.3.4` only after the project ZIP preflight validates
OOXML magic, paths, entry/expanded-byte limits, worksheet counts, populated-cell counts, and
declared row/column dimensions. Macro-enabled content fails closed. Formula expressions are never
executed; only saved cached values can map to text. External links are not followed, embedded
objects are reported as loss, preview strings are capped, and the explicitly selected worksheet
and column mapping are bound into the resumable job policy.

ZIP handling uses pinned `fflate` `0.8.3` behind a project wrapper that validates names before
decompression, rejects absolute/traversal/NUL/symlink-like entries, enforces entry, compressed,
per-file, expanded-byte, and compression-ratio ceilings, rejects ambiguous duplicate canonical
paths, and never extracts to a caller-selected filesystem path. Anki collection bytes are opened
in memory with pinned `sql.js` `1.14.1`, an Emscripten WebAssembly build of SQLite. The adapter
executes only checked-in, read-only `SELECT` statements against recognized tables/columns; it
never executes SQL or JavaScript from the package. `collection.anki2` and plain SQLite
`collection.anki21` packages are supported. Unsupported compressed/new collection members fail
with an actionable compatibility diagnostic rather than being guessed. Anki field/template HTML
and CSS pass through the existing safe rich-document/template boundaries. Scheduling and revlogs
are imported only under an explicit learner-scoped progress policy; otherwise they are reported as
omitted. Export produces a real legacy-compatible SQLite collection plus media manifest inside an
`.apkg`; internal Lumen archives remain the lossless backup format.

The internal archive is a canonical ZIP with `manifest.json`, a checksum inventory, versioned JSONL
resources, and content-addressed media. Optional encryption wraps the complete archive in an
authenticated `LUMENENC1` envelope using Web Crypto PBKDF2-HMAC-SHA-256 with a random 128-bit salt,
600,000 iterations, and AES-256-GCM with a random 96-bit nonce. The version/KDF/cipher parameters
are authenticated additional data. Passphrases exist only in request/worker memory and are never
stored in rows, receipts, URLs, logs, telemetry, or diagnostics. Wrong-password and tamper failures
share a neutral error. Restore validates authentication, manifest/checksum closure, graph schema,
ownership policy, size limits, and every domain object before any canonical mutation.

Durable database jobs are the control plane. Public owner-readable rows expose only sanitized
status/counts/warnings/loss/errors and artifact metadata. Private rows hold opaque Storage locators,
upload quarantine, bounded item/checkpoint records, command fingerprints/receipts, attempts, and
expiring leases. Browser roles cannot mutate job, queue, artifact, or private Storage state
directly. Authenticated `current_*` RPCs derive the self account/profile/device, bind idempotency to
the complete command, and support cancel/retry/resume. Service-only fixed-search-path RPCs claim
bounded work, checkpoint, and complete/retry it. A crashed worker releases work through lease
expiry; exact retries replay receipts; cancellation is cooperative between atomic batches. Small
interactive jobs may ask the same worker service to process one bounded batch immediately, but use
the identical lease/checkpoint/receipt protocol rather than a second synchronous authority.

Uploaded source files and generated artifacts use a dedicated private migration-owned Storage
bucket and opaque owner-independent paths. The authenticated server validates extension,
declared/detected MIME, magic bytes, byte size, checksum, and expiry before quarantine release.
Downloads are short-lived, reauthorized, `private, no-store`, attachment-only responses; service
worker policy excludes all portability pages, APIs, uploads, artifacts, and print routes. Expiry
and account deletion revoke availability and enqueue physical removal. Cleanup is two phase:
service-only claim returns an opaque eligible path without finalizing it, the runner deletes that
exact Storage object, and a separate service-only confirmation marks metadata deleted. Failure
therefore remains retryable. Account export completes the existing `data_export_jobs`
privacy-request boundary by linking it to the same lossless archive engine; account restore is
always additive/merge-preview by default and never silently replaces a different account or
canonical FSRS history.

**Consequences.**

- Import inspection, mapping, canonical mutation, backup, account export, and Anki support share one
  normalized model without coupling domain code to a web framework or provider.
- “Round trip” is a measured adapter capability with a machine-readable loss report, not a promise
  that CSV, Markdown, Anki, and Lumen can represent the same features.
- Hostile archives cannot choose filesystem paths, execute SQL/templates/scripts, allocate
  unbounded expansion, or become trusted schedule/mastery state.
- Large work is resumable and auditable without requiring a paid queue; deploying/scheduling the
  portable worker remains an explicit owner operation.
- The unencrypted internal archive is portable but contains private study data. Encryption protects
  the archive at rest in transit/storage, not a compromised browser, worker process, or unlocked
  account session.
- Phase 07 collaboration and realtime game work remain out of scope.

# Implementation status

**Current phase:** Post-Phase 01 custom-domain and hosted-auth finalization  
**Status:** Complete; provider, deployment, and final aggregate validation recorded below  
**Evidence date:** 2026-07-16 UTC  
**Next phase:** Phase 02 has not started

This record describes implemented repository behavior and verified local and hosted evidence. Product intent remains canonical in [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md), cross-cutting decisions are recorded in [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md), and provider operations are documented in [HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md) and [SETUP.md](./SETUP.md).

## Completed custom-domain and hosted-auth finalization

- Started from a clean local `main` exactly matching freshly fetched `origin/main`, then created
  only `codex/custom-domain-finalization`. The ignored local `apps/web/.env.local` was not read,
  changed, staged, or tracked.
- Confirmed `NEXT_PUBLIC_APP_URL` is the repository's authoritative application-origin variable.
  Updated only its Vercel Production assignment to `https://recallflash.com`; Preview still omits
  the variable and derives each deployment origin from Vercel metadata.
- Deployed Production successfully to generated deployment
  `https://cogniflow-mns48tw69-cogniflow-app-3471s-projects.vercel.app`, which reached `READY` and
  was aliased to the custom apex. `www.recallflash.com` and `cogniflow-pearl.vercel.app` both return
  path- and query-preserving `308` redirects to the apex, so neither is a second canonical origin.
- Updated only Beta Supabase Auth to Site URL `https://recallflash.com` and callbacks
  `https://recallflash.com/auth/callback**` plus the temporary path-limited
  `https://cogniflow-pearl.vercel.app/auth/callback**` rollback entry. Preview's Site URL and
  restricted wildcard remained unchanged, and local callbacks remain in `supabase/config.toml`.
- Re-read both hosted Auth configurations after cutover. Email confirmation remains required;
  anonymous Auth and Google, GitHub, and Azure/Microsoft remain disabled. Confirmation, email
  change, invite, magic-link, and recovery templates still use `{{ .ConfirmationURL }}` rather
  than directly substituting `{{ .RedirectTo }}`.
- Verified password signup, magic link, recovery, OAuth, and provider-link redirects share the
  configured-origin callback builder; safe returns remain relative-only. Production smoke verifies
  the apex canonical URL, host-only secure recovery cookie, callback/recovery fail-closed behavior,
  same-origin mutation acceptance, and rejection of the retired Production origin.
- Confirmed Vercel Protection Bypass for Automation remains configured and successfully exercised
  it against protected Preview without writing or printing the credential. Repository workflows do
  not run hosted smoke, so no GitHub Actions secret was added.
- Kept Preview connected to Preview Supabase and Production connected to Beta Supabase. No local
  Supabase value was copied to Vercel. Search indexing, managed-child profiles, public child
  content, free-text chat, direct messaging, parental-consent activation, cloud AI, and optional
  OAuth all remain disabled. Phase 02 was not started.

The temporary old-host Beta callback remains for rollback because custom SMTP and delivered
confirmation, magic-link, and recovery exercises are still owner-gated. Remove it only after those
checks and the rollback window close; its redirecting hostname is not a canonical application
origin in the meantime.

## Completed hosted infrastructure bootstrap (historical baseline)

- Applied the complete additive Phase 00/01 chain through `20260715006900_hosted_grant_parity.sql` to the separate Preview (`cfwddajyjbueggpzfomh`) and Beta (`qccbaynfvtyxigiikpmq`) Supabase projects. Both remote histories exactly match all 21 committed migrations.
- Added guarded Preview/Beta migration deploy and verification commands. They inspect history, dry-run before changes, never seed/reset/repair/config-push, automatically unlink, and require Beta promotion from a clean `main` exactly matching freshly fetched `origin/main`.
- Added read-only hosted invariants for table inventory, RLS, policy/grant/function/schema/view/storage/publication boundaries, plus database lint, empty-storage, schema-diff, and generated-type parity checks. Both hosted projects pass the complete verifier.
- Created exactly one Vercel Next.js project, `cogniflow`, connected to `cogniflow-app/CogniFlow` with Production branch `main`, Root Directory `apps/web`, Node `24.x`, pnpm `11.13.0`, the frozen monorepo install command, the filtered web build command, and default `.next` output.
- Configured Vercel Preview with the Preview Supabase project and Production with the Beta project. Each scope has its own Supabase server key and independently generated encryption, guest-signing, and Server Action keys; optional OAuth, SMTP, consent-provider, AI, analytics, monitoring, and direct-database settings remain absent or disabled.
- Initially deployed and verified Preview at `https://cogniflow-5x77sm1wj-cogniflow-app-3471s-projects.vercel.app` and Production at the former stable `https://cogniflow-pearl.vercel.app` alias (generated deployment `https://cogniflow-91ytfxf2d-cogniflow-app-3471s-projects.vercel.app`). That bootstrap evidence passed the then-current 9/9 controlled smoke checks and is superseded by the custom-domain evidence above.
- Configured Preview and Beta Supabase Auth with email confirmation required, environment-specific Site URLs, and minimal `/auth/callback**` redirect entries. Hosted Google, GitHub, Microsoft, and anonymous-user providers remain disabled. Email templates retain provider-managed `ConfirmationURL` behavior; custom SMTP and live email delivery remain provider-gated.
- Verified both hosted databases contain zero Auth users, zero public identity/product rows, and zero storage buckets after testing. The neutral recovery check creates only the expected bounded private rate-limit record with a server-HMACed subject; it stores neither the reserved test address nor personal information. No fixture identity, child identity, or test content was created.
- Kept both beta and Preview site-wide `noindex, nofollow`. Managed child profiles, child public publishing, unrestricted free-text game chat, direct messages, parental-consent activation, and cloud AI remain disabled. Phase 02 was not started.

## Completed Phase 01 scope

- Added real Supabase email/password signup and sign-in, conditional Google/GitHub/Microsoft OAuth initiation, manual provider linking, magic-link sign-in, email confirmation callbacks, forgot/reset password, neutral expired-link handling, current-device sign-out, password-gated all-device sign-out, SSR cookie refresh, and independently authorized protected routes.
- Bound eligible teen/adult signup decisions to short-lived signed callback state. New callback identities without valid age authority are signed out and minimized through a service-only rejection transaction. Final onboarding exchanges an account-, Auth-session-, and payload-bound one-time proof instead of trusting the request age band.
- Bound password recovery to a separate pending cookie, callback nonce, normalized-email HMAC, expiry, and safe return path before issuing the account-bound password-update capability. Query-only or mismatched recovery intent fails closed.
- Implemented minimum-data onboarding for display name, handle, locale, IANA time zone, study-day start, age band, learning goals, theme, motion, reading, and serious-mode preferences. Under-13 selection never starts an independent account flow.
- Added account profiles, overlapping `learn`/`create`/`host`/`teach` capabilities, self/child/school-managed learner identities, explicit access roles, guardian relationships, append-only consent/revocation, privacy preferences, registered devices, learner-profile sessions, export/deletion workflow state, append-only audit facts, guest sessions, and fixed-window rate-limit buckets.
- Implemented local/test guardian-managed learner creation with a closed privacy-safe payload, one-time consent-verifier proof, no child email, cost-12 PIN/family-code credentials, rate limiting, secure profile switch, active-profile indicator, bounded lock timeout, guardian exit, credential rotation, learner preferences, consent revocation, device revocation, and selected learner-session revocation.
- Added school-managed identity foundations that require a separate service-issued school authorization. Creation is minor-only and reconstructs an exact seven-key minimized settings document after strict validation.
- Added browser identity-boundary isolation. Successful sign-out, deletion, guardian exit, and profile change clear the applicable app cookies or learner/private browser stores; a successful profile switch always replaces the guardian document even if storage cleanup is unavailable.
- Implemented profile, security, connected-provider, devices/sessions, learner, guardian/consent, privacy preference, export request, deletion request, and grace-period cancellation settings with real stored state and reauthentication for high-risk operations.
- Added a server-only public viewer projection. Anonymous account actions preserve only an allowlisted same-origin public return path; authenticated viewers get the workspace action; Auth outages degrade to an anonymous public shell.
- Added ephemeral guest identity foundations with a strict room-adapter interface, safe generated/custom nicknames, HMAC-pseudonymized rate-limit subjects, hashed reconnect tokens, bounded expiry, reconnect, service-only purge, and a test-only room fixture. The production adapter intentionally contains no joinable rooms.
- Enforced production HTTPS and the managed-identity launch gate. Every production runtime forces child profiles, public child content, free-text game chat, and parental-consent mode off; Vercel/provider markers remain additional hard stops.
- Preserved the Phase 00 monorepo, design system, environment validation, provider portability, test harnesses, foundation migration, and deployment profiles. No deck/card, scheduling, mastery, class, or game product schema from Phase 02 or later was started.

## Security and authorization boundaries

- Every exposed Phase 01 table has RLS. Browser roles have no direct insert/update/delete table policies; narrow authenticated `current_*` RPCs derive the actor, bind the JWT `session_id` to a live application device, hold the managed-session lock, authorize the target, and mutate atomically.
- Reusable helpers and proof ledgers remain in the non-exposed `private` schema. Security-definer entry points use an empty `search_path`, schema-qualified objects, exact signature grants, bounded input, idempotency, and audit facts.
- The service role has narrow RPC execution and deliberately has no general identity-table read grant. Actor-selecting implementation RPCs are not browser-callable.
- Profile-session, guest reconnect, onboarding, child-creation, school-authorization, and reauthentication bearer values are stored only as fixed-length digests. PINs and new family codes use independent bcrypt hashes.
- Consent and audit records reject update/delete. Account deletion is a compensating, idempotent worker transaction that removes Auth/session/credential state and minimizes identity while preserving required append-only evidence.
- Mutation routes enforce origin/CSRF checks, bounded JSON, shared strict Zod schemas, neutral errors, server/database authorization, and separate database-backed rate-limit buckets.

## Database migrations

Phase 00's applied `20260714000000_foundation.sql` remains unchanged. Phase 01 adds the following migrations in order:

| Migration                                                            | Purpose                                                                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `20260715000000_identity_privacy_schema.sql`                         | Identity/privacy enums, tables, indexes, constraints, RLS enablement, triggers, and Auth provisioning hook                      |
| `20260715001000_identity_privacy_functions.sql`                      | Provisioning, authorization, profile session, guest, consent, privacy job, device, rate-limit, and audit transaction boundaries |
| `20260715002000_identity_privacy_hardening.sql`                      | Grant, policy, credential, consent, and audit hardening                                                                         |
| `20260715002500_managed_learner_session_boundary.sql`                | Managed-mode account isolation and live session checks                                                                          |
| `20260715002700_managed_session_idempotency.sql`                     | Exact profile-session idempotency and replay behavior                                                                           |
| `20260715002800_learner_credential_hardening.sql`                    | bcrypt PIN/family-code rotation and committed attempt throttling                                                                |
| `20260715002900_profile_session_transaction_hardening.sql`           | Auth-session/device binding, concurrency, expiry, and active-session limits                                                     |
| `20260715003000_school_authorization.sql`                            | One-time school authorization proof and observer projection foundations                                                         |
| `20260715004000_account_deletion_path.sql`                           | Idempotent due-deletion worker, Auth erasure, and identity minimization                                                         |
| `20260715005000_authorization_audit_hardening.sql`                   | Cross-actor idempotency, target consistency, and audit/consent immutability                                                     |
| `20260715006000_atomic_self_context.sql`                             | JWT-session-bound self-context authorization wrapper                                                                            |
| `20260715006100_guardian_exit_context.sql`                           | Password/proof-gated guardian exit from managed mode                                                                            |
| `20260715006200_sign_out_device_revocation.sql`                      | Current/all application-device revocation cascades                                                                              |
| `20260715006300_runtime_session_boundaries.sql`                      | Narrow authentication-profile/device service RPCs and runtime session checks                                                    |
| `20260715006400_child_creation_and_global_signout_authorization.sql` | Child payload proof ledger/consumer and reauthenticated global sign-out                                                         |
| `20260715006500_onboarding_and_learner_settings_authorization.sql`   | Onboarding proof consumption, provisional rejection, and explicit learner settings mutation                                     |
| `20260715006600_child_payload_validation_hardening.sql`              | Closed child consent/settings schema and JSON-null fail-closed checks                                                           |
| `20260715006700_school_managed_payload_hardening.sql`                | Minor-only school creation with exact minimized settings reconstruction                                                         |
| `20260715006800_profile_session_revocation_boundary.sql`             | Self-context, password/proof-gated revocation of one owned learner session                                                      |
| `20260715006900_hosted_grant_parity.sql`                             | Revocation of hosted platform default service-role table/sequence privileges to preserve the RPC-only boundary                  |

`supabase/seed.sql` remains deterministic and inserts no product data. Generated types in `packages/database/src/generated/database.ts` come from the complete local schema and are not hand-edited.

## Test and validation evidence

The local database suites add 351 database/RLS assertions to the 11 preserved Phase 00 assertions, for 362 total across ten SQL files. They cover schema/grant/index/hosted invariants; idempotent provisioning; anonymous, owner, unrelated user, guardian, revoked guardian, teacher-observer, managed learner, expired/revoked session, guest, tampered learner, and service paths; proof consumption; payload validation; credential/session concurrency; privacy/deletion state; and append-only audit/consent behavior.

| Command                                                    | Result                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                           | Exit 0; all eight workspace projects were already up to date and the lockfile was accepted unchanged                                                                                                                               |
| `pnpm format:check`                                        | Exit 0; final repository source, configuration, tests, SQL, and documentation are formatted                                                                                                                                        |
| `pnpm secret:scan`                                         | Exit 0; no credential finding                                                                                                                                                                                                      |
| `pnpm lint`                                                | Exit 0; ESLint has no warning/error and dependency boundaries pass                                                                                                                                                                 |
| `pnpm typecheck`                                           | Exit 0; 7/7 workspace projects pass strict TypeScript                                                                                                                                                                              |
| `pnpm test`                                                | Exit 0; 47 files / 259 tests pass. Coverage: statements `84.59%`, branches `68.08%`, functions `77.57%`, lines `85.94%`                                                                                                            |
| `pnpm db:reset`                                            | Exit 0; database recreated from empty, all 21 migrations through `069` applied, and the seed inserted no application data                                                                                                          |
| `pnpm test:db`                                             | Exit 0; 10 files / 362 assertions pass (`Result: PASS`)                                                                                                                                                                            |
| `pnpm db:types`                                            | Exit 0; generated and formatted from the complete local schema                                                                                                                                                                     |
| `pnpm db:types:check`                                      | Exit 0; committed generated types match the fresh local schema                                                                                                                                                                     |
| `pnpm build:verify` / aggregate `pnpm build`               | Exit 0; optimized Next production build generated 53 routes with the deterministic production environment                                                                                                                          |
| `pnpm build:portable`                                      | Exit 0; OpenNext/Cloudflare produced `.open-next/worker.js`; this verifies the artifact, not a live deployment                                                                                                                     |
| `pnpm test:e2e`                                            | Exit 0; 17 Playwright tests passed across desktop, mobile, and reduced-motion projects; 4 broader-project repetitions were intentionally skipped                                                                                   |
| `pnpm test:a11y`                                           | Exit 0; 18/18 checks passed with no serious/critical axe violations plus working keyboard/skip-link focus and dark-theme coverage                                                                                                  |
| `pnpm test:lighthouse`                                     | Exit 0; scores performance `99`, accessibility `100`, best practices `96`, SEO `100`; FCP `0.758 s`, LCP `2.161 s`, TBT `3 ms`, CLS `0`, `179,369` bytes / 12 requests                                                             |
| `pnpm test:load`                                           | Exit 0; 15/15 k6 checks, 3/3 requests, `0%` failures, request-duration p95 `8.6 ms` against `<1000 ms`                                                                                                                             |
| `pnpm db:verify:preview` / `pnpm db:verify:beta`           | Exit 0 for each hosted target; 21/21 history parity, empty dry run, database lint, hosted invariants, empty Storage, accepted platform-only schema diff, and generated-type parity pass                                            |
| `pnpm test:hosted:preview` / `pnpm test:hosted:production` | Exit 0 for each deployment; the expanded 10/10 controlled hosted Playwright checks pass on protected Preview and the custom Production apex                                                                                        |
| `pnpm verify`                                              | Exit 0 under the pinned Node `24.18.0` and pnpm `11.13.0`; the aggregate reran formatting, secrets, lint, types, unit coverage, empty reset, pgTAP, generated types, standard/portable builds, Playwright, axe, Lighthouse, and k6 |

Targeted tests additionally cover auth callback/recovery state, route payloads, production cookie security, public return normalization, browser profile-switch cleanup failure, selected session revocation, child settings, sign-out/provider failure boundaries, and deterministic test-origin isolation under the production-shaped verification environment. The Next middleware deprecation notice is expected: ADR-0016 retains Edge middleware because the pinned OpenNext adapter does not support the Node-only proxy replacement, and both production builds pass.

## Configuration and owner setup

- `.env.example` is the canonical public/server variable inventory. The local `apps/web/.env.local` remains ignored and is not reproduced in source, docs, test output, or this record.
- Hosted Supabase now has separate Preview/Beta projects, exact Site/redirect URLs, required email confirmation, matching application flags, and verified schema/policy parity. Custom SMTP, a verified sender, live email delivery, and any future template customization remain owner-gated.
- Google, GitHub, and Microsoft (`azure`) OAuth adapters and conditional UI are implemented. The owner must create provider applications, store credentials in Supabase/provider settings, review scopes/account types, enable manual identity linking when desired, and only then enable each application flag.
- The external parental-consent verifier adapter is implemented with pseudonymous subject HMAC, HTTPS/timeout/response-size/evidence validation, but is not live-verified because no owner provider or credential was supplied. It cannot activate managed profiles in production while ADR-0015 is active.
- Vercel Preview and the custom-domain Production beta are live-verified. OpenNext/Cloudflare remains a build-only portability target. Future hosted migration promotion, secret rotation, and provider configuration remain owner-authorized operations governed by the hosted runbook.
- The owner must deploy and monitor a deletion-job scheduler/worker before accepting production deletion requests. The service-only due-job transaction is implemented and locally database-tested; repository verification does not run an external scheduler.

## Known constraints and later owners

- **Production managed learners:** disabled until a later security phase implements an independent opaque backend-for-frontend child identity, a superseding ADR, live consent verification, provider/data review, parent notices, retention/incident procedures, and legal approval. Local/test guardian and child paths remain complete for boundary verification.
- **Export assembly:** Phase 06 owns archive creation, expiring download delivery, and full portability. Phase 01 provides real request/job state and status, without claiming that a queued job is a downloadable archive.
- **School integration/classes:** Phase 08 owns a reviewed school evidence adapter, class membership, and assignment-scoped reporting. Phase 01 provides only the proof-gated school identity and observer authorization foundation.
- **Games:** Phase 09 owns game tables, production room admission, participants, realtime events, reports, and deployed guest cleanup; Phase 10 owns advanced games and persistent progression. Phase 01's production room adapter remains intentionally empty so no UI can fake a join.
- **Public deck content:** Phase 02 owns deck/card content and later sharing phases own publication/discovery. Phase 01 provides only the anonymous viewer and safe return-aware authorization foundation.
- **Operations:** deployment smoke tests are implemented and live-verified. Scheduled guest/audit retention, deletion-worker execution, live email/provider monitoring, backup/restore exercises, and alerting still require owner-operated infrastructure documented in [HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).

There is no blocker to custom-domain finalization. Closing the old-host callback rollback window,
custom SMTP/live email delivery, backup/restore exercises, production worker schedules,
monitoring/alerting, and public launch/legal review remain genuine owner actions or launch gates;
none is represented as live-verified.

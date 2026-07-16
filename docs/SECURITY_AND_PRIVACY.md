# Security and privacy baseline

**Scope:** Phase 00 foundation, Phase 01 identity/privacy controls, hosted bootstrap, and launch gates  
**Last updated:** 2026-07-16

This document is an engineering control baseline, not a certification or legal opinion. The provider and child-safety decisions in the [product blueprint](./PRODUCT_BLUEPRINT.md) remain mandatory.

## Current data posture

Phase 01 implements Supabase Auth account access, self learner profiles, locally/tested guardian-managed learner profiles, provider/device/session settings, privacy preferences, append-only consent/audit evidence, export/deletion job state, and a pseudonymous guest-identity boundary. Every production runtime forces managed child profiles off until the child-facing browser can use an independent opaque backend-for-frontend identity instead of retaining a guardian Supabase bearer credential. The production game-room adapter contains no rooms, so the join form cannot create a deployed guest yet.

It still does not implement deck content, review history, classes, sharing, public creator profiles, live games, analytics transport, AI processing, or export-archive assembly. Phase 01 implements an idempotent due-deletion transaction, but does not deploy its scheduler. Later phases must add authorization, RLS, retention, export/deletion coverage, and policy tests with each data-owning feature. Existing account permissions never imply access to a future content table.

The controlled hosted deployment uses separate Supabase projects for Vercel Preview and the
`https://recallflash.com` Production beta. Both databases contain only the committed Phase 00/01 schema: verification found no
Auth users, public identity/product rows, storage buckets, fixture identities, or test content. The
neutral recovery smoke creates the expected bounded private rate-limit record using a server-HMACed
subject; it stores no email address or personal information. The custom-domain beta remains site-wide
`noindex, nofollow`; it is deployment evidence, not completion of the public launch gate below.

## Trust boundaries

Treat all of these as untrusted input even when they originate in the project's own UI:

- URL path, query, headers, cookies, form data, and Server Action arguments;
- Route Handler and RPC request bodies;
- Supabase Auth user-editable metadata;
- Realtime Broadcast/Presence payloads and guest claims;
- offline outbox events and client timestamps;
- uploaded files, MIME types, names, and media metadata;
- imported text, archives, URLs, rich documents, templates, and CSS;
- webhook/provider responses and background-job payloads.

Runtime schemas validate shape and bounds. Authorization occurs at the mutation/data boundary, not only by hiding a control. Database RLS is required defense in depth.

## Environment classification

### Browser-safe

Only these values are eligible for a `NEXT_PUBLIC_` bundle:

- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_BUILD_VERSION`

They are public configuration, not secrets. The publishable key is safe only with correct RLS and storage policy.

### Server-only

These values must never cross a Client Component boundary or appear in health responses, browser logs, build artifacts, screenshots, or third-party telemetry:

- `SUPABASE_SECRET_KEY`
- `DATABASE_URL`
- `APP_ENCRYPTION_KEY`
- `GUEST_TOKEN_SIGNING_KEY`
- `PARENTAL_CONSENT_VERIFIER_URL`
- `PARENTAL_CONSENT_VERIFIER_API_KEY`
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`

Server environment access lives in the server-only config module. Client modules import a separately constructed sanitized projection. CI lint/boundary checks reject client imports of server modules.

Secrets are set in the deployment provider, not committed to `.env*`, `wrangler.jsonc`, fixtures, or docs. Local `.env.local` remains ignored. Secretlint scans tracked project content; the CI examples use clearly non-production placeholders.

`VERCEL_AUTOMATION_BYPASS_SECRET` is an operator-only Playwright input for this Vercel project's
protected deployments. It is not an application environment variable and must remain transient or
in an approved CI secret store. It must never be logged, documented by value, or placed in
`.env.local`.

Non-secret server configuration also includes OAuth button flags, email-confirmation state, rate-limit bounds, retention windows, parental-consent mode, and the external verifier URL. Only the explicit sanitized capability projection may reach a rendered page; rate-limit settings, verifier configuration, and credential values are not part of it.

## Authentication and session controls

The application supports email/password signup and sign-in, optional email confirmation, magic links, password recovery/reset, current/all-session sign-out, and configured Google, GitHub, or Microsoft OAuth. OAuth buttons are derived from server configuration and are absent when the provider flag is false. A flag never configures provider credentials; those stay in Supabase/provider settings.

The repository implements these adapters and local/test behavior. Hosted email delivery, custom SMTP, provider applications/secrets, manual identity linking, and Google/GitHub/Microsoft flows are **implemented but not live-verified** without owner-controlled external configuration and recorded environment evidence.

Security properties:

- return destinations pass through a same-origin relative-path allowlist;
- public-shell account calls to action additionally narrow the middleware-forwarded pathname/query to `/`, discover/deck/creator/embed/join, or copyright/privacy/safety/terms families; external origins, API/auth/account paths, traversal, and encoded navigation hazards fall back to `/`, while a verified account receives `/app`;
- callback/confirmation routes exchange the Supabase code or token hash and redirect expired/invalid links to a neutral error surface;
- an under-13 sign-up decision reaches the guardian-required path before an independent Auth mutation;
- eligible signup state that crosses an email/provider callback is carried in a signed, short-lived HttpOnly cookie bound to flow, callback nonce, safe return path, and either normalized-email HMAC or provider; an immediate password session receives the account-bound onboarding gate directly, while a callback signs out and invokes the provisional-account rejection/minimization boundary for a recent new Auth identity when its pending state is absent or mismatched;
- final onboarding reads an independently signed, short-lived, account-bound age cookie and does not accept an age band from the profile JSON body; the route exchanges the cookie plus exact validated payload for a separate random, Auth-session/payload-bound proof that the authenticated onboarding RPC consumes once;
- starting recovery issues a signed, at-most-15-minute pending HttpOnly cookie bound to a random callback nonce hash, a server-HMACed normalized email subject, and the safe return path; callback/confirm rejects and locally signs out a recovered session when that state is missing, expired, subject/nonce-mismatched, or replaced by a query-only `intent=recovery`;
- only a callback/confirm that matches the pending state may issue the separate signed, account-bound, at-most-ten-minute HttpOnly recovery-intent cookie required by password update;
- auth and recovery errors do not reveal whether an email address has an account;
- Edge-compatible `apps/web/middleware.ts` performs best-effort cookie refresh and forwards the internal request path on protected/auth/onboarding plus canonical public-shell route families; the server-only public viewer resolves only anonymous-versus-verified-account CTA state and fails to anonymous availability when Auth is unavailable. Protected Server Components and Route Handlers independently verify the Auth user and use `getClaims()` to bind the JWT subject and `session_id` to an unrevoked application device; service adapters read authentication profile state and register/refresh that device only through narrow RPCs, and registration independently verifies the exact row in `auth.sessions`;
- current-device sign-out is available for the exact JWT-bound application device even during managed mode and needs no account-settings access; all-device sign-out is a separate self-context action that first verifies the password and consumes a fresh `security_change` proof; each path atomically revokes its application device/profile-session rows before asking Supabase Auth to invalidate local/global scope and clearing app identity cookies, so RLS denies an already-issued stale access token even if refresh-session invalidation fails;
- a recent uncompleted Auth identity without valid signed onboarding authority is locally signed out and passed to the service-only provisional-rejection transaction, which accepts only child-free onboarding accounts, removes the Auth principal, minimizes profile/self-learner fields into opaque tombstones, and cannot operate on a completed account;
- browser cache/offline isolation hooks run on sign-out and profile change so later data-owning phases have a mandatory separation point; a successful profile switch best-effort clears current learner/private namespaced Web Storage and Cache Storage, dispatches the identity-boundary event, and replaces the guardian document even if cleanup is denied or rejects.

Cookies holding Supabase SSR state and application device, profile, age-gate, guest, or recovery context are HttpOnly and receive `Secure` from the server's production classification. Production startup/build also rejects non-HTTPS application and Supabase origins. Profile, verified-onboarding age, guest, established recovery, and re-authentication contexts use SameSite=Strict. The pending callback-age, pending-recovery, and device cookies use SameSite=Lax so successful provider/email callbacks can retain the required state. The managed-profile cookie deliberately outlives the maximum 30-minute study window so expiry leaves the browser locked instead of silently restoring guardian controls. Raw profile, guest, onboarding, and child-creation proof values are never stored in Postgres; only fixed-length digests are retained while needed.

## Deployment capability and parental-consent guard

The initial Vercel profile is a 13+ non-commercial beta:

```env
DEPLOYMENT_PROFILE=vercel_beta
ENABLE_CHILD_PROFILES=false
ENABLE_PUBLIC_CHILD_CONTENT=false
ENABLE_FREE_TEXT_GAME_CHAT=false
PARENTAL_CONSENT_MODE=disabled
```

The server capability resolver forces child profiles, public child content, free-text game chat, and consent mode off for every `NODE_ENV=production` runtime. `vercel_beta` and the provider-owned `VERCEL=1` marker are additional hard stops, even outside an expected provider configuration. The child creation Route Handler repeats the runtime/profile check before obtaining consent evidence, issuing a short-lived proof, and calling the authenticated atomic database boundary. UI hiding is not the control.

Consent modes are deliberately narrow:

| Mode                | Allowed deployment while the production identity gate is active | Meaning                                                                                                                  |
| ------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `disabled`          | Any                                                             | Child creation is unavailable                                                                                            |
| `test_only`         | Local/test only                                                 | Creates evidence labelled `local_test` so guardian/RLS/session behavior can be exercised; it is never production consent |
| `external_verified` | Nonproduction Cloudflare-shaped adapter testing only            | Requires configured verifier credentials and affirmative, bounded evidence; it cannot activate production child access   |

`ENABLE_CHILD_PROFILES=true` is effective only in a nonproduction runtime with a compatible non-disabled consent mode. The external verified-consent adapter is a bounded server-to-server HTTP verifier. It sends an HMAC-pseudonymized account subject—not the account email—plus the learner age band, policy version, and requested scope. The provider must return `{ "verified": true, "evidenceReference": "..." }`; the evidence reference is trimmed and constrained to 8–256 characters. The adapter uses an eight-second timeout and 8 KiB response limit, requires HTTPS for production-grade endpoints, and fails closed on missing configuration, transport/status failures, oversized or malformed responses, or negative/missing evidence. It is implemented but not live-verified without owner provider credentials. There is no checkbox fallback, and verifier success cannot override the production identity gate.

The provisional Cloudflare/OpenNext profile does not enable child features by itself. Under-13 support remains blocked first on an independent opaque backend-for-frontend identity that keeps guardian Supabase access/refresh credentials out of the child-facing browser. The managed identity must be learner/device/session scoped, short-lived, revocable, and independently enforced by every downstream service. Every item in **Owner launch gate** below remains additionally required after that technical boundary exists.

## HTTP and browser controls

The foundation configures this application response baseline:

- `Content-Security-Policy` limited to self-hosted application assets, data/blob media where required, localhost development connections, and Supabase HTTP/WebSocket origins;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` disabling camera, geolocation, and microphone;
- `frame-ancestors 'none'` and `X-Frame-Options: DENY` for current routes;
- `Cross-Origin-Opener-Policy: same-origin`;
- no production indexing for preview/developer-only surfaces;
- non-sensitive health output with `Cache-Control: no-store`.

The application does not emit HSTS during local development. Production parsing rejects HTTP application or Supabase origins, and cookie factories set `Secure` from production classification. HTTPS deployments must also add/verify HSTS at the reviewed edge, with a staged rollout before `includeSubDomains` or preload.

### Hosted bootstrap posture

- Vercel Standard Deployment Protection remains enabled for generated deployment URLs;
  `https://recallflash.com` is the deliberately tested Production endpoint.
- `www.recallflash.com` and the retired `cogniflow-pearl.vercel.app` alias redirect to the apex with
  `308`, preventing either from becoming a second canonical or Auth origin.
- Hosted Playwright can receive a project-scoped automation bypass only through the transient
  `VERCEL_AUTOMATION_BYPASS_SECRET` process variable. The tracked runner never contains its value.
- `DEPLOYMENT_PROFILE=vercel_beta` and Vercel Preview both produce an `X-Robots-Tag` no-index policy;
  `/robots.txt` disallows all crawling for the custom-domain beta.
- Preview and Production use independently generated application-owned keys and separate Supabase
  projects. No database password or service credential has a `NEXT_PUBLIC_` name.
- Managed child profiles, independent child publication, unrestricted free-text game chat, direct
  messaging, parental-consent activation, OAuth, cloud AI, analytics, and monitoring remain disabled.

Exact provider configuration and repeatable verification commands are in
[HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md); the secret-free variable contract is
[HOSTED_ENVIRONMENT.md](./HOSTED_ENVIRONMENT.md).

Every JSON mutation Route Handler validates a bounded body and enforces same-origin `Origin`; cross-site `Sec-Fetch-Site` is rejected when present. This supplements SameSite cookies. Authentication, authorization, and RLS still run after origin validation. Safe error codes/messages avoid reflecting credentials, provider errors, unsafe nicknames, or protected resource existence.

The custom-domain smoke contract asserts the apex canonical link, a host-only `Secure`, HttpOnly,
SameSite=Lax recovery-state cookie, and rejection of the retired Production host as a mutation
origin. The repository currently contains no Server Actions; Next.js's default Origin-versus-Host
validation remains unmodified, and no secondary `allowedOrigins` entry is configured.

### CSP evolution plan

The initial production policy permits only application assets and the configured Supabase HTTP/WebSocket origins. Development may require `unsafe-eval` for tooling; production must not inherit that exception. Inline style support is kept as narrow as the Next.js rendering/toolchain requires.

Later features amend the policy deliberately:

- public embed routes receive their own reviewed `frame-ancestors` policy instead of weakening the whole site;
- media/storage origins are allowlisted from validated configuration;
- external video is restricted to approved providers and sandboxed frames;
- nonce/hash support is introduced if rich rendering requires inline scripts;
- report-only rollout precedes a materially stricter production CSP, and reports are scrubbed of sensitive URLs/data.

No user content can add script, iframe, event-handler, network, or arbitrary JavaScript capability.

## Supabase and database controls

- The browser receives only the publishable key.
- Secret/service credentials are limited to audited server operations.
- Every exposed table enables RLS before use and receives an attacker-oriented policy matrix.
- Authorization is never based on `raw_user_meta_data`.
- Policy helpers and reusable privileged implementations live in `private`. ADR-0012 permits only the smallest intentionally callable PostgREST transaction wrappers in `public`; every such wrapper fixes an empty `search_path` and receives signature-specific minimal grants.
- Public views are security-invoker or isolated from exposed schemas.
- Storage objects are private unless an explicit publication relation grants access; private bucket paths are not made public by convention.
- Local client URLs use `127.0.0.1`, but Docker Desktop can publish Supabase ports on all host
  interfaces. Run the stack only on a trusted machine/network, keep the host firewall enabled,
  and never expose those development ports through router forwarding, tunnels, or a public host.

Phase 01 applies these rules concretely:

- all 14 identity/privacy/guest tables in `public` enable RLS before grants;
- authenticated callers receive only explicit, policy-scoped reads and no direct product-table mutation grants;
- service adapters receive no broad identity-table read grant; authentication-profile lookup and verified Auth-session device registration use narrow, service-only RPC projections instead;
- `profile_sessions.token_hash` is excluded from the authenticated column grant;
- `audit_events` and `guest_sessions` have no client table-read grant/policy;
- authenticated `current_*` mutation RPCs derive the actor from `auth.uid()`, require the JWT-bound active device, hold the managed-session advisory lock, and perform the self-context check and mutation in one transaction;
- guardian exit and exact current-device sign-out are the deliberate managed-mode exceptions to self-only mutation mode: guardian exit derives the same account/Auth-session context and consumes a fresh proof before revoking the managed lock, while current sign-out can only revoke that exact device/profile session;
- `current_revoke_profile_session()` is a self-context-only boundary for one account-owned learner session: it locks the selected row and target Auth-session boundary, consumes a fresh `security_change` proof, writes the selected revocation/audit fact, and leaves the containing device and unrelated sessions active;
- administrative/implementation RPCs remain `service_role` only and fix an empty `search_path`; provisioning, RPC-only profile/device handling, onboarding/verified-child proof issuance, provisional identity rejection, profile-session registration, school proof issuance/consumption, due deletion processing, generic audit, rate limiting, guests, purge, and opaque-session resolution accept only bounded prevalidated server-adapter input;
- `private` stores rate buckets, re-authentication grants, learner credentials, school-authorization proofs, onboarding authorizations, and child-creation authorizations, with no browser-role schema usage;
- onboarding and child-creation authorization rows bind independent proof and canonical payload digests to the exact account/Auth session for no more than ten minutes; authenticated consumers finalize them once under lock, clear the proof digest, and immutable-field triggers reject later rewriting;
- the verified-child issuer requires the exact minimized consent scope and closed settings object; SQL validation explicitly rejects missing keys, JSON null, wrong types, unexpected keys, malformed evidence, and expired/bad proof state, while lower-level child issuers/creators are not service-callable;
- managed learner preference mutation accepts explicit theme/motion/serious/reading fields and reconstructs the settings object server-side, preserving mandatory minimized analytics, private content, and disabled social interaction;
- school-managed creation accepts only minor age bands plus the same closed seven-key privacy-safe settings shape; it rejects adult/unknown age, missing/null/mistyped/extra/unsafe fields, and reconstructs the stored settings object from validated values before consuming the one-time school proof;
- user-editable `raw_user_meta_data` cannot grant a capability, role, guardian relationship, or learner access;
- teacher observers receive only a bounded projection and cannot select full child records;
- non-live accounts and unregistered/revoked Auth sessions fail closed in RLS, preventing a suspended/deleted account or stale JWT from reading account data;
- audit idempotency is actor-scoped with null actor columns compared consistently, and a replay must match the original target.

Hosted Supabase may provision broader default `service_role` table and sequence grants than the
local stack. Migration `20260715006900_hosted_grant_parity.sql` explicitly revokes those current and
default privileges so hosted behavior matches the RPC-only contract. The guarded hosted verifier
checks exact migration history, migration dry-run, database lint, read-only grant/RLS/function/view/
publication invariants, empty storage, schema diff, and generated-type parity after every promotion.

The Supabase secret/service credential bypasses ordinary RLS and is therefore used only inside server-only adapters. Account-triggered adapters verify the current user before use; system/worker adapters validate a bounded job or infrastructure contract and receive no arbitrary client pass-through. The credential must never be placed in a Client Component, public error, diagnostic artifact, or browser-capability object.

See [DATA_MODEL.md](./DATA_MODEL.md) for the migration and RLS contract.

## Implemented Phase 01 application controls

- Same-origin/CSRF checks for cookie-authenticated JSON mutations.
- Database-backed fixed-window limits for signup/password sign-in, password reset/magic links, profile PINs, guest admission, exports, re-authentication, and deletion/destructive actions.
- Request-context network/account rate subjects are HMAC-pseudonymized by server adapters; internal per-resource buckets use SHA-256 of an already-authorized profile/account UUID. Raw network addresses are neither returned nor persisted.
- Neutral email-auth and guest-room errors that do not enumerate accounts or rooms.
- Recent password verification for device revocation, selected learner-session revocation, guardian-consent revocation, profile-access rotation, guardian exit, account deletion, and deletion cancellation.
- A maximum ten-minute, purpose-scoped re-authentication grant; account-deletion request and cancellation each consume their own single-use proof.
- Device records and learner-profile sessions bound to the verified Supabase Auth `session_id`; profile state and device registration are RPC-only service operations, and registration verifies the corresponding live `auth.sessions` row without a general service-table read.
- Device/access/consent/sign-out revocation cascades to relevant profile sessions, and managed mode remains locked beyond study expiry until explicit guardian exit/revocation. Current-device sign-out is managed-mode-safe and exact-session-only; all-device sign-out requires self context and a fresh password-derived `security_change` proof.
- Selected profile-session revocation is separately self-context and password/proof gated; ownership is checked in the atomic wrapper, the actor-selecting implementation remains unavailable to browser roles, and the device stays active.
- Profile PINs and new 16-character, 80-bit family codes stored with independent cost-12 salted bcrypt; opaque profile-session tokens stored only as SHA-256 digests. Legacy family-code SHA values remain verification-only until rotation.
- Signed guest reconnect tokens delivered through an HttpOnly cookie, with only the SHA-256 digest stored.
- Append-only consent and audit triggers plus actor-scoped idempotency/correlation keys on sensitive RPCs.
- Signed onboarding and verified-consent route decisions exchanged for separate random, short-lived, Auth-session/payload-bound database proofs; one-time finalization clears proof digests, and exact replays must match their original payload/idempotency key.
- Two-stage password-recovery intent: signed nonce/email/return-path pending state before the email callback, followed only on a matching recovered session by a short-lived account-bound password-update capability; query tampering and state mismatch fail closed.
- Strict verified-child payload validation and explicit managed-learner preference fields, preventing arbitrary JSON settings or missing/null privacy controls from crossing a service/PostgREST boundary.
- A private school-authorization ledger containing only proof/evidence digests; issuance is service-only after upstream verification, expires within 15 minutes, and can be consumed once for the bound actor/owner.
- Account export request/job state that does not claim a file exists, plus a due-deletion transaction that removes the Auth principal and secrets, minimizes identity data, and preserves opaque tombstones required for append-only evidence.
- Immediate service-only rejection/minimization of recent provisional Auth identities that lack valid signed onboarding authority; completed accounts are excluded from this path.
- Account/active-learner theme, motion, and serious-mode values hydrate the protected shell authoritatively; managed profiles cannot inherit stale guardian browser preferences and missing managed values fail closed to low stimulation.
- A successful profile switch always replaces the current document after best-effort learner/private browser-store cleanup, preventing a cleanup API failure from leaving guardian React state mounted under the new HttpOnly learner session.
- Universal production child-profile shutdown plus production HTTPS origin validation and production-classified `Secure` cookies.

## Application controls required as later features arrive

- Idempotency for offline reviews, imports, invitations, game answers, and ledger writes.
- File size, decompression, MIME, magic-byte, image re-encoding, and malware-risk controls.
- SSRF defenses for URL imports: approved protocols, DNS/IP checks before and after redirects, time/size limits, and no private-network targets.
- Strict rich-document schema and render-time output encoding; never trust stored HTML.
- Safe template DSL with bounded loops/components and no arbitrary JavaScript or network access.
- Structured logs with correlation IDs and no tokens, private answer text, or child identifiers.
- Append-only or compensating events for review, score, XP/currency, consent, and audit ledgers.
- Short-lived signed URLs and guest tokens, rotation/versioning, and hashed stored token identifiers.
- Scheduled and monitored execution for guest/rate-bucket cleanup, audit retention, export assembly/download expiry, and invocation of the implemented due-deletion boundary.

## Privacy principles

- Collect the minimum data required for an implemented user outcome.
- No advertising, sale of data, cross-site tracking, or child session replay.
- First-party operational telemetry is aggregated and excludes raw answer content.
- Age is represented as an age band unless a reviewed consent process genuinely requires more.
- Guests are pseudonymous, short-lived, and not persistently tracked.
- Personal export, deletion, guardian access, consent, and retention workflows ship with the data-owning phase, not as policy-only promises.
- Class membership never grants access to unrelated personal decks or private SRS history.
- Academic accuracy, mastery, scheduling, game score, XP, and currency remain separate records.

### Current lifecycle limits

Phase 01 creates real export/deletion requests and job rows. It does not yet assemble an archive or publish an expiring download. It does implement `admin_process_account_deletion()` as a service-only, idempotent transaction for a due job: the Auth principal and secret/session material are removed; permissions, relationships, active school proofs, and consent grants are revoked; mutable account/learner fields become opaque tombstones; and required workflow plus append-only evidence remains minimized/immutable. A direct Auth deletion outside this transaction is rejected, and the deleted subject cannot be reused.

No deletion or guest-purge scheduler is deployed. An owner-operated worker must select due jobs, call the deletion boundary with a stable per-attempt idempotency key, monitor terminal/failure state, and extend the data-deletion matrix as later phases add tables. UI and documentation must distinguish a queued grace-period request from a completed tombstoned job.

The authenticated deletion-request boundary validates and applies the server-configured grace period from 1 through 90 days. The database also enforces a 30-minute maximum managed-study window while retaining the explicit managed-mode lock until revocation. Audit and guest retention are not guarantees without scheduled cleanup and monitoring.

## Dependency and supply-chain controls

- Exact package versions and a frozen lockfile are required in CI.
- GitHub Actions are pinned to full commit SHAs with the human-readable release in comments.
- Install scripts are permitted only for reviewed packages in `pnpm-workspace.yaml`.
- Secretlint runs before build/test publication.
- Dependency updates follow ADR-0008 and include peer/engine review and complete verification.
- Build/test artifacts are retained briefly on failure and must not contain environment dumps or Supabase secret output.

## Incident response minimum

Before production beta, the owner must document contacts and practice this sequence:

1. contain the affected route/provider/credential without deleting evidence;
2. rotate exposed keys and invalidate affected sessions/tokens;
3. preserve privacy-safe logs, correlation IDs, deployment versions, and migration state;
4. assess data categories, people, time range, and provider involvement;
5. follow reviewed notification, provider, and legal obligations;
6. remediate, add a regression test, and record the decision/timeline;
7. minimize retained incident data after the required window.

Do not paste secrets or personal data into public issues, AI prompts, chat, or third-party debugging tools.

## Owner launch gate

### Required before any public beta

- production secrets generated independently and stored in provider secret managers;
- preview and production projects separated;
- security headers/CSP verified against the deployed build;
- dependency and secret scans reviewed;
- Supabase RLS policy matrix passes for every exposed table;
- database backup/export and restore exercise completed;
- real privacy, terms, safety, copyright, retention, deletion, and incident documents reviewed;
- an operator legal identity plus staffed privacy, safety, security, and copyright contact channels published;
- provider terms for hosting, database, email, storage, analytics, monitoring, and realtime reviewed;
- production health/logging checked without exposing secrets.
- custom SMTP, sender-domain authentication, auth redirects/templates, and enabled OAuth providers live-verified without exposing provider secrets;
- owner-operated scheduling and alerting configured for due deletion jobs and every enabled retention worker.

### Additional hard block before under-13 profiles

- a production-ready independent opaque backend-for-frontend identity that keeps guardian Supabase access/refresh credentials out of child-facing browsers and is learner/device/session scoped, short-lived, revocable, and authorized by every downstream service;
- qualified legal review of applicable federal and state requirements;
- current terms/DPA review for every processor and hosting profile;
- direct parent notice and privacy notice;
- a selected and implemented verifiable parental-consent method with production credentials and live provider verification;
- guardian access, consent revocation, export, deletion, and retention workflows tested;
- vendor/subprocessor records and incident responsibilities established;
- child analytics minimized with no session replay or cross-site tracking;
- public child content, external links, direct messages, unrestricted chat, and global leaderboards disabled unless separately reviewed;
- a production deployment other than the prohibited Vercel child profile validated only after the universal production identity gate is deliberately superseded.

Until then, child-capable code paths remain disabled in every production runtime regardless of engineering completeness, consent-verifier response, or hosting profile. Local/test coverage is not activation evidence.

Provider dashboards, SMTP credentials, OAuth applications, consent-provider credentials, production secrets, worker schedules, and deployment promotion are owner/operator-only actions. A source pull request may implement and test adapters, but it must not enable, deploy, or claim live verification for those external systems without explicit owner control and recorded evidence.

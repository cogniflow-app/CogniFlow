# Deployment and portability

**Initial target:** Vercel preview and 13+ beta  
**Portable candidate:** Cloudflare Workers through OpenNext  
**Last updated:** 2026-07-15

A successful build proves compile-time compatibility only. It does not prove a live provider configuration, legal compliance, child eligibility, quotas, backup readiness, or production security.

Provider dashboards, SMTP/OAuth applications, consent-provider credentials, hosted migrations, worker schedules, secrets, domains, and promotion require explicit owner authorization. The one-time hosted bootstrap has provisioned the Phase 01 Supabase and Vercel targets; future promotions must follow [HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md). Pull-request validation may exercise adapters with deterministic or local configuration, but must not deploy or claim that an external integration is live-verified.

## Shared build contract

- Node.js `24.18.0` locally/CI; hosted providers select the current `24.x` runtime.
- pnpm `11.13.0` and a frozen lockfile.
- `pnpm build` is the canonical Next.js production build.
- `pnpm build:portable` produces/validates the OpenNext Cloudflare artifact.
- Domain packages contain no Vercel or Cloudflare APIs.
- `/api/health` returns only status, public build version, runtime/profile classification, and safe capability state—never environment values or credentials.
- Preview/developer surfaces are marked `noindex`; production indexing is enabled only for intentionally public pages.
- Every production configuration requires HTTPS `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SUPABASE_URL`; production-classified cookie clients always emit `Secure` cookies.
- Every production authenticated learner context is self-profile-only; ephemeral game guests remain a separate pseudonymous boundary. Managed child profiles remain a local/test capability until an independent opaque backend-for-frontend identity replaces the guardian bearer credential on child-facing surfaces.

## Required environment inventory

| Variable/group                       | Vercel                   | Cloudflare/OpenNext       | Notes                                                                                                   |
| ------------------------------------ | ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Public app name/URL/Supabase URL/key | Build/runtime            | Build/runtime             | Public values only; both URLs must be HTTPS in production; app URL is the accepted mutation origin      |
| `SUPABASE_SECRET_KEY`                | Secret                   | Worker secret             | Server-only service/admin RPC access; never serialize                                                   |
| `DATABASE_URL`                       | Unset                    | Future worker secret      | Optional; web uses Supabase HTTP APIs. Add only when a direct-Postgres worker has an implemented parser |
| `DEPLOYMENT_PROFILE`                 | `vercel_beta`            | `cloudflare`              | Drives the server capability guard                                                                      |
| Child/public/chat flags              | All `false`              | All `false` in production | Production parser forces them off; local/test owns managed-profile verification                         |
| `PARENTAL_CONSENT_MODE`              | `disabled`               | `disabled` in production  | The external verifier adapter cannot override the production managed-identity gate                      |
| `PARENTAL_CONSENT_VERIFIER_URL`      | Unset                    | Server-only config        | Required when adapter is tested; use HTTPS for a production-grade endpoint                              |
| `PARENTAL_CONSENT_VERIFIER_API_KEY`  | Unset                    | Worker secret             | Required for `external_verified`; independent 24+ character credential                                  |
| Email-confirmation/OAuth flags       | Match reviewed providers | Match reviewed providers  | Visibility/UX flags only; do not contain or configure credentials                                       |
| Retention/rate-limit values          | Server config            | Server config             | Typed/bounded; deletion RPC and cleanup boundaries still require owner schedules                        |
| `APP_ENCRYPTION_KEY`                 | Secret                   | Worker secret             | Independent 32+ byte HMAC/signing key                                                                   |
| `GUEST_TOKEN_SIGNING_KEY`            | Secret                   | Worker secret             | Independent 32+ byte guest-claim key                                                                    |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Secret                   | Worker secret             | Stable base64 32-byte key shared by instances                                                           |
| `NEXT_PUBLIC_BUILD_VERSION`          | Build/runtime            | Build/runtime             | Public commit/release identifier                                                                        |

Generate production secrets independently with a cryptographically secure generator. Do not copy local defaults, reuse keys across purposes/environments, or commit secrets to provider configuration files.

### Stable Server Action encryption

Next.js otherwise generates an encryption key during build. Multiple builds/instances need a stable deployment value so encrypted Server Action references remain consistent during a rollout:

```bash
openssl rand -base64 32
```

Store the result as `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in the provider's encrypted secret store. Rotate through a coordinated deployment/session plan; do not expose it as `NEXT_PUBLIC_*`. `APP_ENCRYPTION_KEY` is an application key and is not a substitute.

## Vercel preview and beta

The single hosted web project is configured with `apps/web` as its Root Directory, Next.js as the
framework preset, Node `24.x`, and pnpm `11.13.0`. Its explicit monorepo commands are:

```text
Install: cd ../.. && pnpm install --frozen-lockfile
Build:   cd ../.. && pnpm exec turbo run build --filter=@lumen/web
Output:  Next.js default (.next)
```

For a new provider import or a configuration audit:

1. Import exactly one project and set the Root Directory to `apps/web`.
2. Select Node `24.x` and Next.js.
3. Use the install/build commands above and the default Next.js output.
4. Configure preview and production variables separately.
5. Set:

   ```env
   DEPLOYMENT_PROFILE=vercel_beta
   ENABLE_CHILD_PROFILES=false
   ENABLE_PUBLIC_CHILD_CONTENT=false
   ENABLE_FREE_TEXT_GAME_CHAT=false
   PARENTAL_CONSENT_MODE=disabled
   ```

6. Leave all OAuth flags false until the corresponding Supabase/provider application is configured and live-tested. Keep the email-confirmation flag aligned with Supabase Auth.
7. Point previews at a non-production Supabase project and apply migrations through a reviewed deployment workflow, never automatically from an untrusted pull request.
8. Verify `/`, public information/join/auth routes, `/api/health`, error/not-found handling, security headers, robots metadata, and Supabase connectivity.
9. Run the guarded hosted smoke tests against the deployment before promotion.

The exact project identity, URLs, scoped environment assignments, Deployment Protection behavior,
and smoke commands are recorded in [HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md). The complete
secret-free variable contract is [HOSTED_ENVIRONMENT.md](./HOSTED_ENVIRONMENT.md).

Do not place a secret key in Vercel variables whose name begins `NEXT_PUBLIC_`. Do not expose production data to forked preview builds.

The age gate depends on signed HttpOnly state surviving the provider/email round trip. Keep `APP_ENCRYPTION_KEY` stable across instances and the rollout window, preserve the exact allowlisted `/auth/callback` URL, and test password plus every visible OAuth signup as a new identity. Final onboarding exchanges the signed account-bound gate for a separate short-lived, Auth-session/payload-bound database proof before activation. A recent new identity without matching signed eligible signup state is signed out, rejected through the provisional-account minimization boundary, and denied; do not weaken that behavior to accommodate a misconfigured callback.

Password recovery uses a separate pre-email state under the same stable key. The forgot-password route sets an at-most-15-minute pending HttpOnly cookie and places only its random callback nonce in the allowlisted redirect. Callback/confirm processing must match that nonce, the normalized-email HMAC, expiry, and safe return path before issuing the account-bound ten-minute reset capability. A query-only `intent=recovery`, missing cookie, subject mismatch, or expired state signs out the local recovered session and redirects to the neutral expired-link surface; do not bypass this check to accommodate a rewritten email URL.

## OpenNext/Cloudflare candidate

The pinned compatibility group is:

- `@opennextjs/cloudflare` `1.20.1`;
- Wrangler `4.110.0`;
- `rclone.js` `0.6.6`;
- Next.js `16.2.10`.

Validate the transform without deploying:

```bash
pnpm build:portable
```

After owner authentication/configuration, preview the already configured web workspace with:

```bash
pnpm --filter @lumen/web preview:portable
```

Deployment is intentionally not part of `pnpm verify` or pull-request CI. Provider secrets are added with Wrangler's secret mechanism, not plaintext `vars`. A live deploy requires an owner-reviewed Cloudflare account, Workers configuration, routes/domain, compatibility date/flags, Supabase networking, and current quota/terms review.

### Portability constraints

- Use the Next.js Node runtime supported by OpenNext; do not make authorization/correctness depend on unsupported Node Middleware.
- Request interception uses `apps/web/middleware.ts`, not Next 16's Node-only `proxy.ts`, because the pinned OpenNext transform requires the Edge-compatible middleware contract. It performs only best-effort Supabase cookie refresh, forwards the internal request path for `/app`/auth/onboarding and canonical public-shell families, and sets `private, no-store`; protected pages/routes/RPCs authorize independently. The public-shell viewer uses that path only after narrowing it to `/`, discover/deck/creator/embed/join/legal families and falls back to an anonymous safe CTA if Auth is unavailable.
- Validate every Next.js or OpenNext upgrade with `build:portable` and a live preview smoke test before promotion.
- Keep Workers compressed bundle size within the selected plan limit and measure it from Wrangler output.
- Direct Postgres connections may be unsuitable for a high-concurrency Worker runtime; use the reviewed Supabase HTTP APIs or an appropriate pooled connection path.
- Cloudflare hosting does not migrate Supabase Auth/database/storage/realtime automatically.
- Passing a Cloudflare build does not make the deployment child-capable.
- Production Cloudflare/OpenNext configuration forces child profiles and parental-consent mode off even when feature flags or verifier credentials request otherwise. The checked-in `external_verified` adapter may be exercised only in a nonproduction Cloudflare-shaped environment while the production identity gate is active. It sends an HMAC subject—not an account email—with age band, policy version, and scope; requires affirmative bounded evidence; uses an eight-second timeout and 8 KiB response limit; and requires an HTTPS verifier for production-grade endpoints. It is implemented but not live-verified without owner provider credentials and cannot enable a production child profile.

Re-enabling a managed learner on any production host requires a superseding architecture decision and an opaque backend-for-frontend identity that prevents the child-facing browser from receiving or retaining guardian Supabase access/refresh credentials. That identity must be learner-, device-, and session-bound, short-lived, revocable, and independently authorized by every downstream service. Consent/provider/legal launch gates still apply after this technical prerequisite is met.

## Security headers and CSP verification

The Next.js configuration owns the route header baseline described in [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md). At deployment, inspect actual responses rather than assuming config propagation:

```bash
curl -I https://preview.example.invalid/
curl -I https://preview.example.invalid/api/health
```

Verify CSP, content-type sniffing protection, referrer policy, permissions policy, frame policy, cache behavior, and preview `noindex`. HSTS is meaningful only over HTTPS and must be rolled out deliberately. Future embed routes need a narrower route-specific frame policy.

## Supabase deployment discipline

- Use separate local, preview/staging, and production projects.
- Review migration SQL and database tests before applying remotely.
- Never edit an applied migration; roll forward.
- Generate database types from the migration-defined schema.
- Enable and test RLS before exposing a table.
- Back up/export before a material migration and practice restoration.
- Keep secret/service credentials server-side and rotate on suspected exposure.
- Read quotas from current provider configuration; do not assume a free tier meets scale targets.

Phase 01 adds Auth-trigger provisioning, identity/privacy tables, RLS, authenticated atomic `current_*` wrappers, private authorization ledgers, and service-only infrastructure. A hosted project must receive the complete additive migration chain through `20260715006900_hosted_grant_parity.sql` before the Phase 01 application is promoted. This includes the closed school-managed settings boundary in `20260715006700_school_managed_payload_hardening.sql`, exact profile-session revocation in `20260715006800_profile_session_revocation_boundary.sql`, and explicit revocation of hosted platform default service-role table/sequence grants in `20260715006900_hosted_grant_parity.sql`. The service secret is required only by server-side provisioning, RPC-only authentication-profile/device handling, onboarding/verified-child proof issuance, provisional-identity rejection, profile-session, school-authorization, guest/rate-limit, audit, and deletion-worker adapters; it must not be substituted for the browser publishable key. The service role is intentionally not granted broad identity-table reads.

Use only the guarded repository commands for hosted promotion and parity checks:

```bash
pnpm db:deploy:preview
pnpm db:verify:preview
pnpm db:deploy:beta
pnpm db:verify:beta
```

The Beta deploy command refuses to run unless the worktree is clean, the current branch is `main`,
and `HEAD` exactly equals freshly fetched `origin/main`. Neither deploy command has a seed, reset,
repair, `--include-all`, or config-push path. See [HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md)
before running one.

The application-device rows are bound to verified Supabase Auth `session_id` claims. Device registration goes through `admin_register_request_device()`, which verifies the exact live row in `auth.sessions` and returns the canonical application device without requiring a service-role table read. Current-device sign-out is available even in managed mode and revokes only that JWT-bound application device/profile sessions. All-device sign-out is a distinct self-context operation that consumes a fresh password-derived `security_change` proof before revoking every application device. From the devices/settings surface, a self-context owner may instead revoke one selected learner-profile session after a fresh password-derived `security_change` proof; the containing device and unrelated profile sessions remain active. These paths mutate Postgres before any relevant Auth invalidation, and RLS denies an access token whose exact device registration is missing/revoked or whose account is no longer live. Do not remove the application revocation call on the assumption that hosted Auth sign-out invalidates every already-issued access token immediately.

The signed onboarding cookie and consent-verifier result are route inputs, not direct database authority. Their server routes issue independent random proofs through service-only RPCs; private rows bind only proof/payload digests to the account and exact Auth session for at most ten minutes. Authenticated consumers recompute the exact payload, finalize the proof once, and clear its digest transactionally. The child issuer additionally accepts only the exact minimized consent scope and closed learner-settings object; missing, null, mistyped, or extra fields are denied. Do not call the revoked lower-level child issuer/creator from a deployment adapter.

### Hosted Auth readiness

Before promotion:

- set the Supabase Auth Site URL to the stable environment origin and allowlist the application's `/auth/callback**` path; use only the minimum Vercel Preview wildcard documented in [HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md);
- configure custom SMTP and a verified sender domain; review signup, magic-link, recovery, email-change, and security-notification templates;
- align Confirm Email with `AUTH_EMAIL_CONFIRMATION_REQUIRED` and test both success and expired-link behavior;
- configure each enabled Google/GitHub/Microsoft provider with the Supabase `/auth/v1/callback` URL, minimal scopes (including the explicitly requested Microsoft `email` scope), reviewed tenant/audience, and secrets held by Supabase/provider settings;
- enable and test manual identity linking before exposing provider-connection controls;
- verify current/global sign-out, device registration/revocation, and safe neutral responses in a non-production project;
- verify that password recovery succeeds only with the server-issued pending nonce/email binding and that a forged query-only recovery intent is signed out and denied;
- verify a teen/adult signup through each visible provider, an under-13 pre-provider refusal, a mismatched/expired age-gate callback denial, and final onboarding without a client-supplied age field.

Email/password, local email capture, magic link, recovery, and the Google/GitHub/Microsoft adapters are implemented in the repository. Custom SMTP, hosted email delivery, identity linking, and each provider application remain **implemented but not live-verified** until the owner completes this checklist with environment-specific credentials and records evidence.

The default hosted email templates must retain `{{ .ConfirmationURL }}`. The application supplies a
stateful, allowlisted `/auth/callback` RedirectTo for signup, magic-link, and recovery flows; replacing
that value with `{{ .SiteURL }}` or appending a hard-coded path discards the signed flow state. A
custom token-hash template targeting `/auth/confirm` is a separate provider-gated change and must be
live-tested before use.

See [SETUP.md](./SETUP.md#hosted-supabase-auth-configuration) for the provider checklist and current official references.

## Background operations introduced by Phase 01

Phase 01 supplies durable rows and restricted RPC boundaries, not a deployed scheduler. Promotion planning must assign and monitor owners for:

- building a portable account archive, marking `data_export_jobs`, storing it privately, and expiring the download after the configured window;
- invoking the implemented service-only `admin_process_account_deletion()` transaction for queued jobs after the grace period, using stable completion idempotency keys and a reviewed data-deletion/retention matrix;
- purging expired/revoked guest sessions and expired rate-limit buckets through the service-only purge boundary;
- retaining/removing append-only audit evidence according to the reviewed policy without erasing required consent/security records;
- alerting on repeatedly failing or stuck privacy jobs without logging private payloads or tokens.

The deletion transaction removes the Supabase Auth principal and provider/session material, deletes application devices/profile credentials/re-authentication grants, revokes access and active school proofs, writes compensating consent revocations, minimizes account/learner fields, and retains opaque tombstone identities required by append-only audit/consent evidence. Direct deletion of an application Auth user outside that worker transaction is rejected, and a deleted subject cannot be reused. Later data-owning phases must extend the worker's deletion matrix before their tables ship.

Until the owner schedule is deployed, UI must represent a deletion as queued during its grace period rather than completed. A completed job may be shown as tombstoned only after the worker RPC succeeds. Export UI may show only queued/status infrastructure until an archive worker exists. `DELETION_GRACE_PERIOD_DAYS` is validated from 1 through 90 days; configuration does not invoke the worker.

## School authorization integration boundary

School-managed learner creation is not activated by the ordinary `teach` capability or an environment flag. A future owner-reviewed server integration must verify provider/school evidence outside Postgres, store no raw evidence or bearer credentials, and call service-only `admin_issue_school_authorization()` with independent proof/evidence digests. The proof expires within 15 minutes and is actor/owner-bound. Only its one-time consumption by `admin_create_school_managed_learner()` creates the learner; mismatch, expiry, reuse, or direct browser access is denied. The creation boundary accepts only `under_13`/`teen` learners and the exact privacy-safe settings set: `analytics=essential_only`, public content off, social interactions off, bounded theme/reading style, and boolean reduced-motion/serious-mode values. It rejects missing, null, mistyped, extra, or unsafe settings and reconstructs the persisted JSON instead of copying adapter input.

The repository includes this database boundary, not a selected school identity provider or live evidence-verification adapter. Provider contracting, credentials, evidence semantics, subject authority, revocation feed, and live verification remain owner-only future setup and must not be represented as enabled Phase 01 functionality.

## Observability and privacy

The current application uses build/runtime health and append-only database audit facts for sensitive accepted mutations. A structured server-logging provider/pipeline is not implemented yet; when one is selected, it must exclude sensitive payloads. Optional external error/analytics providers remain disabled until configured and reviewed. Before enabling one:

- document data fields and retention;
- strip tokens, answer text, content bodies, and child identifiers;
- disable child session replay and cross-site tracking;
- establish environment-specific sampling and deletion controls;
- add the provider to owner/vendor records.

## Promotion checklist

- frozen install, lint, typecheck, unit/database/browser/a11y tests, standard build, and portable build pass;
- exact results are recorded rather than inferred;
- migration chain applies from empty and to staging data safely;
- production variables pass validation, both public origins are HTTPS, and child/chat flags are false;
- parental consent mode is disabled in every production runtime; the additional Vercel profile and provider-owned `VERCEL=1` overrides are covered;
- no managed learner is enabled on any production host until an independent opaque backend-for-frontend identity is implemented and reviewed; a portable build or verifier test cannot waive this gate;
- Auth Site URL/redirects, custom SMTP, email confirmation, templates, manual identity linking, and each visible OAuth provider are live-verified;
- secrets differ from local/preview and are not present in artifacts/logs;
- security headers/CSP and robots behavior are verified on the deployed origin;
- health response is non-sensitive and identifies the intended build;
- rollback target and database roll-forward plan are documented;
- backup/export restoration has been exercised;
- export, deletion-schedule, guest, and audit-retention worker ownership is explicit; the deletion transaction is not represented as scheduled until an owner-operated runner is deployed;
- provider quota alerts and responsible owner contacts exist;
- privacy/terms/safety/copyright and incident procedures have been reviewed.

## Rollback

Application deployments may roll back to a previously verified immutable artifact. Database migrations do not roll backward by deleting user data; issue a compensating forward migration. If an application/database contract is changing, use expand/migrate/contract so both deployment versions can coexist during promotion/rollback.

Rotate credentials immediately when exposure is suspected; an application rollback alone does not revoke a leaked secret.

## Child-safety launch gate

Every production runtime must reject managed/under-13 profile creation and activation even when a client, environment value, consent mode, verifier credential, or application request is tampered with. Vercel's deployment profile and provider-owned `VERCEL=1` marker remain additional server-side hard stops.

The first technical prerequisite for any future production child profile is an independent opaque backend-for-frontend identity: the child-facing browser must never receive or retain the guardian's Supabase access/refresh credentials, and the replacement identity must be narrowly learner/device/session scoped, short-lived, revocable, and enforced by database and non-database services. A passing local/test managed-profile flow demonstrates only the guardian/RLS/session implementation. A passing external-verifier or portable-build test does not satisfy this identity prerequisite.

After that boundary exists, the implemented external verifier still requires reviewed production credentials and live verification against the owner-selected provider. Current hosting, Supabase, email, storage, analytics, monitoring, realtime, and AI terms must be reviewed; parental notice/consent, retention, guardian rights, incident response, and applicable legal obligations must be implemented and reviewed by qualified counsel.

No build, automated test, or generated document can waive either gate.

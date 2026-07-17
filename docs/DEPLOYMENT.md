# Deployment and portability

**Initial target:** Vercel preview and 13+ beta  
**Portable candidate:** Cloudflare Workers through OpenNext  
**Last updated:** 2026-07-16

A successful build proves compile-time compatibility only. It does not prove a live provider configuration, legal compliance, child eligibility, quotas, backup readiness, or production security.

Provider dashboards, SMTP/OAuth applications, consent-provider credentials, hosted migrations,
worker schedules, secrets, domains, and promotion require explicit owner authorization. The
one-time hosted bootstrap provisioned the Phase 01 Supabase and Vercel targets; the authorized
Phase 02 feature workflow may promote only committed migrations and its Git-linked application to
Preview. Beta/Production remains post-merge owner work. Every promotion follows
[HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md), and no external integration is live-verified until
the exact command/result is recorded.

## Shared build contract

- Node.js `24.18.0` locally/CI; hosted providers select the current `24.x` runtime.
- pnpm `11.13.0` and a frozen lockfile.
- `pnpm build` is the canonical Next.js production build.
- `pnpm build:portable` produces/validates the OpenNext Cloudflare artifact.
- Domain packages contain no Vercel or Cloudflare APIs.
- `/api/health` returns only status, public build version, runtime/profile classification, safe
  capability state, the sanitized Vercel environment, and the project reference derived from the
  already-public Supabase URL—never credentials or private environment values.
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
8. Verify `/`, public information/join/auth routes, `/deck/[slug]`, `/embed/deck/[publicId]`,
   `/api/health`, protected `/app` routing, error/not-found handling, security headers, robots
   metadata, and Supabase connectivity.
9. Run the guarded hosted smoke tests against the deployment before promotion.

The exact project identity, URLs, scoped environment assignments, Deployment Protection behavior,
and smoke commands are recorded in [HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md). The complete
secret-free variable contract is [HOSTED_ENVIRONMENT.md](./HOSTED_ENVIRONMENT.md).

The Production canonical origin is `https://recallflash.com`. Production-scoped
`NEXT_PUBLIC_APP_URL`, Beta Supabase Auth Site URL, and the application callback all use that apex.
Vercel redirects `www.recallflash.com` and `cogniflow-pearl.vercel.app` to the apex with `308`, so
they are not additional cookie, callback, CSRF, or canonical origins. Preview continues to derive
its deployment-specific origin and remains connected only to Preview Supabase.

Do not place a secret key in Vercel variables whose name begins `NEXT_PUBLIC_`. Do not expose production data to forked preview builds.

### Phase 02 content and Storage checks

Phase 02 adds no Vercel web variable, provider credential, or dashboard-created bucket. Its two
optional media-worker bounds belong only in a separately deployed worker environment. The database
migration owns `lumen-content-media`; a hosted schema or bucket created manually is drift and must
not be accepted. After Preview promotion verify:

- all content/publication tables have RLS and the expected grants/policies;
- the bucket is private, has the migration-defined object ceiling/MIME list, and contains no
  leftover validation object;
- anonymous public enumeration excludes unlisted/private decks while an exact unlisted public ID
  can resolve through only the narrow RPC;
- private/draft media is unreadable anonymously and publication media is readable only through its
  publication relation;
- the API's null creation marker maps to RPC expected version `0`; null/stale update versions and
  null bulk-vector elements fail rather than bypassing concurrency, an omitted new-note ID derives
  from the required idempotency UUID, typed conflicts use non-serialization SQLSTATE `P0001`, and
  version restore creates a new head;
- concurrent idempotent retries serialize, replay rechecks current permission, and a revoked editor
  cannot replay an old receipt;
- custom definitions commit copy-on-write with their note/media graph, deck settings commit with
  publish/unpublish, and the previous split note/media wrapper has no browser grant;
- browser credentials cannot mutate Storage objects; only the authenticated server upload route can
  write the exact reserved pending path, ready objects are immutable, and explicit plus
  cover/audio/pronunciation/drawing usages reconcile the delayed deletion count;
- the private media-deletion job table has no browser/service table grant and only the service role
  can execute bounded claim/complete leases;
- safe public cards render without executing template/rich-content script or network capability;
  and
- `/app` is the Auth fallback, unsafe Auth lifecycle returns fall back to it, and explicit account
  appearance survives protected navigation without leaking across sign-out/profile change.

Physical deletion of an unreferenced media object is not automatic merely because the row has a
`delete_after` timestamp. The repository implements `pnpm worker:media-deletions`, but do not market
or operationally rely on seven-day byte removal until an owner deploys, authenticates, schedules,
monitors, and exercises it and documents restoration/incident handling.

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

Verify CSP, content-type sniffing protection, referrer policy, permissions policy, frame policy,
cache behavior, and preview `noindex`. HSTS is meaningful only over HTTPS and must be rolled out
deliberately. The Phase 02 `/embed/deck/[publicId]` route has a reviewed route-specific
`frame-ancestors 'self' https:` response and omits legacy `X-Frame-Options`; all other routes retain
`frame-ancestors 'none'` plus `X-Frame-Options: DENY`. The embed route also disables microphone,
while non-embed application routes allow same-origin, browser-permission-gated recording. Test
these emitted headers from the deployed routes before accepting external embed support.

## Supabase deployment discipline

- Use separate local, preview/staging, and production projects.
- Review migration SQL and database tests before applying remotely.
- Never edit an applied migration; roll forward.
- Generate database types from the migration-defined schema.
- Enable and test RLS before exposing a table.
- Back up/export before a material migration and practice restoration.
- Keep secret/service credentials server-side and rotate on suspected exposure.
- Read quotas from current provider configuration; do not assume a free tier meets scale targets.

Phase 01 adds Auth-trigger provisioning, identity/privacy tables, RLS, authenticated atomic
`current_*` wrappers, private authorization ledgers, and service-only infrastructure. Phase 02 adds
the following ordered migrations after `20260715006900_hosted_grant_parity.sql`:

```text
20260716000000_content_schema.sql
20260716001000_content_authorization_and_rpcs.sql
20260716002000_content_integration_hardening.sql
20260716003000_content_rpc_parameter_names.sql
20260716004000_content_guarded_read_volatility.sql
20260716005000_content_security_audit_hardening.sql
20260716006000_content_note_create_identity.sql
20260716007000_content_conflict_sqlstate.sql
20260716008000_content_atomic_authoring_and_media_deletion.sql
20260716009000_content_receipt_payload_binding.sql
20260716010000_content_version_media_graph.sql
20260716011000_content_function_volatility.sql
```

The first defines folders/decks/notes/templates/generated cards/media/versions/publication rows and
enables RLS. The second adds actor-derived mutation RPCs, read policies, version/idempotency
enforcement, frozen publication, and the private `lumen-content-media` bucket/policies. The ten
forward hardening migrations compose note/media changes atomically, prevent public projections
from carrying Storage locators/internal card or media IDs, stabilize PostgREST lifecycle arguments,
permit guarded reads to take their authorization locks, reject nullable concurrency state, make
receipt replay authorization-aware, account for embedded media usage, and finally remove direct
browser Storage mutation in favor of the validated server upload route. They also give an ID-less
new note the stable identity of its idempotency UUID
and classify a typed stale-version outcome as user exception `P0001` rather than serialization
failure `40001`. The service secret remains limited to the pre-existing bounded adapters plus media
finalization, public signed-URL location after the Route Handler verifies the applicable contract,
and the bounded media-deletion claim/complete worker protocol. The final four migrations make a
copy-on-write custom definition part of the note/media transaction, combine deck settings with
publish/unpublish, bind every replay receipt to its canonical command, and make the exact media
reference graph part of immutable version capture, restore, duplication, and frozen-publication
privacy; the final migration narrows helper volatility to the strict hosted catalog contract. The
service secret must not be substituted for the browser publishable key, used for
ordinary content reads/writes, or granted broad table access.

The Phase 02 application must not be accepted against a database that lacks the complete
twelve-file chain. The
feature branch can promote them to Preview only after they are committed and locally verified.
Beta promotion still requires merged, clean `main` exactly matching `origin/main`.

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

Application acceptance is also split deliberately:

```bash
pnpm test:hosted:preview --url https://<exact-preview-host>.vercel.app
pnpm test:hosted:preview:content --url https://<exact-preview-host>.vercel.app
pnpm db:verify:preview
```

Both hosted runners authenticate the exact deployment URL/alias against the linked Vercel
project/team before sending an optional long-lived bypass. They exchange it for a validated
exact-host Vercel cookie, remove both long-lived Vercel credentials from Playwright, then preflight
`/api/health` and require the selected environment plus exact public Preview/Beta Supabase project
reference before application assertions or mutations. The
first suite is non-mutating. The second is a guarded Preview-only disposable account/deck flow
whose wrapper first rejects Production aliases and verifies the Preview runtime plus exact public
Preview Supabase project reference through `/api/health`, then captures the Preview server key in
memory, disables trace/video, and always runs the
account-deletion/provisional-rejection cleanup plus recursive empty-object assertion. It must not be
run against Beta or Production, invoked as raw Playwright, or configured through `.env.local`.

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

Beta currently retains the path-limited
`https://cogniflow-pearl.vercel.app/auth/callback**` entry solely for rollback. The host redirects to
the apex during normal operation. Remove that entry only after the rollback window and delivered
custom-SMTP confirmation, magic-link, and recovery checks close; do not remove the Preview wildcard
or local callback entries as part of that Beta-only operation.

See [SETUP.md](./SETUP.md#hosted-supabase-auth-configuration) for the provider checklist and current official references.

## Background operations introduced by Phase 01/02

Phase 01/02 supply durable rows and restricted RPC boundaries, not a deployed scheduler. Promotion planning must assign and monitor owners for:

- building a portable account archive, marking `data_export_jobs`, storing it privately, and expiring the download after the configured window;
- invoking the implemented service-only `admin_process_account_deletion()` transaction for queued jobs after the grace period, using stable completion idempotency keys and a reviewed data-deletion/retention matrix;
- purging expired/revoked guest sessions and expired rate-limit buckets through the service-only purge boundary;
- retaining/removing append-only audit evidence according to the reviewed policy without erasing required consent/security records;
- scheduling and monitoring the implemented one-batch Phase 02 media worker after `delete_after`,
  including lease recovery, database/Storage terminal-state reconciliation, idempotent retry, and
  alerts that do not log signed URLs or content bytes;
- alerting on repeatedly failing or stuck privacy jobs without logging private payloads or tokens.

The deletion transaction removes the Supabase Auth principal and provider/session material, deletes
application devices/profile credentials/re-authentication grants, revokes access and active school
proofs, writes compensating consent revocations, minimizes account/learner fields, and retains
opaque tombstone identities required by append-only audit/consent evidence. Its Phase 02 extension
withdraws publications, minimizes/redacts owned content and history, clears replay receipts, and
makes owned media immediately eligible for the separate Storage cleanup worker. Direct deletion of
an application Auth user or direct account-status mutation outside that worker transaction is
rejected, and a deleted subject cannot be reused. Later data-owning phases must extend the worker's
deletion matrix before their tables ship.

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

# Local setup

This guide brings the Phase 01 workspace up from a clean checkout. Commands run from the repository root unless stated otherwise.

## Prerequisites

| Tool                      | Required version                 | Purpose                         |
| ------------------------- | -------------------------------- | ------------------------------- |
| Node.js                   | `24.18.0` LTS                    | Application, tests, and tooling |
| Corepack                  | `0.35.0` (bundled with Node pin) | Activates exact pnpm            |
| pnpm                      | `11.13.0`                        | Workspace install and scripts   |
| Docker-compatible runtime | Current supported release        | Local Supabase                  |
| Git                       | Current supported release        | Source control                  |
| k6                        | `2.1.0`                          | `pnpm test:load`                |

Supabase recommends at least 7 GB RAM for the full local stack. Docker Desktop, OrbStack, Rancher Desktop, Podman, or Colima can supply a Docker-compatible API. This project is tested first with Docker Desktop.

### macOS with Homebrew

The pinned Homebrew formula is keg-only:

```bash
/opt/homebrew/bin/brew install node@24 k6
export PATH="/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
corepack enable pnpm
corepack install --global pnpm@11.13.0
```

Persist the `PATH` line in your shell configuration. Start Docker Desktop and wait for `docker info` to succeed.

On other platforms, install the exact Node release from an official distribution or version manager, activate pnpm through Corepack, install k6 from Grafana's official packages, and provide a Docker-compatible daemon.

Verify prerequisites:

```bash
node --version
pnpm --version
docker version
k6 version
```

Expected Node and pnpm output is `v24.18.0` and `11.13.0`.

## Install

```bash
pnpm install --frozen-lockfile
cp .env.example apps/web/.env.local
```

Do not commit `apps/web/.env.local`. Next.js loads environment files from the application workspace, while the root `.env.example` remains the canonical inventory. Exact dependency versions and `pnpm-lock.yaml` are intentional; do not regenerate the lockfile with another pnpm version.

## Local Supabase

Start the Docker daemon first, then:

```bash
pnpm db:start
pnpm db:status
```

The first start downloads the local Supabase images. The status output shows the local API/database URLs and the generated publishable and secret keys. Copy only the local values into `apps/web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key>
SUPABASE_SECRET_KEY=<local secret key>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Do not use a hosted production project's secret key for local work. The configured URLs use
`127.0.0.1`, but Docker Desktop may publish the backing ports on every host interface. Use a
trusted machine/network with the host firewall enabled, and never add port forwarding, a public
tunnel, or public routing for the development stack.

Apply all migrations and the deterministic seed from an empty local state:

```bash
pnpm db:reset
pnpm test:db
pnpm db:types
```

`db:reset` applies the Phase 00 foundation followed by every additive Phase 01 migration through `20260715006900_hosted_grant_parity.sql`, including the school-managed payload hardening, profile-session revocation boundary, and explicit hosted service-role grant parity. `pnpm db:types` writes the generated public database contract; `pnpm db:types:check` verifies that the committed contract matches a fresh local schema.

`db:reset` is intentionally destructive to the local development database only. Never point the local command at a hosted database. Stop services without deleting local volumes using:

```bash
pnpm db:stop
```

The browser and accessibility commands start with the already-running local stack, obtain its URL and generated keys through `supabase status -o env`, and inject them only into the child test process. The wrapper does not print or write those values. Start/reset Supabase before `pnpm test:e2e` or `pnpm test:a11y`.

### Local Auth email testing

The checked-in local configuration enables email/password and magic-link flows but leaves required email confirmation off. Keep these two values aligned:

```toml
# supabase/config.toml
[auth.email]
enable_confirmations = false
```

```env
AUTH_EMAIL_CONFIRMATION_REQUIRED=false
```

To exercise required confirmation locally, set both values to `true`, restart the local stack, and reset it. Supabase CLI captures messages locally instead of delivering them. Open the Mailpit URL reported by `pnpm db:status` (the checked-in default is `http://127.0.0.1:54324`) to follow signup, magic-link, and recovery links. Never expose the local SMTP/Mailpit service to a public network.

The local Auth Site URL is `http://127.0.0.1:3100`, and the checked-in redirect allowlist accepts the local application callback routes. The application handles PKCE/code callbacks at `/auth/callback`, token-hash verification at `/auth/confirm`, and expired links at `/auth/error`. Return destinations are revalidated as same-origin relative paths by the server.

Password/OAuth signup signs the eligible teen/adult decision before starting Auth. When email confirmation or a provider redirect requires a round trip, the pending state is an HttpOnly cookie bound to a callback nonce and to the normalized email subject or configured provider. An immediate password session receives the account-bound onboarding gate directly. A recent new callback identity without matching signed signup state is signed out, rejected through the service-only provisional-account minimization boundary, and denied. Final onboarding receives the account-bound signed cookie and does not accept an age band in its profile request body. The route exchanges that cookie and the exact validated payload for a separate random proof bound to the account, live Auth session, payload digest, and a maximum ten-minute expiry; the authenticated RPC consumes it once. Under-13 selection never starts an independent-account Auth mutation. `APP_ENCRYPTION_KEY` must therefore remain stable across instances during an in-flight signup/onboarding window.

Forgot-password requests use independent signed pending state. Before requesting the email, the server sets an at-most-15-minute SameSite=Lax HttpOnly cookie bound to a callback nonce hash, normalized-email HMAC, and safe return path; the email redirect contains only the random nonce. `/auth/callback` and `/auth/confirm` must match all of that state after Supabase verifies the link before they create the separate account-bound, SameSite=Strict, ten-minute password-update capability. Missing/expired state, a different email subject or nonce, and a query-only `intent=recovery` sign out the recovered session and go to the neutral expired-link surface. Keep `APP_ENCRYPTION_KEY` stable for the complete request/callback/update window.

## Environment variables

`.env.example` is the canonical inventory.

For the exhaustive hosted scope, source, required/optional, and browser/server classification, see
[HOSTED_ENVIRONMENT.md](./HOSTED_ENVIRONMENT.md). Do not infer a hosted variable from a feature
name: session, recovery, CSRF, and worker secrets that the parser does not accept must not be
invented.

| Variable                                  | Visibility    | Local/default guidance                                                                                |
| ----------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_NAME`                    | Public        | Replaceable visible brand; defaults to `Lumen`                                                        |
| `NEXT_PUBLIC_APP_URL`                     | Public        | `http://127.0.0.1:3100` locally; accepted mutation origin; HTTPS required in production               |
| `NEXT_PUBLIC_SUPABASE_URL`                | Public        | Local API URL from `db:status`; HTTPS required in production                                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`    | Public        | Local publishable key only; safety depends on RLS                                                     |
| `SUPABASE_SECRET_KEY`                     | Server secret | Local secret key; provisioning/infrastructure/admin adapters only; never import in client code        |
| `DATABASE_URL`                            | Server secret | Optional direct Postgres connection for local tooling or a future worker; leave absent on Vercel      |
| `DEPLOYMENT_PROFILE`                      | Server config | `local`, `test`, `vercel_beta`, or provisional `cloudflare`                                           |
| `ENABLE_CHILD_PROFILES`                   | Capability    | Keep false except explicit local/test verification; forced false in every production runtime          |
| `ENABLE_PUBLIC_CHILD_CONTENT`             | Capability    | Keep false; Phase 01 creates no public child content; forced false in every production runtime        |
| `ENABLE_FREE_TEXT_GAME_CHAT`              | Capability    | Keep false; no unrestricted chat is implemented; forced false in every production runtime             |
| `PARENTAL_CONSENT_MODE`                   | Server config | `disabled`, local/test-only `test_only`, or nonproduction Cloudflare adapter test `external_verified` |
| `PARENTAL_CONSENT_VERIFIER_URL`           | Server-only   | Required only when exercising `external_verified`; use HTTPS for a production-grade provider          |
| `PARENTAL_CONSENT_VERIFIER_API_KEY`       | Server secret | Required only for `external_verified`; independent value of at least 24 characters                    |
| `AUTH_EMAIL_CONFIRMATION_REQUIRED`        | Server config | Must match the Supabase Auth Confirm Email setting                                                    |
| `AUTH_OAUTH_GOOGLE_ENABLED`               | Server config | Show Google only after the provider is configured and tested                                          |
| `AUTH_OAUTH_GITHUB_ENABLED`               | Server config | Show GitHub only after the provider is configured and tested                                          |
| `AUTH_OAUTH_AZURE_ENABLED`                | Server config | Show Microsoft only after Supabase `azure` is configured and tested                                   |
| `PROFILE_SESSION_TTL_MINUTES`             | Retention     | Default `30`; runtime/DB also cap learner switches at 30 minutes                                      |
| `GUEST_SESSION_RETENTION_HOURS`           | Retention     | Default `24`, valid `1`–`24`; room expiry may shorten it, and purge must be scheduled                 |
| `EXPORT_DOWNLOAD_RETENTION_DAYS`          | Retention     | Default `7`; applies once the later archive worker produces a download                                |
| `DELETION_GRACE_PERIOD_DAYS`              | Retention     | Default `30`; authenticated request RPC validates 1–90 days; due processing remains service-only      |
| `AUDIT_EVENT_RETENTION_DAYS`              | Retention     | Default `365`; requires a reviewed scheduled retention job                                            |
| `RATE_LIMIT_WINDOW_SECONDS`               | Security      | Shared configurable route window; default `900`                                                       |
| `RATE_LIMIT_SIGNUP_ATTEMPTS`              | Security      | Default `5`                                                                                           |
| `RATE_LIMIT_PASSWORD_RESET_ATTEMPTS`      | Security      | Default `5`; also used for magic-link requests                                                        |
| `RATE_LIMIT_PROFILE_PIN_ATTEMPTS`         | Security      | Default `5`; database credential verification has an additional profile-wide limit                    |
| `RATE_LIMIT_GUEST_CREATION_ATTEMPTS`      | Security      | Default `20`; production still requires a real room adapter                                           |
| `RATE_LIMIT_DESTRUCTIVE_REQUEST_ATTEMPTS` | Security      | Default `3`; protects re-authenticated destructive operations                                         |
| `APP_ENCRYPTION_KEY`                      | Server secret | Independent 32+ byte value for signed age/recovery state and pseudonymous rate-limit subjects         |
| `GUEST_TOKEN_SIGNING_KEY`                 | Server secret | Independent 32+ byte value for guest reconnect claims                                                 |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`      | Server secret | Stable 32-byte base64 key shared by all instances                                                     |
| `NEXT_PUBLIC_BUILD_VERSION`               | Public        | Optional commit/release identifier                                                                    |

For non-local environments generate independent keys, for example:

```bash
openssl rand -base64 32
```

Never reuse one value for encryption, guest signing, and Server Actions.

## Hosted Supabase Auth configuration

Environment flags control application behavior and button visibility; they do not configure Supabase or an OAuth provider. Complete and live-test the provider-side work first.

This entire section is owner/operator setup. Provider dashboards, SMTP credentials, OAuth applications, production secrets, redirect changes, identity-linking controls, and production promotion must not be performed from an untrusted pull request or by a contributor without explicit environment authority. Record live verification separately from repository test results.

Email/password, local email capture, magic-link, recovery, conditional provider rendering, and Google/GitHub/Microsoft OAuth adapters are implemented. Custom SMTP, hosted delivery, manual identity linking, and provider applications remain **implemented but not live-verified** until the owner completes the steps below with environment-specific credentials.

### URLs, email, and recovery

1. In Supabase Auth URL Configuration, set the Site URL to the stable HTTPS application origin for the environment. Add only the application's `/auth/callback**` path to the redirect allowlist. Use the minimum documented Vercel Preview wildcard and never point a Preview deployment at production data. Exact current values are in [HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md#supabase-auth-url-configuration).
2. Enable email/password sign-in. Choose whether Confirm Email is required and set `AUTH_EMAIL_CONFIRMATION_REQUIRED` to the same value. The application renders pending-verification state only from that configuration; Supabase remains the enforcement authority.
3. Configure a production SMTP provider and verified sender domain. Supabase's built-in sender is for limited evaluation, not a public beta. Disable provider link tracking that rewrites single-use Auth links.
4. Review signup, magic-link, recovery, email-change, and security-notification templates. The default templates must preserve `{{ .ConfirmationURL }}` because the application supplies its complete stateful `/auth/callback` RedirectTo. Do not replace it with `{{ .SiteURL }}` or append a hard-coded path. A custom token-hash template targeting `/auth/confirm` is a separate provider-gated configuration that requires live testing.
5. Test a new signup, duplicate/unknown-email neutral response, confirmation, magic link, expired link, password reset with the pending nonce/email binding, forged query-only recovery denial, current-device sign-out, one learner-session revocation, and global sign-out in a non-production project.

Current official references: [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), and [password-based Auth](https://supabase.com/docs/guides/auth/passwords).

The current Production contract is Site URL `https://recallflash.com` with
`https://recallflash.com/auth/callback**` plus the temporary, path-limited old Production callback
kept for rollback. Vercel redirects the old host and `www.recallflash.com` to the apex with `308`.
Preview retains its deployment Site URL and restricted Preview callback wildcard, and the local
localhost redirects earlier in this guide remain unchanged. Keep the old Beta callback only until
the rollback window and delivered custom-SMTP Auth-link checks close.

### Optional OAuth providers

Each provider's OAuth application uses the **Supabase Auth callback**, not the Next.js callback, as its provider redirect URI:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Supabase then redirects the PKCE/code flow to the allowlisted application `/auth/callback` route.

| UI label  | Supabase provider | Provider setup                                                                                                                             | Application flag                 |
| --------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Google    | `google`          | Web OAuth client; add the app HTTPS origin and the Supabase Auth callback; configure only the minimum `openid`, email, and profile scopes  | `AUTH_OAUTH_GOOGLE_ENABLED=true` |
| GitHub    | `github`          | GitHub OAuth App with the Supabase Auth callback; store client ID/secret in Supabase                                                       | `AUTH_OAUTH_GITHUB_ENABLED=true` |
| Microsoft | `azure`           | Microsoft Entra web app with the Supabase Auth callback, reviewed tenant/account types, verified email claim, and the required email scope | `AUTH_OAUTH_AZURE_ENABLED=true`  |

The application explicitly requests the `email` scope for Microsoft (`azure`) sign-in and linking. Enable manual identity linking in Supabase Auth before exposing the connected-providers action. Automatic linking must continue to rely only on provider-verified email behavior. Provider secrets belong in Supabase/provider secret settings, never `.env.example` or browser flags.

Current official references: [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [GitHub](https://supabase.com/docs/guides/auth/social-login/auth-github), [Azure/Microsoft](https://supabase.com/docs/guides/auth/social-login/auth-azure), and [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

## Guardian-managed learner configuration

The default and every production deployment, including Vercel and Cloudflare/OpenNext, must resolve to:

```env
ENABLE_CHILD_PROFILES=false
ENABLE_PUBLIC_CHILD_CONTENT=false
PARENTAL_CONSENT_MODE=disabled
```

The environment parser enforces this for every `NODE_ENV=production` runtime. `DEPLOYMENT_PROFILE=vercel_beta` and the provider-owned `VERCEL=1` marker are additional hard stops. Flags or verifier credentials cannot override the universal production gate.

To exercise the complete child/guardian boundaries locally or in an isolated test runtime only:

```env
DEPLOYMENT_PROFILE=local
ENABLE_CHILD_PROFILES=true
ENABLE_PUBLIC_CHILD_CONTENT=false
PARENTAL_CONSENT_MODE=test_only
```

The resulting consent evidence is labelled `local_test`. It is not verifiable parental consent and must never be copied to preview/production as proof. Local/database tests exercise creation, consent, credential setup, managed switching/isolation, current-device sign-out, guardian exit, revocation, and strict payload denial without enabling those paths in production.

The external-verifier adapter may be exercised only in a **nonproduction** Cloudflare-shaped environment with `DEPLOYMENT_PROFILE=cloudflare`, child profiles enabled, and both server-only verifier values configured:

```env
PARENTAL_CONSENT_VERIFIER_URL=https://reviewed-provider.example/verify
PARENTAL_CONSENT_VERIFIER_API_KEY=<independent-provider-credential>
```

The checked-in adapter sends a bearer-authenticated JSON request containing `learnerAgeBand`, `policyVersion: "privacy-2026-07-phase-01"`, `requestedScopes: ["learner_profile"]`, and a server-HMACed `subjectHash`. It does not send the account email. The provider must return an affirmative bounded response such as:

```json
{
  "verified": true,
  "evidenceReference": "provider-evidence-123"
}
```

The request times out after eight seconds, responses larger than 8 KiB are rejected, evidence references must be 8–256 characters after trimming, production-grade verifier URLs must be HTTPS, and every failure path denies learner creation. The adapter is implemented but not live-verified without owner provider credentials. A successful response still cannot activate a production child profile.

After verifier success in local/test, the route validates a closed privacy-safe child payload, generates an independent random proof, and asks the strict service wrapper to bind its digest and canonical payload digest to the guardian's exact live Auth session for no more than ten minutes. The authenticated child-creation RPC consumes it once. The service wrapper rejects missing/JSON-null/mistyped/extra settings, non-minimized consent scope, malformed evidence, expired proof state, or managed guardian context; the lower-level child issuer/creator is not service-callable. Learner updates accept only explicit appearance/name fields and reconstruct mandatory minimized settings server-side.

Production re-enablement first requires an independent opaque backend-for-frontend identity so a child-facing browser never receives or retains guardian Supabase access/refresh credentials. The identity must be learner/device/session scoped, short-lived, revocable, and enforced by every downstream boundary. The owner must then also review the provider/data contract, live-test consent, test revocation/export/deletion/retention, and complete every legal/provider launch gate. Until a superseding architecture decision lands, do not attempt to set production consent mode to `external_verified`.

Consent-provider credentials are owner-only integration inputs. Any future production decision to move from `disabled` to `external_verified` requires the opaque identity prerequisite and a superseding architecture decision; it is not a current deployment option. Do not place verifier values in a pull request, fixture, client bundle, browser-visible capability projection, or deployment log.

## School-managed learner authorization

The `teach` capability alone cannot create a school-managed learner. No Phase 01 public UI or generic teacher route issues school authority. A future owner-reviewed server integration must first validate the school's/provider's evidence outside Postgres, create independent opaque proof and evidence-reference digests, and call service-only `admin_issue_school_authorization()`. The proof must expire within 15 minutes. The same trusted integration may then call `admin_create_school_managed_learner()` once with the matching actor, owner, proof digest, stable idempotency key, `under_13` or `teen` age band, and the complete closed settings object.

The school settings object must contain exactly `analytics`, `public_content`, `reading_style`, `reduced_motion`, `serious_mode`, `social_interactions`, and `theme`. Analytics is fixed to `essential_only`; public content and social interactions are fixed false; reading style is `standard` or `increased_spacing`; theme is `system`, `light`, or `dark`; and the motion/serious values are JSON booleans. Missing keys, JSON null, wrong types, extra keys, unsafe values, and `adult`/`unknown` age bands fail before proof consumption. The database reconstructs the persisted object from validated scalars.

Raw school evidence, provider bearer credentials, and the raw proof must never be stored in database rows, audit metadata, client state, or logs. Issuance and consumption are separate, actor/owner-bound operations; expiry, mismatch, reuse, or a plain `teach` claim is denied. Provider selection, credentials, evidence policy, and live verification are owner-only future integration work, not a Phase 01 environment flag.

## Deletion worker operation

Phase 01 implements the service-only `admin_process_account_deletion(deletion_job_id, idempotency_key)` transaction, but does not install a scheduler. An owner-operated background worker must:

1. select only queued jobs whose `execute_after` deadline has elapsed;
2. call the RPC through a server-held service credential with a stable completion idempotency key;
3. retry the same operation with the same key, and treat a different-key completed job as an operator conflict;
4. monitor and alert on stuck/failed jobs without logging account content, credentials, or proof values; and
5. update the reviewed deletion matrix whenever a later phase adds a data-owning table.

The transaction removes the Supabase Auth principal and secret/session material, revokes access and active evidence, minimizes mutable account/learner fields, and retains opaque tombstone identities required by append-only consent and audit records. It does not assemble an export archive, and a queued job is not a completed deletion. Configure the schedule and service credential only in an owner-controlled worker environment.

## Run the web application

```bash
pnpm dev
```

The default application URL is `http://127.0.0.1:3100`. Implemented Phase 01 surfaces include:

- `/` — public landing page;
- `/privacy`, `/terms`, `/safety`, `/copyright` — public information surfaces;
- `/join` and `/join/[code]` — guest-admission shell backed by an intentionally empty production room adapter;
- `/api/health` — non-sensitive runtime/build health;
- `/auth/sign-up`, `/auth/sign-in`, `/auth/magic-link`, `/auth/forgot-password`, and callback/error routes — real Supabase Auth flows;
- `/onboarding` — minimum-data adult/teen onboarding with a neutral guardian-required under-13 outcome;
- `/app` — server-protected account workspace;
- `/app/settings/*` — profile, security, connected-provider, device, learner, guardian, and privacy/job state;
- `/dev/design-system` — developer component gallery, marked against production indexing.

No fixture room is joinable in a deployed build, and the dashboard contains no synthetic study progress. Study/deck functionality begins in its owning phase.

The shared public header resolves a server-only viewer projection. Verified accounts see the workspace action; visitors receive sign-in/sign-up links whose `returnTo` preserves only the current canonical public route family and query. The resolver rejects external origins, API/auth/account paths, traversal, and encoded navigation hazards and treats an Auth outage as an anonymous public shell. `/join/[code]` uses the same context so account creation can return to that room-code page without making the public viewer an authorization boundary.

The protected shell resolves appearance from the active learner on the server. Self mode hydrates the account theme/motion/serious-mode fields; managed mode hydrates only learner settings and defaults missing values to reduced motion plus serious mode. This projection overwrites stale local browser preferences, and the profile form synchronizes it immediately after a successful save.

Runtime authentication-profile lookup and application-device registration are intentionally RPC-only. Device registration verifies the exact live Supabase Auth session and returns the canonical application device; do not add service-role table reads as a shortcut. “Sign out this device” revokes only the current JWT-bound device/profile sessions and remains available in managed mode. “Sign out all devices” is a separate self-context action that requires the guardian/account password, consumes a fresh `security_change` proof, and then revokes every application device before global Supabase sign-out.

The devices page also lists active learner-profile sessions per device. “Revoke session” verifies the current password, requires self context, consumes a fresh single-use `security_change` proof, and revokes only the selected account-owned profile session; it does not revoke that device or unrelated sessions. A successful learner switch best-effort clears current namespaced learner/private local storage, session storage, and Cache Storage, dispatches `lumen:identity-boundary`, and always replaces the document at `/app` even if browser cleanup is unavailable.

## Generate database types

With local Supabase running and migrations applied:

```bash
pnpm db:types
```

Commit generated output when the owning migration changes it. Never hand-edit generated database types.

## Validation commands

```bash
pnpm format:check
pnpm secret:scan
pnpm lint
pnpm typecheck
pnpm test
pnpm db:reset
pnpm test:db
pnpm db:types:check
pnpm build
pnpm build:portable
pnpm test:e2e
pnpm test:a11y
pnpm test:lighthouse
pnpm test:load
pnpm verify
```

Browser tests install their pinned browser once per machine:

```bash
pnpm exec playwright install chromium
```

`pnpm test:load` starts the web app and executes a real k6 health check. `pnpm verify` therefore requires Docker/Supabase and k6 in addition to Node dependencies.

`pnpm build` and provider builds validate real production configuration and fail before compiling
when a required value is absent or malformed. `pnpm build:verify`, `pnpm test:lighthouse`, and
`pnpm verify` inject a fixed set of visibly inert values for deterministic checks; they do not
write an environment file and are not a deployment configuration.

See [TESTING.md](./TESTING.md) for scope and failure artifacts.

## Deployment setup summary

### Vercel preview/beta

- use exactly one web project with Root Directory `apps/web` and framework preset Next.js;
- select Node `24.x` and use the repository-pinned pnpm `11.13.0`;
- install with `cd ../.. && pnpm install --frozen-lockfile`;
- build with `cd ../.. && pnpm exec turbo run build --filter=@lumen/web` and use the default `.next` output;
- set all required environment variables separately for preview and production;
- omit `NEXT_PUBLIC_APP_URL` in Preview and set it to `https://recallflash.com` in Production;
- use `DEPLOYMENT_PROFILE=vercel_beta` and keep all child/chat flags false;
- set `PARENTAL_CONSENT_MODE=disabled` even if child code is present;
- configure and live-test Auth redirects, SMTP/email confirmation, and each enabled OAuth provider before setting its application flag.

The one-time Phase 01 hosted bootstrap and the authorized custom-domain finalization created the
current project, databases, scoped secrets, and canonical `https://recallflash.com` Production
origin. Future database promotion, provider configuration, secret changes, worker assignment,
domain changes, and production promotion must use the guarded workflow in
[HOSTED_OPERATIONS.md](./HOSTED_OPERATIONS.md); an ordinary feature pull request must not deploy
itself.

### Portable host

`pnpm build:portable` validates the provisional OpenNext/Cloudflare output. Preview/deploy requires a Cloudflare account and explicit owner action; the adapter is not live-verified merely because the build succeeds. Production child flags and consent mode remain forced off on this host as well. See [DEPLOYMENT.md](./DEPLOYMENT.md).

## Cost profile

Local development, the test stack, and the core application do not require paid credentials. Managed Supabase, Vercel, Cloudflare, monitoring, analytics, email, and AI services are optional/provider-bound and remain disabled until configured and reviewed. Core study must remain usable without paid AI.

## Common recovery

### `node` or `pnpm` is not found

Confirm the keg-only Node directory and Homebrew paths precede system paths:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
corepack enable pnpm
```

### Docker daemon is unavailable

Start the Docker-compatible runtime and wait for `docker info`. A Docker CLI binary alone is insufficient.

### Supabase reports occupied ports or stale containers

Check `pnpm db:status` and other local Supabase projects. Stop this project with `pnpm db:stop`, then start it again. Do not use global destructive Docker cleanup commands.

### Migration or generated types disagree

Save intended schema changes as a new migration, run `pnpm db:reset`, then `pnpm db:types`. Never edit an already applied migration to make the test pass.

### Playwright cannot find Chromium

```bash
pnpm exec playwright install chromium
```

On Linux CI use `pnpm exec playwright install --with-deps chromium`.

### A clean install changes the lockfile

Confirm Node `24.18.0`, pnpm `11.13.0`, and a clean checkout. `pnpm install --frozen-lockfile` should never modify it.

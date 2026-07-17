# Hosted environment contract

This is the secret-free environment inventory for the Phase 02 application and hosted deployment. It maps the
variables accepted by the application, repository tools, Vercel, and the local Supabase helper.
The runtime parsers remain authoritative; `.env.example` is the copyable local template. Do not
put real values in either file.

Phase 02 adds two optional worker-only numeric bounds and no provider credential. Image/audio size,
per-account media quota, private-bucket name, allowed MIME set, and the seven-day logical-deletion
interval remain enforced in application/migration code. Do not add ad hoc Vercel variables such as
`MAX_MEDIA_BYTES` unless a later change first adds the parser, public template,
database/application enforcement, tests, and this inventory. The physical-cleanup worker reuses
the existing server-held Supabase credential; it does not introduce a media-specific secret.

In the tables below, **required** means that a production build or runtime fails closed when the
value is absent. **Optional** means that absence is an accepted state. A provider-managed value is
created by that provider rather than generated or copied by an operator.

## Hosted scope assignment

Use one Vercel project for `apps/web`, with separate Preview and Production environment scopes.
The Preview scope uses Supabase project `cfwddajyjbueggpzfomh`; the Production beta scope uses
Supabase project `qccbaynfvtyxigiikpmq`.

- Vercel Preview must omit `NEXT_PUBLIC_APP_URL`. When `VERCEL=1`, `VERCEL_ENV=preview`, and a
  valid `VERCEL_URL` are present, the application derives the exact deployment origin as
  `https://<deployment>.vercel.app`. An explicitly configured `NEXT_PUBLIC_APP_URL` takes
  precedence, so do not set a shared production origin in the Preview scope.
- Vercel Production sets `NEXT_PUBLIC_APP_URL` to `https://recallflash.com`. The variable is
  Production-scoped only; `www.recallflash.com` and the retired stable `vercel.app` alias redirect
  to that apex origin with status `308` and are not additional application origins.
- Both scopes use `DEPLOYMENT_PROFILE=vercel_beta`. That profile and Vercel Preview both emit
  no-index behavior. There is no separate search-indexing environment variable.
- Preview and Production must use their own Supabase URL, publishable key, and server secret key.
- Generate new `APP_ENCRYPTION_KEY`, `GUEST_TOKEN_SIGNING_KEY`, and
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` values for each scope. The three values must also be
  distinct within a scope.
- Leave `DATABASE_URL`, worker-only media-deletion bounds, parental-consent verifier settings,
  OAuth credentials, custom SMTP, analytics, monitoring, and cloud-AI settings absent from the
  Vercel web project for this bootstrap. A separately deployed worker receives only its own
  environment's Supabase URL/secret and optional bounds.

## Browser-safe application variables

These are the only accepted variables whose names begin with `NEXT_PUBLIC_`. Their values may be
included in browser bundles and must never contain credentials or private data.

| Exact name                             | Category and scopes                       | Requirement and safe default                                                                          | Purpose                                                                                | Source and value type                              | Preview versus Production                                             |
| -------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_NAME`                 | Local; Vercel Preview; Vercel Production  | Optional; defaults to centralized brand name `Lumen`; 1-80 characters                                 | Visible application name                                                               | Operator-owned, non-secret configuration           | Normally the same                                                     |
| `NEXT_PUBLIC_APP_URL`                  | Local; Vercel Preview; Vercel Production  | Local defaults to `http://127.0.0.1:3100`; Preview omits it and derives it; Production requires HTTPS | Canonical origin for redirects, callback construction, and same-origin mutation checks | Operator/provider domain, non-secret configuration | Omitted in Preview; stable HTTPS origin in Production                 |
| `NEXT_PUBLIC_SUPABASE_URL`             | Local; Vercel Preview; Vercel Production  | Required in production and must use HTTPS; local helper obtains the local API URL                     | Browser and server Supabase API origin                                                 | Supabase project API settings, provider-issued     | Must differ because each scope uses a separate Supabase project       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Local; Vercel Preview; Vercel Production  | Required in production; local helper obtains the local publishable or legacy anonymous key            | Browser-safe Supabase client authorization subject to RLS                              | Supabase project API settings, provider-issued     | Must differ because each scope uses a separate Supabase project       |
| `NEXT_PUBLIC_BUILD_VERSION`            | Local; optional Vercel Preview/Production | Optional; health version falls back to `VERCEL_GIT_COMMIT_SHA`, then `development`                    | Non-secret build identity returned by `/api/health`                                    | Build pipeline, generated metadata                 | May differ per deployment; normally omit on Vercel and use commit SHA |

## Server-only credentials and provider integrations

Store hosted credentials only in the corresponding Vercel encrypted/sensitive environment scope.
None of these values is browser-safe.

| Exact name                           | Category and scopes                                        | Requirement and safe disabled/default state                                                             | Purpose                                                                                          | Source and value type                                  | Preview versus Production                        |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------ |
| `SUPABASE_SECRET_KEY`                | Local; Vercel Preview; Vercel Production; Supabase project | Required in production; at least 24 characters                                                          | Privileged server-side Supabase operations                                                       | Supabase project API settings, provider-issued secret  | Must be project-specific and therefore different |
| `DATABASE_URL`                       | Local development; future direct-Postgres worker/tool only | Optional in all environments; local parser has a local default; safe hosted state is absent             | Direct PostgreSQL connection for tooling or a future worker; the web app uses Supabase HTTP APIs | Local Supabase CLI or future database provider, secret | Leave absent in both hosted scopes               |
| `APP_ENCRYPTION_KEY`                 | Local; Vercel Preview; Vercel Production                   | Required in production; at least 32 characters; no hosted default                                       | Signs recovery/age-gate state and keys pseudonymous request hashes                               | Application-owned, cryptographically generated secret  | Generate independently for each scope            |
| `GUEST_TOKEN_SIGNING_KEY`            | Local; Vercel Preview; Vercel Production                   | Required in production; at least 32 characters; no hosted default                                       | Signs guest reconnect tokens                                                                     | Application-owned, cryptographically generated secret  | Generate independently for each scope            |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Local; Vercel Preview; Vercel Production                   | Required in production; exactly 32 random bytes encoded as 43 base64 characters plus `=`                | Stable Next.js Server Action encryption across deployment instances                              | Application-owned, cryptographically generated secret  | Generate independently for each scope            |
| `PARENTAL_CONSENT_VERIFIER_API_KEY`  | Optional parental-consent provider; server only            | Required only with `PARENTAL_CONSENT_MODE=external_verified`; safe state is absent                      | Authenticates an external consent-verification request                                           | Consent provider, provider-issued secret               | Absent in both Vercel scopes                     |
| `PARENTAL_CONSENT_VERIFIER_URL`      | Optional parental-consent provider; server only            | Required only with `PARENTAL_CONSENT_MODE=external_verified`; HTTPS in production; safe state is absent | External consent-verification endpoint                                                           | Consent provider, provider-issued non-secret URL       | Absent in both Vercel scopes                     |

`external_verified` consent is currently accepted only for nonproduction, Cloudflare-shaped adapter
tests with managed profiles enabled. Production and Vercel safety gates force managed profiles and
parental consent off, so the verifier variables must not be configured for this deployment.

## Server-only behavior and safety configuration

These variables are configuration rather than credentials, but they remain server-only. Client
flags never authorize a mutation.

| Exact name                         | Category and scopes                     | Requirement, accepted values, and safe default                                                    | Purpose                                                             | Source and value type                      | Preview versus Production                                    |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| `DEPLOYMENT_PROFILE`               | Local; tests; Vercel Preview/Production | Required in production; `local`, `test`, `vercel_beta`, or `cloudflare`                           | Chooses provider behavior and safety gates                          | Operator-owned configuration               | `vercel_beta` in both hosted scopes                          |
| `AUTH_EMAIL_CONFIRMATION_REQUIRED` | Local; Vercel Preview/Production        | Optional boolean (`true`, `false`, `1`, `0`); defaults to `false`                                 | Makes the UI follow the Supabase Confirm email setting              | Operator-owned Supabase Auth configuration | Usually the same; each value must match its Supabase project |
| `AUTH_OAUTH_GOOGLE_ENABLED`        | Optional OAuth provider                 | Optional boolean; safe disabled default is `false`                                                | Shows Google OAuth actions only after provider setup                | Operator-owned feature flag                | `false` in both hosted scopes for this bootstrap             |
| `AUTH_OAUTH_GITHUB_ENABLED`        | Optional OAuth provider                 | Optional boolean; safe disabled default is `false`                                                | Shows GitHub OAuth actions only after provider setup                | Operator-owned feature flag                | `false` in both hosted scopes for this bootstrap             |
| `AUTH_OAUTH_AZURE_ENABLED`         | Optional OAuth provider                 | Optional boolean; safe disabled default is `false`                                                | Shows Microsoft OAuth actions; Supabase names this provider `azure` | Operator-owned feature flag                | `false` in both hosted scopes for this bootstrap             |
| `ENABLE_CHILD_PROFILES`            | Local/test; Vercel Preview/Production   | Optional boolean; safe disabled default is `false`; forced off in production/Vercel               | Requests managed-child profiles before server safety gating         | Operator-owned safety control              | `false` in both hosted scopes                                |
| `ENABLE_PUBLIC_CHILD_CONTENT`      | Local/test; Vercel Preview/Production   | Optional boolean; safe disabled default is `false`; ineffective unless child profiles are allowed | Requests independent child public publishing                        | Operator-owned safety control              | `false` in both hosted scopes                                |
| `ENABLE_FREE_TEXT_GAME_CHAT`       | Local/test; Vercel Preview/Production   | Optional boolean; safe disabled default is `false`; forced off on Vercel/production               | Requests unrestricted free-text game chat                           | Operator-owned safety control              | `false` in both hosted scopes                                |
| `PARENTAL_CONSENT_MODE`            | Local/test; optional consent provider   | Optional; `disabled`, `test_only`, or `external_verified`; defaults to `disabled`                 | Selects the managed-profile consent adapter                         | Operator-owned safety control              | `disabled` in both hosted scopes                             |
| `MEDIA_DELETION_BATCH_SIZE`        | Optional content-media worker only      | Optional integer `1..100`; defaults to `25`                                                       | Bounds assets claimed by one worker invocation                      | Operator-owned worker control              | Absent from Vercel web; configure per worker environment     |
| `MEDIA_DELETION_LEASE_SECONDS`     | Optional content-media worker only      | Optional integer `30..900`; defaults to `300`                                                     | Bounds a physical-deletion claim before crash recovery              | Operator-owned worker control              | Absent from Vercel web; configure per worker environment     |

Production parsing forces child profiles, public child content, free-text game chat, and parental
consent off even if an unsafe value is requested. Configure the explicit disabled values anyway so
the intended hosted policy is auditable.

## Retention and rate-limit configuration

All variables in this section are optional, server-only operator configuration. They may use the
same policy values in Preview and Production, but must be configured separately if either scope
overrides a default.

| Exact name                                | Category                     | Purpose                                 | Default |   Accepted range |
| ----------------------------------------- | ---------------------------- | --------------------------------------- | ------: | ---------------: |
| `AUDIT_EVENT_RETENTION_DAYS`              | Privacy/monitoring retention | Audit-event retention                   |     365 |     30-3650 days |
| `DELETION_GRACE_PERIOD_DAYS`              | Privacy retention            | Account-deletion grace period           |      30 |        1-90 days |
| `EXPORT_DOWNLOAD_RETENTION_DAYS`          | Privacy retention            | Export download expiry                  |       7 |        1-30 days |
| `GUEST_SESSION_RETENTION_HOURS`           | Privacy retention            | Guest-session expiry                    |      24 |       1-24 hours |
| `PROFILE_SESSION_TTL_MINUTES`             | Session policy               | Managed-profile session lifetime        |      30 |     5-30 minutes |
| `RATE_LIMIT_WINDOW_SECONDS`               | Abuse prevention             | Shared fixed-window duration            |     900 | 30-86400 seconds |
| `RATE_LIMIT_SIGNUP_ATTEMPTS`              | Abuse prevention             | Sign-up attempts per window             |       5 |            1-100 |
| `RATE_LIMIT_PASSWORD_RESET_ATTEMPTS`      | Abuse prevention             | Password-recovery attempts per window   |       5 |            1-100 |
| `RATE_LIMIT_PROFILE_PIN_ATTEMPTS`         | Abuse prevention             | Managed-profile PIN attempts per window |       5 |            1-100 |
| `RATE_LIMIT_GUEST_CREATION_ATTEMPTS`      | Abuse prevention             | Guest creation attempts per window      |      20 |           1-1000 |
| `RATE_LIMIT_DESTRUCTIVE_REQUEST_ATTEMPTS` | Abuse prevention             | Destructive-account requests per window |       3 |            1-100 |

The safe state for this bootstrap is to use these bounded defaults. Retention values are policy,
not analytics-provider settings; no external analytics or monitoring provider is configured.

## Provider-managed runtime variables

Do not copy these values between deployments or place them in `.env.local`. Vercel and Next.js
manage them.

| Exact name              | Category and scopes              | Requirement/default                                              | Exposure                       | Purpose and source                                                                 | Preview versus Production            |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------ |
| `NODE_ENV`              | Next.js local/test/build/runtime | Provider/tool-managed; parser treats other values as development | Server runtime control         | Selects development, test, or production validation; Next.js owns it               | `production` for both hosted scopes  |
| `VERCEL`                | Vercel Preview/Production        | Provider-managed; absent locally                                 | Server-only non-secret         | Value `1` identifies a Vercel runtime and activates safety gating                  | Present in both hosted scopes        |
| `VERCEL_ENV`            | Vercel Preview/Production        | Provider-managed; absent locally                                 | Server-only non-secret         | Identifies Preview versus Production and enables Preview no-index/origin behavior  | Different by deployment scope        |
| `VERCEL_URL`            | Vercel Preview/Production        | Provider-managed; required for derived Preview origin            | Server input, non-secret       | Deployment hostname; Preview derivation accepts only a bare `.vercel.app` hostname | Unique for each deployment           |
| `VERCEL_GIT_COMMIT_SHA` | Vercel Preview/Production        | Optional provider metadata; health falls back to `development`   | Server input exposed by health | Commit identity used when `NEXT_PUBLIC_BUILD_VERSION` is absent                    | Normally differs per deployed commit |

Vercel system environment variables must be available to the build. They are provider metadata,
not application secrets and not manually generated environment values.

## Local, CI, and operator tool variables

These variables do not belong in the Vercel application environment. Hosted URLs are non-secret,
but keeping them as transient shell values avoids stale deployment targets.

| Exact name                        | Category                          | Requirement/default                                                                                       | Exposure                 | Purpose and source                                                            | Preview versus Production                         |
| --------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `PLAYWRIGHT_BASE_URL`             | Local E2E/a11y; hosted smoke tool | Local tests default to `http://127.0.0.1:3100`; hosted config requires a non-local HTTPS origin           | Test-process only        | Playwright target, operator/tool supplied                                     | Runner sets it to the selected hosted target      |
| `HOSTED_PREVIEW_URL`              | Hosted smoke operator input       | Optional if `--url` is passed; otherwise required by Preview runner                                       | Test-process only        | Preview deployment origin, operator/Vercel output                             | Preview only                                      |
| `HOSTED_PRODUCTION_URL`           | Hosted smoke operator input       | Optional if `--url` is passed; otherwise required by Production runner                                    | Test-process only        | Stable Production deployment origin, operator/Vercel output                   | Production only                                   |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Hosted bypass equality override   | Optional; when supplied, it must equal the runner-discovered existing project token                       | Test-process secret      | Optional approved-store check against Vercel's one existing Automation Bypass | Never creates, rotates, or replaces project state |
| `VERCEL_TOKEN`                    | Hosted ownership API credential   | Required for every guarded hosted run in noninteractive CI; a fresh local CLI OAuth token is the fallback | Operator/CI tool secret  | Authenticates deployment ownership and the read-only project bypass inventory | Never inherited by the Playwright child           |
| `VERCEL_PROJECT_ID`               | Hosted ownership link fallback    | Required with `VERCEL_ORG_ID` only when ignored `.vercel/project.json` is unavailable                     | Tool input, non-secret   | Standard Vercel CI project link                                               | Same project for both application targets         |
| `VERCEL_ORG_ID`                   | Hosted ownership link fallback    | Required with `VERCEL_PROJECT_ID` only when ignored `.vercel/project.json` is unavailable                 | Tool input, non-secret   | Standard Vercel CI team/account link                                          | Same owner for both application targets           |
| `BASE_URL`                        | Local k6 load test                | Optional; defaults to `http://127.0.0.1:3100`                                                             | Test-process only        | k6 target, operator supplied                                                  | Not a Vercel variable                             |
| `CI`                              | GitHub Actions/test tools         | Optional locally; workflow sets `true`                                                                    | Tool control, non-secret | Enables CI reporters, retries, and `forbidOnly`                               | Not a Vercel application variable                 |
| `ANALYZE`                         | Local build analysis              | Optional; bundle analyzer is enabled only by exact value `true`                                           | Build-process only       | Operator-owned diagnostic switch                                              | Leave absent in both Vercel scopes                |
| `CHROME_PATH`                     | Lighthouse CI tool                | Supplied inline by CI when Lighthouse runs                                                                | Tool path, non-secret    | Points Lighthouse to the installed Playwright Chromium executable             | Not a Vercel variable                             |
| `NEXT_TELEMETRY_DISABLED`         | Local/CI Next.js tool             | Optional; CI sets `1`                                                                                     | Tool control, non-secret | Disables Next.js telemetry                                                    | Not a Vercel application variable                 |
| `SUPABASE_TELEMETRY_DISABLED`     | Local/CI Supabase CLI             | Optional; CI sets `true`                                                                                  | Tool control, non-secret | Disables Supabase CLI telemetry                                               | Not a Vercel application variable                 |
| `NO_COLOR`                        | Hosted database operator tool     | Internally forced to `1` by the hosted database runner                                                    | Tool control, non-secret | Keeps CLI output deterministic                                                | Same for Preview and Beta database commands       |

The baseline hosted smoke runner internally sets `HOSTED_SMOKE_TARGET` plus the path-only
`HOSTED_SMOKE_PREFLIGHT_FILE` after its checks. They are not operator configuration variables. The
credential-bearing attestation is written in a fresh mode-`0700` temporary directory to a
mode-`0600` regular file, never to an environment value. Because Playwright can evaluate its
configuration in more than one process, each evaluation opens the same ephemeral file with
no-follow, inode, ownership, size, and permission checks. The guarded parent destroys it only after
the complete Playwright process tree exits. The attestation is issued
only after the authenticated Vercel API returns the exact linked project, team/account, deployment
URL or alias, readiness, and Preview/Production target, then a read-only project lookup returns
exactly one existing `automation-bypass` entry.

### Guarded Preview content-runner process values

`pnpm test:hosted:preview:content` is an operator tool, not an application runtime. It generates a
UUIDv4 run ID and retrieves the exact Preview project's server key through the operator's
authenticated Supabase CLI. The key remains in the parent process, which creates and confirms only
the exact reserved fixture through Admin Auth and writes a nonsecret completion marker. This keeps
the disposable proof independent of provider SMTP while the browser still traverses the public
signup/check-email/sign-in/onboarding flow. The Playwright child receives only:

| Exact name                         | Source and lifetime                                       | Purpose                                                   |
| ---------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `HOSTED_ACCEPTANCE_RUN_ID`         | Runner-generated; one disposable acceptance run           | Names/marks the exact fixture and cleanup target          |
| `HOSTED_CONTENT_PREFLIGHT_FILE`    | Path to an ephemeral mode-`0600` file in the sterile root | Prevents direct raw Playwright invocation after preflight |
| `HOSTED_FIXTURE_CONFIRMATION_FILE` | Nonsecret marker in the child's private temporary sandbox | Proves parent-only fixture provisioning completed         |
| `PLAYWRIGHT_BASE_URL`              | Validated exact Vercel Preview origin                     | Targets the application under review                      |

Operators supply the exact Preview URL and fresh Vercel authentication. They may additionally load
the already-configured bypass from an approved transient source as an equality check; absence does
not skip the project lookup. They must not set, persist, or copy the runner's Supabase secret or
internal file paths. Before any target request, the runner uses the fixed Vercel API origin and an
operator access token to require the exact linked project/team, deployment URL or alias, ready
state, and Preview target. A second authenticated, read-only project GET must return exactly one
existing automation bypass. Only then may the target health request carry that bypass and request
Vercel's host-only, secure, HttpOnly, SameSite=Lax `_vercel_jwt`. The runner
follows the same-origin health redirect using only that cookie and requires Vercel Preview plus the
exact public Preview Supabase project reference. Both the Vercel API token and long-lived bypass
secret are absent from the Playwright child. The credential-bearing cookie attestation crosses only
through a private mode-`0600` file inside the sterile runtime; configurations open it with
no-follow/inode checks, only its non-secret locator is inherited, and the parent deletes it after
the Playwright process tree exits. The child's exact environment allowlist replaces `HOME`, `USERPROFILE`,
`APPDATA`, `LOCALAPPDATA`, every XDG directory, and temporary directories with an empty mode-`0700`
sandbox, so operator Vercel, Supabase, npm, cloud, SSH, database, and provider credential locators
are not inherited. The parent-only Supabase key provisions the exact fixture and never reaches a
worker. The runner disables trace/video and never prints captured credentials. Normal test failure
and the first graceful `SIGINT`/`SIGTERM` trigger one serialized cleanup attempt; a failed cleanup,
`SIGKILL`, or host/process loss still requires operator inspection before another run.

## Local Supabase CLI output aliases

`scripts/local-supabase-environment.mjs` captures `supabase status -o env` and maps these tool
output labels into the application contract. These labels are local development only and must not
be added to Vercel.

| Supabase CLI output name           | Required/default      | Exposure                       | Mapped application variable            | Preview/Production use |
| ---------------------------------- | --------------------- | ------------------------------ | -------------------------------------- | ---------------------- |
| `API_URL`                          | Required local output | Browser-safe local URL         | `NEXT_PUBLIC_SUPABASE_URL`             | None                   |
| `PUBLISHABLE_KEY` or `ANON_KEY`    | Required local output | Browser-safe local key         | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | None                   |
| `SECRET_KEY` or `SERVICE_ROLE_KEY` | Required local output | Server-only local credential   | `SUPABASE_SECRET_KEY`                  | None                   |
| `DB_URL`                           | Required local output | Server-only local database URL | `DATABASE_URL`                         | None                   |

The helper consumes those values in memory for local verification. `apps/web/.env.local` remains
the ignored, untracked location for interactive local development and must never be copied into a
hosted environment.

## Supabase and optional provider configuration without application variables

Some hosted settings are provider configuration, not environment variables read by this
repository:

- Supabase Auth Site URL, additional redirect URLs, email-confirmation behavior, email templates,
  and custom SMTP are configured independently in each Supabase project.
- Beta Auth uses Site URL `https://recallflash.com`. Its allowlist contains
  `https://recallflash.com/auth/callback**` plus the temporary, path-limited
  `https://cogniflow-pearl.vercel.app/auth/callback**` rollback entry. Preview retains its existing
  deployment-specific Site URL and restricted callback wildcard; local callbacks remain only in
  `supabase/config.toml`.
- Google, GitHub, and Microsoft OAuth client IDs and secrets live in Supabase Auth and the OAuth
  provider. The three `AUTH_OAUTH_*_ENABLED` flags only control application affordances. Keep the
  flags false and the providers disabled until valid credentials and callbacks are configured.
- The application accepts no SMTP API key, email-provider API key, analytics credential,
  monitoring credential, or cloud-AI credential variable in Phase 01/02. Absence is the disabled
  state.
- Hosted migration commands use the authenticated local Supabase CLI and never read a database
  password or access token from repository configuration. Vercel deployment commands use the
  authenticated local Vercel CLI. Neither credential is tracked.
- Current GitHub Actions verification uses local Supabase plus visibly inert verification values.
  No GitHub Actions secret is required for hosted database promotion or hosted deployment. Do not
  add hosted project credentials to CI unless a later reviewed workflow defines and consumes an
  explicit secret contract.

## Variables that must never be public

The complete browser-safe allow-list is:

- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BUILD_VERSION`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Every other variable in this document must retain its exact non-public name. In particular, never
create a `NEXT_PUBLIC_` form of `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `APP_ENCRYPTION_KEY`,
`GUEST_TOKEN_SIGNING_KEY`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`,
`PARENTAL_CONSENT_VERIFIER_API_KEY`, `PARENTAL_CONSENT_VERIFIER_URL`, or
`VERCEL_AUTOMATION_BYPASS_SECRET`. The Preview server key retrieved by the content runner remains a
parent-process secret and must never become child or application configuration. Database passwords,
Supabase secret/service-role keys, OAuth client secrets, SMTP
credentials, provider API tokens, CLI tokens, signing keys, and encryption keys are always
server/tool secrets.

The Vercel automation bypass is not an application environment value. The runner normally discovers
the one existing project token through an authenticated read-only project GET. An optional transient
shell/keychain or approved CI value is only an equality override and must match that discovered
token. Never add it to the Vercel application environment, `.env.local`, `.env.example`, or a
tracked runbook. A matching hostname is only an early rejection rule: before sending the bypass,
the runner authenticates the exact URL/alias, deployment ID, project ID, owner/team ID, readiness,
and Preview/Production target through `api.vercel.com`, then verifies that the same project exposes
exactly one `automation-bypass` entry. It performs no `PATCH`, creation, rotation, or replacement.
The Playwright configuration also requires the target-bound runner attestation, installs only the
validated exact-host cookie, and disables trace capture while that cookie is present. It never
installs a global bypass header; cross-origin subresources therefore cannot receive either Vercel
credential.

For a local operator, run `npx vercel@56.3.0 whoami` immediately before each hosted suite. The
runner accepts the CLI OAuth file only when it contains a refresh token and an unexpired
seconds-based `expiresAt`; it deliberately does not refresh that session itself. An explicit
`VERCEL_TOKEN` is a non-refreshing CI/process credential and remains the operator's responsibility.

## Intentionally absent variables

Do not invent environment values for subsystems that do not have a Phase 01/02 variable contract:

- **Session secret:** there is no application `SESSION_SECRET`. Supabase owns account session
  signing, while managed-profile sessions use server-verified opaque records and configured TTL.
- **Recovery secret:** there is no separate `RECOVERY_SECRET`. Recovery intent cookies use
  `APP_ENCRYPTION_KEY`, and Supabase owns recovery-session issuance.
- **CSRF secret:** there is no `CSRF_SECRET`. Cookie-authenticated mutations require a matching
  configured application origin, `Sec-Fetch-Site` checks, and the application request contract.
- **Worker secret:** the implemented content-media worker has no worker-specific secret. It uses
  the target project's existing `NEXT_PUBLIC_SUPABASE_URL` and server-only
  `SUPABASE_SECRET_KEY` through Supabase HTTP APIs. No schedule is deployed. `DATABASE_URL` remains
  unnecessary for this worker and absent from Vercel.
- **Direct messaging:** there is no direct-message feature or enablement variable. Absence is the
  disabled state.
- **Cloud AI:** there is no cloud-AI provider variable in the current application. Absence is the
  disabled state.
- **Analytics and monitoring:** no external analytics or monitoring variables are accepted. The
  retention variables above govern application records and do not enable an external provider.

Adding a provider or capability later requires a reviewed parser, server-only consumer, validation,
tests, `.env.example` entry, this inventory update, and provider-secret-store setup. Merely adding a
value in Vercel does not create a supported integration.

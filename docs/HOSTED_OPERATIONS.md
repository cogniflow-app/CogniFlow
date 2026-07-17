# Hosted operations runbook

**Environment:** Phase 02 feature branch against the Phase 01 hosted beta baseline  
**Last verified:** 2026-07-16  
**Application phase:** Phase 02 implementation; consult [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) for the exact Preview promotion/verification state

This runbook records the secret-free operating state of the hosted Preview and Production beta
environments. It is not a public-launch approval. The authoritative variable inventory is
[HOSTED_ENVIRONMENT.md](./HOSTED_ENVIRONMENT.md); deployment and security design remain in
[DEPLOYMENT.md](./DEPLOYMENT.md) and
[SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md).

Never copy values from `apps/web/.env.local` into a hosted project. The local file stays ignored
and untracked. Hosted credentials belong only in the provider secret store, and authenticated CLI
sessions remain operator-local.

## Current hosted topology

| Boundary                   | Preview                                                               | Production beta                                                       |
| -------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Supabase project reference | `cfwddajyjbueggpzfomh`                                                | `qccbaynfvtyxigiikpmq`                                                |
| Database role              | Feature-branch migration proving ground                               | Post-merge beta database                                              |
| Vercel deployment          | `https://cogniflow-5x77sm1wj-cogniflow-app-3471s-projects.vercel.app` | Canonical: `https://recallflash.com`                                  |
| Canonical redirects        | Not applicable                                                        | `www` and `cogniflow-pearl.vercel.app` use `308` to the apex          |
| Application data           | No seeded, fixture, test-user, identity, or product data              | No seeded, fixture, test-user, identity, or product data              |
| Search indexing            | Site-wide `noindex`, `nofollow`                                       | Site-wide `noindex`, `nofollow` while the beta profile remains active |

The two Supabase projects are independent. Vercel Preview always uses the Preview project, and
Vercel Production, including `recallflash.com`, always uses the Beta project.

### Vercel project configuration

Exactly one Vercel project is linked:

| Setting           | Configured value                                                    |
| ----------------- | ------------------------------------------------------------------- |
| Project           | `cogniflow`                                                         |
| Team/account slug | `cogniflow-app-3471s-projects`                                      |
| Git repository    | `cogniflow-app/CogniFlow`                                           |
| Production branch | `main`                                                              |
| Root directory    | `apps/web`                                                          |
| Framework preset  | Next.js                                                             |
| Node.js runtime   | `24.x`                                                              |
| Package manager   | pnpm `11.13.0`                                                      |
| Install command   | `cd ../.. && pnpm install --frozen-lockfile`                        |
| Build command     | `cd ../.. && pnpm exec turbo run build --filter=@lumen/web`         |
| Output            | Vercel's default Next.js `.next` output; no custom output directory |

The checked-in `apps/web/vercel.json` mirrors the root, install, and build assumptions without
containing a project ID, account ID, token, or environment value. Vercel's local `.vercel/`
metadata is ignored and must stay uncommitted.

Both `recallflash.com` and `www.recallflash.com` are verified on this existing project. Vercel's
project-domain configuration redirects `www.recallflash.com` and the retired stable
`cogniflow-pearl.vercel.app` alias to `recallflash.com` with status `308`. The apex is the only
serving/canonical Production origin; do not add either redirecting host to application origin or
CSRF allowlists.

The project retains Vercel Standard Deployment Protection. Before any target request, each guarded
runner performs an authenticated deployment lookup through the fixed Vercel API origin and requires
the exact URL or alias, ready state, Preview/Production target, and project/team IDs to match the
ignored local Vercel link. It then performs a read-only project GET and requires exactly one
existing `automation-bypass` entry. `VERCEL_AUTOMATION_BYPASS_SECRET` is an optional transient
equality override; when present, it must match that discovered entry. Never place its value in a
command transcript, documentation, CI output, pull request, or tracked environment file. These
runners never create, rotate, replace, or `PATCH` a bypass. If the inventory is missing or
ambiguous, stop and ask the project owner to resolve it outside the run. In noninteractive CI,
supply the standard `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `VERCEL_ORG_ID` tool
secrets/metadata. For local work, refresh the authenticated CLI immediately before each suite with
`npx vercel@56.3.0 whoami`; the runner validates but does not refresh the short-lived OAuth access
token. Neither Vercel credential is inherited by Playwright.

## Hosted database state

The last completed shared-environment baseline has 21 migrations, ending with:

```text
20260715006900_hosted_grant_parity.sql
```

That final additive migration removes broad `service_role` table and sequence privileges and
unsafe default privileges that the hosted platform restored independently of the migration SQL.
It does not delete application data. Both remote histories matched that local committed history at
the Phase 01 verification point.

The final hosted verification for each project confirmed:

- migration history is an exact local/remote match and a subsequent push dry run is empty;
- database lint has no errors in `public` or `private`;
- the hosted invariant suite passes for RLS, policies, function security, grants, and exposed
  schema boundaries;
- Storage has no bucket or object outside the Phase 01 contract;
- schema diff is empty apart from Supabase's fixed, platform-managed `public.rls_auto_enable()`
  helper with `search_path=pg_catalog`;
- generated database types match the committed schema; and
- anonymous and authenticated privileges are no broader than the tested Phase 01 policy matrix.

The deploy and verify wrappers link only the named project, confirm the resulting link, serialize
hosted operations with a local lock, and unlink in a `finally` path. They do not read a database
password from repository configuration.

### Phase 02 Preview checkpoint

Phase 02 adds these twelve migration candidates after the 21-migration baseline:

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

They create the content tables/transactions, frozen public projection, and private
`lumen-content-media` bucket; compose note/media writes atomically; separate public metadata from
service-only Storage locators; stabilize named lifecycle RPC parameters; correct guarded-read
volatility; and harden expected versions, replay authorization, pending-object immutability, and
embedded-media usage accounting. They also derive an ID-less new note from its idempotency UUID and
raise typed stale-version outcomes as non-serialization user exceptions so hosted clients do not
loop on automatic transaction retries. Migration 080 resolves a custom definition
plus its note/media graph in one copy-on-write transaction, applies optional deck settings plus
publish/unpublish in one transaction, and adds a private leased physical-media cleanup queue with
service-only claim/complete RPCs. The last three migrations bind every browser-reachable content
idempotency receipt to the complete canonical command, capture/restore the exact schema-v2 media
reference graph in immutable deck versions (including legacy reconstruction and
frozen-publication identifier remediation), and align helper volatility with the strict hosted
catalog contract. Their presence in a branch does not prove either hosted project has them.
The exact Preview command results, remote migration count, Storage invariant result, deployed URL,
hosted smoke count, and cleanup evidence must be recorded in
[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md). Until those results are present, report
Phase 02 Preview as **not hosted-verified**.

The feature branch may deploy these committed migrations only to Preview after complete local
acceptance and a clean tracked migration directory. It must not apply them to Beta or deploy the
Production application. A Preview validation may create a dedicated test account/deck/media object
only when the test has an explicit cleanup path. Afterwards, verify removal of the fixture Auth
principal, frozen publication, and Storage objects plus privacy minimization of retained content
tombstones. Append-only/structural audit evidence and opaque minimized rows remain by design; do
not claim zero content rows or zero product data.

After Phase 02 promotion, `db:verify:preview` expects the Storage root inventory to contain exactly
`lumen-content-media/` and its recursive object inventory to be empty. A missing bucket, extra
bucket, or any remaining object is drift/failure. This intentionally differs from the historical
Phase 01 baseline, which had no bucket.

In addition to the non-mutating baseline smoke, the isolated Phase 02 Preview acceptance must
verify the default post-authentication `/app` redirect, the retained non-default safe return
`/app/decks/new`, explicit
appearance across protected navigation/reload, the real empty library, deck creation, save and
reopen of a representative basic note/card, public preview, and anonymous denial of the exact
formerly published slug and public ID after unpublish. The
guarded runner confirms the one disposable reserved-address Auth identity through the Preview
project's admin API from the parent process, marks it with the generated run ID, and gives the
Playwright worker no Supabase server key. The application UI owns
onboarding/content/publication behavior. Its once-only `finally` cleanup acquires the same
hosted-operation lock, links only the fixed Preview project, processes the account through the existing
provisional-rejection or due account-deletion boundary, and asserts Auth removal, publication
withdrawal, privacy-minimized content tombstones, and an empty recursive bucket object inventory.
The first graceful `SIGINT` or `SIGTERM` terminates the active test child and still reaches that
cleanup; cleanup failure, `SIGKILL`, or host/process loss is not a no-leak guarantee. Record the
exact deployed URL, test count, cleanup result, and UTC time in
[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md); do not treat this persistent fixture flow
as part of the safe read-only baseline suite.

### Phase 02 physical media deletion operation

Migration `20260716008000_content_atomic_authoring_and_media_deletion.sql` makes the database side
of physical cleanup deployable, and `pnpm worker:media-deletions` implements one bounded
claim/remove/complete batch. This feature-branch Preview promotion does not deploy or schedule that
process.

Any future worker deployment must keep `SUPABASE_SECRET_KEY` in its provider secret store and pair
it with the same environment's `NEXT_PUBLIC_SUPABASE_URL`. Optional
`MEDIA_DELETION_BATCH_SIZE=25` (`1..100`) and `MEDIA_DELETION_LEASE_SECONDS=300` (`30..900`) bound
one run. The service-only claim revalidates the elapsed deadline, zero usage, and absence of a
frozen media publication under lock. Completion accepts only the matching lease token; Storage
failure requeues with durable bounded backoff, and an expired crash lease can be reclaimed.
Supabase bulk removal returns success with an empty result for an already-absent key. Any error
actually reported by Storage, including a typed or prose `404`, is requeued because that response
can describe a missing bucket rather than a missing object. The worker tombstones the database
locator only after Storage reports successful removal.

Before enabling the schedule in an environment, record the worker host, secret scope, recurrence,
monitoring/alert owner, and a non-sensitive deletion exercise. The application Preview acceptance
cleans its objects synchronously through its guarded fixture teardown and is not evidence that a
recurring worker has been deployed.

## Safe database promotion workflow

Run these commands from the repository root with an authenticated Supabase CLI. Read and review
every new migration before promotion. An applied migration is immutable; correct it with a new
forward migration.

### Feature branch to Preview

The phase branch may promote new migrations only to Preview:

```bash
pnpm db:deploy:preview
pnpm db:verify:preview
```

The Preview deploy guard requires `supabase/migrations` to be tracked and clean. Every hosted action
also requires the exact on-disk SQL file set to match `git ls-files` and rejects links, special
files, missing tracked files, and locally/global-ignored additions. Deployment reads remote history,
rejects a divergent or non-prefix history, runs a dry run, applies only committed migrations, and
then requires an exact history match. Verification performs the independent lint, invariant,
Storage, schema-diff, and generated-type checks described above.

After Preview database verification, use the Vercel Preview for the same branch and run the hosted
smoke suite before approving the pull request.

After the non-mutating baseline passes, run the isolated disposable content acceptance against the
same exact deployment:

```bash
npx vercel@56.3.0 whoami
pnpm test:hosted:preview:content --url https://<exact-preview-host>.vercel.app
pnpm db:verify:preview
```

The runner refuses Production, local, credential-bearing, non-HTTPS, and unrelated Vercel origins.
Before retrieving any server key or creating an identity, it authenticates the exact deployment
against the linked Vercel project/team through `api.vercel.com`, then requires exactly one existing
automation bypass from a read-only project lookup. Only that authenticated deployment may receive
the bypass, after which `/api/health` must report a healthy Vercel Preview, a non-development build,
and the exact public Preview Supabase project reference. It then obtains the Preview server key in
parent memory from the authenticated Supabase CLI, creates and confirms only the exact UUID-marked
reserved-domain fixture through Admin Auth, and never reads, writes, or modifies
`apps/web/.env.local`. Pre-provisioning removes outbound SMTP from this disposable proof while the
browser still exercises the public signup/check-email/sign-in/onboarding path. The Vercel cookie attestation uses a private
mode-`0600` file inside the sterile child runtime, opened with no-follow/inode checks for each
Playwright configuration evaluation and destroyed by the parent after the process tree exits. The Playwright child receives an
empty private home/config sandbox, no provider or CLI credentials, and only a nonsecret fixture
completion marker. Do not invoke its Playwright file directly: target attestation, reserved
identity, secret lifetime, hosted lock, deletion cleanup, unlink, and recursive Storage assertion
all belong to the wrapper. If the test or cleanup fails—or the process suffers `SIGKILL` or host
loss—inspect and complete cleanup before another hosted content run. Successful cleanup removes the
Auth principal/publication/objects but intentionally retains privacy-minimized content tombstones
and required audit evidence.

### Merged `main` to Beta

Do not promote a phase migration to Beta from a feature branch. After its pull request is merged:

```bash
git fetch origin main
git switch main
git pull --ff-only origin main
git status --short
pnpm db:deploy:beta
pnpm db:verify:beta
```

`pnpm db:deploy:beta` fetches `origin/main` again and fails closed unless all three conditions are
true: the current branch is `main`, the complete worktree is clean, and `HEAD` exactly equals
`origin/main`. The verification command is read-only with respect to application schema and may be
rerun for diagnostics.

New database/application contracts must use an expand/migrate/contract sequence so the previous
and next application builds can coexist while the post-merge Beta promotion runs. If the Git-linked
Production build starts before database promotion completes, verify the database and redeploy the
same merged commit before accepting the release.

### Commands that are never part of hosted promotion

Do not run any of the following against Preview or Beta:

- `supabase db reset`;
- seed or fixture deployment, including an `--include-seed` or `--include-all` push;
- destructive migration-history repair used to force an unexpected remote state;
- `supabase config push`, because the checked-in Auth configuration contains local URLs;
- dashboard SQL or manual schema edits; or
- an automated Beta reset, rollback, or data deletion.

If a remote history or schema check fails, stop and investigate. Do not repair the symptom by
rewriting an applied migration. Application rollback may select an older immutable Vercel build;
database correction must roll forward with a reviewed compensating migration.

## Vercel deployment and smoke workflow

The normal future-phase path is Git-based:

1. Local implementation and all repository tests use Docker Supabase and the ignored
   `apps/web/.env.local`.
2. Push the phase branch and use its Vercel Preview, which is scoped to Preview Supabase.
3. Promote and verify database migrations only in Preview while the pull request is open.
4. Run the Preview hosted smoke suite against the exact deployment under review.
5. Merge only after review and verification. Do not merge a hosted-bootstrap or phase pull request
   from an automation session unless the owner explicitly changes that policy.
6. From a clean, synchronized `main`, promote and verify the merged migrations in Beta.
7. Confirm or redeploy the merged Vercel Production build, which is scoped to Beta Supabase.
8. Run the Production hosted smoke suite on the stable Production origin.

Use either an explicit URL or the target-specific environment variable. The current targets are:

```bash
HOSTED_PREVIEW_URL=https://cogniflow-5x77sm1wj-cogniflow-app-3471s-projects.vercel.app \
  pnpm test:hosted:preview

HOSTED_PRODUCTION_URL=https://recallflash.com \
  pnpm test:hosted:production
```

The equivalent explicit form is:

```bash
npx vercel@56.3.0 whoami
pnpm test:hosted:preview --url https://cogniflow-5x77sm1wj-cogniflow-app-3471s-projects.vercel.app
npx vercel@56.3.0 whoami
pnpm test:hosted:production --url https://recallflash.com
```

Run `whoami` immediately before each local suite because the CLI OAuth access token is short-lived;
the runner deliberately fails instead of refreshing it. Noninteractive CI must supply
`VERCEL_TOKEN` plus its standard linked project/team IDs. The runner sends that API token only to
`api.vercel.com`, authenticates exact ownership, and performs one read-only project lookup. It
requires exactly one existing automation bypass, then sends it only to the exact target to request a
host-only Vercel cookie. An optional `VERCEL_AUTOMATION_BYPASS_SECRET` loaded from an approved store
must equal the discovered value; it cannot select a different token. The runner never mutates
Vercel settings. It validates the same-origin cookie redirect and health response, removes inherited
operator/provider credentials from the Playwright child, and gives Playwright only the exact-host
`_vercel_jwt` storage state plus any explicitly scoped acceptance value. No global request header
is installed, so cross-origin subresources cannot receive the bypass. Do not weaken Deployment
Protection merely to make a smoke test pass.

The hosted suite refuses local or non-HTTPS targets and binds Preview to this project's Vercel
deployment hostname family and Production to the canonical apex. A hostname match is only an early
filter. Before any target health request or Playwright starts, the authenticated Vercel deployment
lookup must match the linked project/team and target; the health preflight must then match the
selected Vercel environment and exact public Preview/Beta Supabase project reference. Its
baseline checks verify the landing page and canonical link; safe health projection;
signup/sign-in/recovery rendering; protected-route
redirect; safe-return normalization; expired callback and confirmation behavior; a neutral
recovery response with a host-only `Secure`, HttpOnly, SameSite=Lax state cookie; rejection of the
retired Production origin for mutations; unauthenticated sign-out; security headers; and the
site-wide robots policy. Phase 02 extends the baseline with random missing public-deck and embed
projection checks and safe Auth fallback behavior without depending on persistent fixtures. The
baseline intentionally does not create an account, learner, child identity, content row, Storage
object, or fixture. Recovery initiation creates the normal bounded private
rate-limit record under a server-HMACed subject; the record contains neither the reserved test
email address nor personal information.

The separate `test:hosted:preview:content` path creates one disposable adult account and deck only
in Preview. It verifies signup confirmation handoff, `/app` onboarding fallback, empty real counts,
durable dark appearance across settings/reload, deck creation, basic front/back/source save and
reopen, the card browser, publish/anonymous flip/unpublish denial, and delete. Success is reported
only after the wrapper's database/Auth/Storage cleanup completes.

## Supabase Auth URL configuration

Hosted Auth settings are deliberately separate from local Supabase configuration. Do not add
localhost to either hosted project's allowlist.

### Preview project

Set the Preview project's Auth URL Configuration to exactly:

```text
Site URL
https://cogniflow-5x77sm1wj-cogniflow-app-3471s-projects.vercel.app

Redirect URLs
https://cogniflow-5x77sm1wj-cogniflow-app-3471s-projects.vercel.app/auth/callback**
https://cogniflow-*-cogniflow-app-3471s-projects.vercel.app/auth/callback**
```

The first entry is the verified deployment. The second is the minimum Vercel Preview wildcard
needed for this project's generated deployment hostnames; it is path-limited to
`/auth/callback**` and must not be widened to an entire origin.

### Beta project

Set the Beta project's Auth URL Configuration to exactly:

```text
Site URL
https://recallflash.com

Redirect URLs
https://recallflash.com/auth/callback**
https://cogniflow-pearl.vercel.app/auth/callback**
```

The old callback remains temporarily as an intentional rollback entry. It is path-limited and its
host currently redirects to the apex, so it is not a second canonical origin. Retain it until the
post-cutover rollback window and live custom-SMTP confirmation/magic-link/recovery exercise are
complete; then remove it in a deliberate owner operation. Do not add the Preview wildcard to Beta
or an unrestricted `*.vercel.app` wildcard to either project.

### Local Auth

Local Docker Supabase owns localhost redirects in `supabase/config.toml`:

```text
Site URL
http://127.0.0.1:3100

Redirect URLs
http://localhost:3100/**
http://127.0.0.1:3100/**
```

These local values must remain local and must never replace either hosted Site URL.

### Email template rule

Keep Supabase's current confirmation template link based on:

```text
{{ .ConfirmationURL }}
```

The application supplies a complete, stateful `/auth/callback` `redirectTo`; Supabase's
confirmation URL performs provider verification and returns the code to that exact allowlisted
application callback. Do not replace the template link with `{{ .SiteURL }}`, hard-code a host, or
append `/auth/confirm` to `ConfirmationURL`.

The application's `/auth/confirm` route is reserved for a reviewed direct token-hash template.
Custom token-hash templates, custom SMTP delivery, sender-domain verification, and live email
delivery remain provider-gated and have not been enabled or live-verified in this bootstrap.

Email confirmation is required in both hosted Supabase projects and
`AUTH_EMAIL_CONFIRMATION_REQUIRED=true` is aligned in both Vercel scopes. Anonymous Auth and
Google, GitHub, and Azure/Microsoft Auth providers remain disabled.

## Custom-domain operating posture

The custom-domain cutover uses these fixed boundaries:

1. `recallflash.com` and `www.recallflash.com` remain attached to the existing Vercel project
   `cogniflow`; no second application exists.
2. Production-scoped `NEXT_PUBLIC_APP_URL` is `https://recallflash.com`; Preview omits it and keeps
   deriving its deployment origin.
3. Vercel redirects `www` and the retired stable alias to the apex with `308`.
4. Beta Supabase Auth uses the apex Site URL and the two path-limited callback entries above;
   Preview and local Auth settings are unchanged.
5. Hosted email templates stay on `{{ .ConfirmationURL }}` so the application's stateful
   `/auth/callback` `redirectTo` remains authoritative.
6. Production smoke runs only against the apex. Custom SMTP and delivered confirmation, magic
   link, recovery, and email-change flows remain a separate owner-gated live exercise.

The `vercel_beta` deployment profile currently forces site-wide no-index behavior. Attaching a
domain does not authorize indexing. Search-engine indexing requires a separate explicit launch
decision, reviewed configuration/code change, and verification of `robots.txt`, metadata, and
`X-Robots-Tag` on the custom origin.

## Environment and safety invariants

The Vercel Preview and Production scopes contain the exact variables accepted by the repository,
as catalogued in [HOSTED_ENVIRONMENT.md](./HOSTED_ENVIRONMENT.md). The following operational rules
are non-negotiable:

- Preview and Production use different Supabase URLs, browser publishable keys, and server secret
  keys.
- `SUPABASE_SECRET_KEY`, database credentials, signing keys, encryption keys, provider secrets,
  and CLI tokens never use a `NEXT_PUBLIC_` name.
- Preview and Production use independently generated `APP_ENCRYPTION_KEY`,
  `GUEST_TOKEN_SIGNING_KEY`, and `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` values. The three keys are
  also distinct within each environment.
- Preview omits `NEXT_PUBLIC_APP_URL` and derives its exact origin from Vercel metadata. Production
  uses `https://recallflash.com`.
- `DEPLOYMENT_PROFILE=vercel_beta`, managed child profiles, independent child public publishing,
  unrestricted free-text game chat, and parental consent remain disabled in both scopes.
- Direct messaging has no implementation or enablement variable and remains disabled.
- No cloud-AI, OAuth, custom email, analytics, or monitoring provider is configured.
- `DATABASE_URL` is absent from Vercel because the web application uses Supabase HTTP APIs and no
  hosted background worker exists.
- Production configuration fails closed when a required server secret is missing or duplicated.

The server parser and Vercel provider marker independently force production managed-child,
public-child, free-text-chat, and parental-consent capabilities off. Do not weaken those gates in a
provider setting. Under-13 profiles are not permitted on this Vercel deployment.

## Bootstrap verification evidence

At bootstrap completion:

- both hosted database verifiers passed against 21 of 21 committed migrations;
- Preview hosted Playwright smoke passed 9 of 9 tests;
- Production hosted Playwright smoke passed 9 of 9 tests on the stable alias;
- hosted Auth contained zero users;
- public application schemas contained zero identity or product rows; the recovery check created
  only the expected pseudonymous private rate-limit record;
- hosted Storage contained zero buckets and objects;
- no test user, child identity, fixture content, or personal information was created;
- the recovery smoke used a reserved `example.invalid` address and returned the same neutral
  response contract used for any address; and
- health and public routes exposed no server secret or private account data.

This evidence verifies the deployed Phase 01 architecture without custom SMTP. It does not prove
email delivery, a successful real confirmation/recovery link, OAuth, identity linking, a custom
domain, worker schedules, backup restoration, incident response, or legal launch readiness.

## Custom-domain finalization evidence

On 2026-07-16, the custom-domain finalization added this evidence without creating an Auth user,
child profile, fixture, or product row:

- Vercel Production deployment
  `https://cogniflow-mns48tw69-cogniflow-app-3471s-projects.vercel.app` reached `READY` and was
  aliased to `https://recallflash.com` using the Production-scoped environment.
- `https://recallflash.com/api/health` returned `200`, and the expanded Production hosted suite
  passed 10 of 10 checks against the apex. Protected Preview independently passed the same 10 of
  10 checks through the configured automation bypass.
- `www.recallflash.com` and `cogniflow-pearl.vercel.app` each returned a path- and query-preserving
  `308` redirect to `recallflash.com`.
- The landing canonical resolves to the apex. The recovery state cookie is host-only, HttpOnly,
  `Secure`, and SameSite=Lax; the application accepts same-origin mutations and rejects the former
  Production origin. Callback/confirmation errors, unsafe returns, protected routes, sign-out,
  security headers, and site-wide no-index behavior all passed.
- Beta Supabase Auth re-read exactly as the apex Site URL plus the apex and temporary old-host
  path-limited callbacks. Preview's Site URL and restricted callback wildcard were unchanged.
  Both projects still require email confirmation and keep anonymous Auth and all three optional
  OAuth providers disabled.
- Confirmation, email-change, invite, magic-link, and recovery templates still use
  `{{ .ConfirmationURL }}` and do not directly replace it with `{{ .RedirectTo }}`. Custom SMTP is
  not configured, so delivered-link testing and subsequent removal of the rollback callback remain
  owner actions.
- Vercel Protection Bypass for Automation remained configured and worked without exposing or
  persisting its credential. Current GitHub Actions workflows do not invoke hosted smoke and do not
  require the bypass secret.

This evidence supersedes only the bootstrap's old-domain/9-test deployment result. The historical
database and data-emptiness evidence remains valid, and the owner-gated email-delivery, worker,
backup, monitoring, incident-response, and legal-launch limitations still apply.

## Remaining owner actions

The following actions remain owner-controlled and are not blockers to retaining the private beta
bootstrap, but they are gates for the capability they affect:

- close the temporary old-callback rollback window after custom SMTP and delivered Auth-link
  verification, then remove that one Beta allowlist entry;
- configure a custom SMTP provider and verified sender domain, review every Supabase Auth email
  template, and record end-to-end delivery evidence;
- leave Google, GitHub, and Azure/Microsoft OAuth disabled until separate provider credentials,
  callbacks, scopes, linking behavior, and environment-specific tests are complete;
- maintain exactly one project automation bypass; any intentional owner rotation happens outside
  the guarded runner and the replacement value belongs only in an approved secret store;
- deploy, authenticate, schedule, monitor, and test the checked-in content-media deletion worker,
  plus portable workers for account exports, queued account deletion after its grace period,
  expired guest/rate-limit cleanup, and audit retention;
- choose and verify backup/PITR policy, perform a restoration exercise, and configure quota,
  availability, security, and stuck-job alerts;
- select privacy-reviewed analytics or monitoring only after its data fields, retention, sampling,
  deletion behavior, and child-safety impact are documented; and
- complete the privacy, terms, copyright, vendor, abuse, incident-response, and launch review in
  [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).

No worker or scheduler was deployed by this bootstrap or the Phase 02 feature branch. The
content-media runner is implemented in the repository, but queued export/deletion infrastructure
must not be represented as completed processing until an owner-operated runner succeeds. Optional
SMTP, OAuth, AI, analytics, and monitoring integrations remain absent rather than silently mocked.

The historical bootstrap changed only hosted Phase 01 infrastructure, guarded operations, tests,
and documentation; its statement that content was not yet implemented is historical evidence, not
the current Phase 02 branch status. No Phase 03 scheduling, later study mode, or game scope is
introduced by the Phase 02 promotion.

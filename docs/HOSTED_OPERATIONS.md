# Hosted operations runbook

**Environment:** Phase 01 hosted bootstrap  
**Last verified:** 2026-07-16  
**Application phase:** Phase 01; Phase 02 has not started

This runbook records the secret-free operating state of the hosted Preview and Production beta
environments. It is not a public-launch approval. The authoritative variable inventory is
[HOSTED_ENVIRONMENT.md](./HOSTED_ENVIRONMENT.md); deployment and security design remain in
[DEPLOYMENT.md](./DEPLOYMENT.md) and
[SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md).

Never copy values from `apps/web/.env.local` into a hosted project. The local file stays ignored
and untracked. Hosted credentials belong only in the provider secret store, and authenticated CLI
sessions remain operator-local.

## Current hosted topology

| Boundary                        | Preview                                                               | Production beta                                                       |
| ------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Supabase project reference      | `cfwddajyjbueggpzfomh`                                                | `qccbaynfvtyxigiikpmq`                                                |
| Database role                   | Feature-branch migration proving ground                               | Post-merge beta database                                              |
| Vercel deployment               | `https://cogniflow-5x77sm1wj-cogniflow-app-3471s-projects.vercel.app` | Stable: `https://cogniflow-pearl.vercel.app`                          |
| Generated Production deployment | Not applicable                                                        | `https://cogniflow-91ytfxf2d-cogniflow-app-3471s-projects.vercel.app` |
| Application data                | No seeded, fixture, test-user, identity, or product data              | No seeded, fixture, test-user, identity, or product data              |
| Search indexing                 | Site-wide `noindex`, `nofollow`                                       | Site-wide `noindex`, `nofollow` while the beta profile remains active |

The two Supabase projects are independent. Vercel Preview always uses the Preview project, and
Vercel Production always uses the Beta project. A future custom Production domain must continue
to use the Beta project.

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

The project retains Vercel Standard Deployment Protection. Automated checks against a protected
deployment may use a project-scoped automation bypass secret loaded into the operator process as
`VERCEL_AUTOMATION_BYPASS_SECRET`. Never place its value in a command transcript, documentation,
CI output, pull request, or tracked environment file. Regenerating that secret invalidates the
previous value.

## Hosted database state

Both hosted projects have exactly the 21 committed migrations, ending with:

```text
20260715006900_hosted_grant_parity.sql
```

That final additive migration removes broad `service_role` table and sequence privileges and
unsafe default privileges that the hosted platform restored independently of the migration SQL.
It does not delete application data. Both remote histories match the local committed history.

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

HOSTED_PRODUCTION_URL=https://cogniflow-pearl.vercel.app \
  pnpm test:hosted:production
```

The equivalent explicit form is:

```bash
pnpm test:hosted:preview --url https://cogniflow-5x77sm1wj-cogniflow-app-3471s-projects.vercel.app
pnpm test:hosted:production --url https://cogniflow-pearl.vercel.app
```

If the target is protected, load `VERCEL_AUTOMATION_BYPASS_SECRET` from an approved operator
secret store into the same process before invoking the command. Vercel does not reveal a saved
value later; regenerate it in the project setting if no retained copy exists. The Playwright
configuration supplies the supported bypass header and cookie without exposing the value in test
output. Do not weaken Deployment Protection merely to make a smoke test pass.

The hosted suite refuses local or non-HTTPS targets. It verifies the landing page, safe health
projection, signup/sign-in/recovery page rendering, protected-route redirect, safe-return
normalization, expired callback and confirmation behavior, neutral recovery response,
unauthenticated sign-out, security headers, and the site-wide robots policy. It intentionally does
not create an account, learner, child identity, content row, Storage object, or fixture. Recovery
initiation does create the normal bounded private rate-limit record under a server-HMACed subject;
the record contains neither the reserved test email address nor personal information.

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
https://cogniflow-pearl.vercel.app

Redirect URLs
https://cogniflow-pearl.vercel.app/auth/callback**
```

Do not add the Preview wildcard to Beta. Do not add an unrestricted `*.vercel.app` wildcard to
either project.

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

## Future custom-domain cutover

Perform this only after the owner selects and verifies the domain:

1. Attach the domain to the existing Vercel project `cogniflow`; do not create another Vercel
   application.
2. Verify DNS and TLS, then set the Production-scoped `NEXT_PUBLIC_APP_URL` to the exact HTTPS
   custom origin. Do not add it to Preview.
3. Deploy the reviewed `main` commit and confirm `/api/health`, headers, redirects, and cookies on
   the custom origin.
4. In Beta Supabase Auth URL Configuration, replace the Site URL with the exact custom origin and
   add only `https://<custom-domain>/auth/callback**` to the redirect allowlist.
5. Retain `https://cogniflow-pearl.vercel.app/auth/callback**` temporarily only when it is an
   intentional rollback target. Remove it when the rollback window closes.
6. Keep the email template on `{{ .ConfirmationURL }}` so the environment's reviewed
   `redirectTo` remains authoritative.
7. Configure custom SMTP and a verified sender, then live-test confirmation, magic link, recovery,
   email change, expired-link handling, and neutral account-existence responses.
8. Rerun the Production hosted smoke suite against the custom origin.

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
  uses `https://cogniflow-pearl.vercel.app` until the custom-domain cutover.
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

## Remaining owner actions

The following actions remain owner-controlled and are not blockers to retaining the private beta
bootstrap, but they are gates for the capability they affect:

- attach and verify the custom domain, then perform the cutover above;
- configure a custom SMTP provider and verified sender domain, review every Supabase Auth email
  template, and record end-to-end delivery evidence;
- leave Google, GitHub, and Azure/Microsoft OAuth disabled until separate provider credentials,
  callbacks, scopes, linking behavior, and environment-specific tests are complete;
- regenerate the Vercel automation bypass secret when protected-deployment automation needs it
  and no approved operator copy exists, then capture the new value only in an approved secret
  store;
- select, deploy, authenticate, schedule, monitor, and test portable workers for account exports,
  queued deletion after its grace period, expired guest/rate-limit cleanup, and audit retention;
- choose and verify backup/PITR policy, perform a restoration exercise, and configure quota,
  availability, security, and stuck-job alerts;
- select privacy-reviewed analytics or monitoring only after its data fields, retention, sampling,
  deletion behavior, and child-safety impact are documented; and
- complete the privacy, terms, copyright, vendor, abuse, incident-response, and launch review in
  [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).

No worker or scheduler was deployed by this bootstrap. Queued export and deletion infrastructure
must not be represented as completed processing until an owner-operated runner succeeds. Optional
SMTP, OAuth, AI, analytics, and monitoring integrations remain absent rather than silently mocked.

This bootstrap changed only hosted Phase 01 infrastructure, guarded operations, tests, and
documentation. It did not implement decks, notes, cards, editors, media authoring, SRS, study
modes, games, or any other Phase 02 scope.

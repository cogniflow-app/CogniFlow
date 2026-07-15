# Deployment and portability

**Initial target:** Vercel preview and 13+ beta  
**Portable candidate:** Cloudflare Workers through OpenNext  
**Last updated:** 2026-07-14

A successful build proves compile-time compatibility only. It does not prove a live provider configuration, legal compliance, child eligibility, quotas, backup readiness, or production security.

## Shared build contract

- Node.js `24.18.0` locally/CI; hosted providers select the current `24.x` runtime.
- pnpm `11.13.0` and a frozen lockfile.
- `pnpm build` is the canonical Next.js production build.
- `pnpm build:portable` produces/validates the OpenNext Cloudflare artifact.
- Domain packages contain no Vercel or Cloudflare APIs.
- `/api/health` returns only status, public build version, runtime/profile classification, and safe capability state—never environment values or credentials.
- Preview/developer surfaces are marked `noindex`; production indexing is enabled only for intentionally public pages.

## Required environment inventory

| Variable                               | Vercel        | Cloudflare/OpenNext           | Notes                                                      |
| -------------------------------------- | ------------- | ----------------------------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_APP_NAME`                 | Build/runtime | Build/runtime                 | Public, centralized brand                                  |
| `NEXT_PUBLIC_APP_URL`                  | Build/runtime | Build/runtime                 | Canonical HTTPS origin for that environment                |
| `NEXT_PUBLIC_SUPABASE_URL`             | Build/runtime | Build/runtime                 | Public project URL                                         |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Build/runtime | Build/runtime                 | Public key protected by RLS                                |
| `SUPABASE_SECRET_KEY`                  | Secret        | Worker secret                 | Server-only; minimal use                                   |
| `DATABASE_URL`                         | Secret        | Worker secret                 | Prefer pooled/direct form appropriate to operation/runtime |
| `DEPLOYMENT_PROFILE`                   | `vercel_beta` | `cloudflare`                  | Drives server capability guard                             |
| Child/public/chat flags                | All `false`   | All `false` until launch gate | Server enforces profile restrictions                       |
| `APP_ENCRYPTION_KEY`                   | Secret        | Worker secret                 | Independent 32+ byte key                                   |
| `GUEST_TOKEN_SIGNING_KEY`              | Secret        | Worker secret                 | Independent 32+ byte key                                   |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`   | Secret        | Worker secret                 | Stable base64 32-byte key shared by instances              |
| `NEXT_PUBLIC_BUILD_VERSION`            | Build/runtime | Build/runtime                 | Public commit/release identifier                           |

Generate production secrets independently with a cryptographically secure generator. Do not copy local defaults, reuse keys across purposes/environments, or commit secrets to provider configuration files.

### Stable Server Action encryption

Next.js otherwise generates an encryption key during build. Multiple builds/instances need a stable deployment value so encrypted Server Action references remain consistent during a rollout:

```bash
openssl rand -base64 32
```

Store the result as `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in the provider's encrypted secret store. Rotate through a coordinated deployment/session plan; do not expose it as `NEXT_PUBLIC_*`. `APP_ENCRYPTION_KEY` is an application key and is not a substitute.

## Vercel preview and beta

1. Import the repository with its monorepo root.
2. Select Node `24.x`.
3. Use the detected pnpm install and `pnpm build`.
4. Configure preview and production variables separately.
5. Set:

   ```env
   DEPLOYMENT_PROFILE=vercel_beta
   ENABLE_CHILD_PROFILES=false
   ENABLE_PUBLIC_CHILD_CONTENT=false
   ENABLE_FREE_TEXT_GAME_CHAT=false
   ```

6. Point previews at a non-production Supabase project and apply migrations through a reviewed deployment workflow, never automatically from an untrusted pull request.
7. Verify `/`, `/api/health`, error/not-found handling, security headers, robots metadata, and Supabase connectivity.
8. Run browser and accessibility smoke tests against the deployment before promotion.

Do not place a secret key in Vercel variables whose name begins `NEXT_PUBLIC_`. Do not expose production data to forked preview builds.

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
- Validate every Next.js or OpenNext upgrade with `build:portable` and a live preview smoke test before promotion.
- Keep Workers compressed bundle size within the selected plan limit and measure it from Wrangler output.
- Direct Postgres connections may be unsuitable for a high-concurrency Worker runtime; use the reviewed Supabase HTTP APIs or an appropriate pooled connection path.
- Cloudflare hosting does not migrate Supabase Auth/database/storage/realtime automatically.
- Passing a Cloudflare build does not make the deployment child-capable.

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

Phase 00 initializes local Supabase only. No hosted Supabase project or credential is required to verify the foundation.

## Observability and privacy

Phase 00 uses build/runtime health and structured server logs without sensitive payloads. Optional external error/analytics providers remain disabled until configured and reviewed. Before enabling one:

- document data fields and retention;
- strip tokens, answer text, content bodies, and child identifiers;
- disable child session replay and cross-site tracking;
- establish environment-specific sampling and deletion controls;
- add the provider to owner/vendor records.

## Promotion checklist

- frozen install, lint, typecheck, unit/database/browser/a11y tests, standard build, and portable build pass;
- exact results are recorded rather than inferred;
- migration chain applies from empty and to staging data safely;
- production variables pass validation and child/chat flags are false;
- secrets differ from local/preview and are not present in artifacts/logs;
- security headers/CSP and robots behavior are verified on the deployed origin;
- health response is non-sensitive and identifies the intended build;
- rollback target and database roll-forward plan are documented;
- backup/export restoration has been exercised;
- provider quota alerts and responsible owner contacts exist;
- privacy/terms/safety/copyright and incident procedures have been reviewed.

## Rollback

Application deployments may roll back to a previously verified immutable artifact. Database migrations do not roll backward by deleting user data; issue a compensating forward migration. If an application/database contract is changing, use expand/migrate/contract so both deployment versions can coexist during promotion/rollback.

Rotate credentials immediately when exposure is suspected; an application rollback alone does not revoke a leaked secret.

## Child-safety launch gate

Vercel deployments must reject under-13 profile creation/activation. The portable candidate remains disabled for child profiles until current hosting, Supabase, email, storage, analytics, monitoring, realtime, and AI terms are reviewed; parental notice/consent, retention, guardian rights, incident response, and applicable legal obligations are implemented and reviewed by qualified counsel.

No build, automated test, or generated document can waive this gate.

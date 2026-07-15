# Local setup

This guide brings the Phase 00 workspace up from a clean checkout. Commands run from the repository root unless stated otherwise.

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

`db:reset` is intentionally destructive to the local development database only. Never point the local command at a hosted database. Stop services without deleting local volumes using:

```bash
pnpm db:stop
```

## Environment variables

`.env.example` is the canonical inventory.

| Variable                               | Visibility    | Local guidance                                    |
| -------------------------------------- | ------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_APP_NAME`                 | Public        | Replaceable visible brand; defaults to `Lumen`    |
| `NEXT_PUBLIC_APP_URL`                  | Public        | `http://127.0.0.1:3100`                           |
| `NEXT_PUBLIC_SUPABASE_URL`             | Public        | Local API URL from `db:status`                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public        | Local publishable key only                        |
| `SUPABASE_SECRET_KEY`                  | Server secret | Local secret key; never import in client code     |
| `DATABASE_URL`                         | Server secret | Local Postgres connection                         |
| `DEPLOYMENT_PROFILE`                   | Server config | `local` for development                           |
| `ENABLE_CHILD_PROFILES`                | Capability    | `false` for Phase 00 and all Vercel deployments   |
| `ENABLE_PUBLIC_CHILD_CONTENT`          | Capability    | `false`                                           |
| `ENABLE_FREE_TEXT_GAME_CHAT`           | Capability    | `false`                                           |
| `APP_ENCRYPTION_KEY`                   | Server secret | At least 32 random bytes in a real deployment     |
| `GUEST_TOKEN_SIGNING_KEY`              | Server secret | Independent value, at least 32 random bytes       |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`   | Server secret | Stable 32-byte base64 key shared by all instances |
| `NEXT_PUBLIC_BUILD_VERSION`            | Public        | Optional commit/release identifier                |

For non-local environments generate independent keys, for example:

```bash
openssl rand -base64 32
```

Never reuse one value for encryption, guest signing, and Server Actions.

## Run the web application

```bash
pnpm dev
```

The default application URL is `http://127.0.0.1:3100`. Implemented Phase 00 verification surfaces include:

- `/` — public landing page;
- `/api/health` — non-sensitive runtime/build health;
- `/app` — honest application-shell preview with no account session;
- `/auth` — account trust-boundary information; authentication is not active;
- `/dev/design-system` — developer component gallery, marked against production indexing.

The authenticated-shell preview communicates that authentication is not implemented in Phase 00; it is not a fake signed-in session.

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

- select Node `24.x`;
- keep the monorepo root as the project root;
- use the detected pnpm install and `pnpm build`;
- set all required environment variables separately for preview and production;
- use `DEPLOYMENT_PROFILE=vercel_beta` and keep all child/chat flags false.

### Portable host

`pnpm build:portable` validates the provisional OpenNext/Cloudflare output. Preview/deploy requires a Cloudflare account and explicit owner action; the adapter is not live-verified merely because the build succeeds. See [DEPLOYMENT.md](./DEPLOYMENT.md).

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

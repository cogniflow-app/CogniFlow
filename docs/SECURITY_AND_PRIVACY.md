# Security and privacy baseline

**Scope:** Phase 00 foundation and launch gates  
**Last updated:** 2026-07-14

This document is an engineering control baseline, not a certification or legal opinion. The provider and child-safety decisions in the [product blueprint](./PRODUCT_BLUEPRINT.md) remain mandatory.

## Current data posture

Phase 00 ships public marketing/design-system surfaces, runtime configuration, a non-sensitive health response, local database conventions, and test infrastructure. It does not implement accounts, child profiles, deck content, review history, messages, classes, games, analytics, or AI processing.

The absence of those product records is not permission to weaken the boundary: later phases must add authorization, RLS, retention, export/deletion, and policy tests with the feature that introduces data.

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
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`

Server environment access lives in the server-only config module. Client modules import a separately constructed sanitized projection. CI lint/boundary checks reject client imports of server modules.

Secrets are set in the deployment provider, not committed to `.env*`, `wrangler.jsonc`, fixtures, or docs. Local `.env.local` remains ignored. Secretlint scans tracked project content; the CI examples use clearly non-production placeholders.

## Deployment capability guard

The initial Vercel profile is a 13+ non-commercial beta:

```env
DEPLOYMENT_PROFILE=vercel_beta
ENABLE_CHILD_PROFILES=false
ENABLE_PUBLIC_CHILD_CONTENT=false
ENABLE_FREE_TEXT_GAME_CHAT=false
```

The server capability resolver forces child profiles off for `vercel_beta`, even if a client or environment variable attempts to enable them. This guard requires unit coverage. UI hiding is not the control.

The provisional Cloudflare/OpenNext profile does not enable child features by itself. Under-13 support remains blocked until every item in **Owner launch gate** below is completed and reviewed.

## HTTP and browser controls

Phase 00 configures this application response baseline:

- `Content-Security-Policy` limited to self-hosted application assets, data/blob media where required, localhost development connections, and Supabase HTTP/WebSocket origins;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` disabling camera, geolocation, and microphone;
- `frame-ancestors 'none'` and `X-Frame-Options: DENY` for current routes;
- `Cross-Origin-Opener-Policy: same-origin`;
- no production indexing for preview/developer-only surfaces;
- non-sensitive health output with `Cache-Control: no-store`.

The application does not emit HSTS during local Phase 00 development. HTTPS deployments must add/verify HSTS at the reviewed edge, with a staged rollout before `includeSubDomains` or preload.

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
- Security-definer functions live in `private`, set an explicit/empty `search_path`, authorize internally, and receive minimal execute grants.
- Public views are security-invoker or isolated from exposed schemas.
- Storage objects are private unless an explicit publication relation grants access; private bucket paths are not made public by convention.
- Local client URLs use `127.0.0.1`, but Docker Desktop can publish Supabase ports on all host
  interfaces. Run the stack only on a trusted machine/network, keep the host firewall enabled,
  and never expose those development ports through router forwarding, tunnels, or a public host.

See [DATA_MODEL.md](./DATA_MODEL.md) for the migration and RLS contract.

## Application controls required as features arrive

- Origin/CSRF protection for cookie-authenticated mutations.
- Per-account/IP/device rate limits that do not become an authentication oracle.
- Idempotency for offline reviews, imports, invitations, game answers, and ledger writes.
- File size, decompression, MIME, magic-byte, image re-encoding, and malware-risk controls.
- SSRF defenses for URL imports: approved protocols, DNS/IP checks before and after redirects, time/size limits, and no private-network targets.
- Strict rich-document schema and render-time output encoding; never trust stored HTML.
- Safe template DSL with bounded loops/components and no arbitrary JavaScript or network access.
- Structured logs with correlation IDs and no tokens, private answer text, or child identifiers.
- Append-only or compensating events for review, score, XP/currency, consent, and audit ledgers.
- Short-lived signed URLs and guest tokens, rotation/versioning, and hashed stored token identifiers.

## Privacy principles

- Collect the minimum data required for an implemented user outcome.
- No advertising, sale of data, cross-site tracking, or child session replay.
- First-party operational telemetry is aggregated and excludes raw answer content.
- Age is represented as an age band unless a reviewed consent process genuinely requires more.
- Guests are pseudonymous, short-lived, and not persistently tracked.
- Personal export, deletion, guardian access, consent, and retention workflows ship with the data-owning phase, not as policy-only promises.
- Class membership never grants access to unrelated personal decks or private SRS history.
- Academic accuracy, mastery, scheduling, game score, XP, and currency remain separate records.

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
- provider terms for hosting, database, email, storage, analytics, monitoring, and realtime reviewed;
- production health/logging checked without exposing secrets.

### Additional hard block before under-13 profiles

- qualified legal review of applicable federal and state requirements;
- current terms/DPA review for every processor and hosting profile;
- direct parent notice and privacy notice;
- a selected and implemented verifiable parental-consent method;
- guardian access, consent revocation, export, deletion, and retention workflows tested;
- vendor/subprocessor records and incident responsibilities established;
- child analytics minimized with no session replay or cross-site tracking;
- public child content, external links, direct messages, unrestricted chat, and global leaderboards disabled unless separately reviewed;
- a production deployment other than the prohibited Vercel child profile validated.

Until then, child-capable code paths remain disabled regardless of engineering completeness.

# Data model conventions

**Scope:** Phase 00 database foundation  
**Canonical target:** [PRODUCT_BLUEPRINT.md, section 8](./PRODUCT_BLUEPRINT.md#8-database-model)  
**Last updated:** 2026-07-14

Phase 00 establishes how data will be modeled; it intentionally does not create the identity, content, scheduling, mastery, sharing, class, game, progression, or AI tables owned by later phases. If this document and the blueprint differ on product meaning, the blueprint wins and the mapping must be recorded here when the owning migration is added.

## Schema ownership

| Schema                                  | Purpose                                                                         | API exposure                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `public`                                | Product tables, enums, and safe API-facing functions introduced by later phases | Exposed by Supabase; every table must use RLS before grants/use      |
| `private`                               | Authorization helpers, security-definer functions, internal support objects     | Never added to exposed schemas                                       |
| `extensions`                            | Extension-owned objects when an extension supports a target schema              | Not an application API                                               |
| `auth`, `storage`, and provider schemas | Supabase-managed objects                                                        | Managed through documented Supabase contracts; never edited casually |

Application code must schema-qualify database objects in migrations and privileged functions. Do not depend on a mutable caller `search_path`.

## Phase 00 database objects

Migration `20260714000000_foundation.sql` creates only the reusable foundation:

- the `extensions` schema;
- `citext` for future case-insensitive identifiers;
- `pgcrypto` for maintained Postgres cryptographic/UUID helpers;
- `pg_trgm` for future indexed similarity/search;
- `pgtap` for reproducible SQL assertions;
- the non-exposed `private` schema with usage revoked from `public`, `anon`, and `authenticated`;
- `private.set_updated_at()`, a security-invoker trigger with an empty `search_path` and no execute grant to browser roles.

The pgTAP foundation suite contains 11 assertions covering extension availability, helper security mode/search path, and schema/function privilege denial. Phase 00 creates no application tables, public RPCs, or storage buckets, so there is not yet a product RLS matrix. The executable seed inserts no rows.

## Migration contract

- Migration filenames use the Supabase timestamp prefix and a short purpose, for example `20260714000000_foundation.sql`.
- Once applied in any shared environment, a migration is immutable. Fixes are new migrations.
- Migrations must apply in lexical order to an empty local database and after all previously shipped migrations.
- Destructive changes require an expand/migrate/contract sequence. User data is never deleted to simplify a migration.
- Every object has an explicit owner/grant posture. Revoke broad defaults before granting the minimum required role access.
- SQL functions specify volatility, security mode, and `search_path`. Security-definer functions also validate identity and authorization internally.
- Every RLS policy query must have supporting indexes. Add the index in the same migration as the policy or explain why an existing index covers it.
- Public views use `security_invoker = true` where supported or remain outside exposed schemas.
- Add comments for tables, sensitive columns, non-obvious constraints, and public/RPC contracts.
- A migration that creates an exposed table must include RLS and its first policy matrix tests; a temporarily inaccessible table may enable RLS with no policies.

## Identifier and time conventions

- Prefer client-generated UUIDv7 or another sortable opaque identifier when an event must work offline. Use UUID where the database/provider owns creation.
- Never expose sequential identifiers as access control.
- Store instants as `timestamptz` in UTC. Use `now()` for database receipt/creation time.
- Store the user's IANA time-zone name and study-day cutoff separately where calendar meaning matters.
- Durations are integer milliseconds. Scheduled intervals use the units explicitly named in the column.
- Tables with mutable records use `created_at` and `updated_at`; `updated_at` is maintained consistently by the foundational trigger helper.
- Append-only ledgers and audit events have creation/receipt timestamps but are corrected with compensating rows, not in-place history rewrites.

## Naming and type conventions

- Tables and columns use `snake_case`; TypeScript projections use idiomatic `camelCase` at the service boundary when useful.
- Foreign keys use `<entity>_id`. Constraint and index names describe their table and columns.
- Prefer a constrained Postgres enum for stable, closed database states. Prefer a lookup table or validated text for owner-configurable/open sets.
- Monetary-like game currency, XP, counts, and sequence values are integers. Never use floating point for ledgers.
- Bounded decimal concepts such as mastery or correctness have explicit range checks.
- JSONB is for versioned rich documents, provider payload snapshots, or bounded configuration—not a substitute for relational authorization columns.
- Rich content stores versioned ProseMirror-compatible JSON plus extracted plain text. Stored HTML is never trusted.
- Content and media deduplication use cryptographic hashes with an explicitly documented canonicalization step.
- Soft deletion uses a timestamp/status and a retention policy when history, sync, or restoration requires it. Physical deletion is a reviewed cleanup operation.

## RLS and authorization rules

RLS is defense in depth, not the only authorization layer. Mutations authorize in server/domain code or an atomic RPC and are independently constrained by RLS.

Policy tests added in later phases must cover at least:

- owner/self;
- authorized collaborator and each distinct permission;
- learner-profile guardian/observer boundaries;
- class-scoped access without unrelated personal history;
- public and anonymous projections;
- game guest claims where applicable;
- authenticated but unrelated accounts;
- anonymous and deliberately malicious callers.

Never derive authorization from `raw_user_meta_data` or any client-editable metadata. Stable helper functions in `private` receive the acting account/profile and target resource explicitly.

## Security-definer checklist

Before a security-definer function can ship, verify all of the following:

1. It is required for an atomic or policy-safe boundary; a normal invoker function is insufficient.
2. It lives in `private` or another non-exposed schema.
3. It sets `search_path` to an empty or tightly controlled list and schema-qualifies every object.
4. It validates untrusted inputs and obtains caller identity from trusted database context.
5. It performs its own authorization check before reading or mutating protected rows.
6. Execute privilege is revoked from `public` and granted only to the required roles.
7. pgTAP tests cover success, denial, malformed input, replay/idempotency, and relevant concurrency behavior.

## Generated types and repositories

`pnpm db:types` generates the database contract from the local schema. Generated types are inputs to `packages/database`; UI code does not instantiate a Supabase client or use generated table types as an authorization mechanism.

Repositories/services:

- accept validated domain inputs;
- return explicit public/private projections rather than `select *`;
- distinguish not-found from forbidden without leaking private resource existence to untrusted callers;
- pass request/correlation identifiers to logs without sensitive payloads;
- use transactions or RPCs when multiple writes must be atomic;
- surface optimistic version conflicts rather than silently overwriting state.

## Seed strategy

`supabase/seed.sql` is a real, repeatable entry point but Phase 00 does not fabricate product users or content. Later deterministic fixtures belong in test-only seed files/factories and must not require production credentials. Seed operations are idempotent or run only after an explicit local reset.

## Change checklist for later phases

Every schema-owning phase updates this document with:

- migration filenames and the blueprint-to-table mapping;
- tables, functions, views, and storage buckets introduced;
- RLS matrix and policy-supporting indexes;
- append-only/retention rules;
- generated-type changes;
- exact database test commands and measured results in `IMPLEMENTATION_STATUS.md`.

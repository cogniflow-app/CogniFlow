# Data model conventions

**Scope:** Phase 00 foundation, Phase 01 identity/privacy, and Phase 02 content authoring  
**Canonical target:** [PRODUCT_BLUEPRINT.md, section 8](./PRODUCT_BLUEPRINT.md#8-database-model)  
**Last updated:** 2026-07-16

Phase 00 establishes the modeling conventions. Phase 01 adds the identity, learner-access, consent,
device/session, privacy-job, audit, rate-limit, and guest-identity foundation. Phase 02 adds decks,
notes, stable generated cards, content versions, safe publication snapshots, and private media.
Scheduling, mastery, collaboration/discovery, class, game-room, progression, and AI tables remain
owned by later phases. If this document and the blueprint differ on product meaning, the blueprint
wins and the mapping must be recorded here when the owning migration is added.

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

## Phase 01 identity and privacy migrations

The additive migrations are:

- `20260715000000_identity_privacy_schema.sql` — enums, 14 exposed/RLS-enabled tables, three initial private support tables, constraints, indexes, grants revoked by default, and sensitive-column comments;
- `20260715001000_identity_privacy_functions.sql` — triggers, authorization helpers, transactional RPCs, explicit grants, read policies, and audit/consent append-only enforcement;
- `20260715002000_identity_privacy_hardening.sql` — service-only, proof-consuming deletion cancellation;
- `20260715002500_managed_learner_session_boundary.sql` — verified Auth-session binding for application devices and managed learner sessions, managed-mode RLS isolation, and server-only managed-session resolution;
- `20260715002700_managed_session_idempotency.sql` — initial exact-replay ordering for managed-session creation;
- `20260715002800_learner_credential_hardening.sql` — 16-character family codes, slow salted family-code hashing, and atomic access configuration;
- `20260715002900_profile_session_transaction_hardening.sql` — per-Auth-session advisory locking, exact idempotent replay, and committed invalid-PIN rate-limit counters;
- `20260715003000_school_authorization.sql` — private, short-lived, one-time school-authorization proof ledger and service-only issue/consume boundaries;
- `20260715004000_account_deletion_path.sql` — due-job deletion worker, live Auth-subject separation, minimized account/learner tombstones, and deletion idempotency;
- `20260715005000_authorization_audit_hardening.sql` — stale-JWT denial plus actor-scoped audit idempotency and exact-target replay;
- `20260715006000_atomic_self_context.sql` — authenticated atomic `current_*` account/learner mutations and restored observer projection;
- `20260715006100_guardian_exit_context.sql` — authenticated, proof-consuming managed-mode guardian exit;
- `20260715006200_sign_out_device_revocation.sql` — application-device revocation before Supabase Auth sign-out;
- `20260715006300_runtime_session_boundaries.sql` — RPC-only authentication-profile lookup, verified Auth-session device registration, and an authenticated self-context assertion;
- `20260715006400_child_creation_and_global_signout_authorization.sql` — private child-creation proof ledger, proof-bearing authenticated child creation, current-device sign-out, and separately reauthenticated all-device sign-out;
- `20260715006500_onboarding_and_learner_settings_authorization.sql` — private onboarding proof ledger, proof-bearing onboarding, provisional Auth-identity rejection/minimization, strict child-proof issuance, and explicit learner-preference mutation;
- `20260715006600_child_payload_validation_hardening.sql` — fail-closed validation for missing, null, mistyped, or extra verified-child settings and consent payload fields;
- `20260715006700_school_managed_payload_hardening.sql` — minor-only school-managed learner creation plus closed, privacy-safe settings validation and canonical reconstruction;
- `20260715006800_profile_session_revocation_boundary.sql` — authenticated, self-context, freshly reauthenticated revocation of one account-owned learner-profile session; and
- `20260715006900_hosted_grant_parity.sql` — revocation of hosted platform default `service_role` table/sequence privileges and matching future default privileges so the hosted RPC-only boundary remains identical to local policy.

No Phase 00 migration is edited. No storage bucket or product-content table is introduced.

## Phase 02 content-authoring objects

The additive Phase 02 migrations are:

- `20260716000000_content_schema.sql` — content enums, folders/decks, note-type/template schema,
  notes/fields/tags, generated cards and specialized rows, media/reference rows, immutable
  revisions/versions, content-impact records, frozen publication tables, 17 system note types,
  indexes, RLS enablement, and default-deny grants;
- `20260716001000_content_authorization_and_rpcs.sql` — cycle guards, content authorization
  predicates, read policies, security-invoker public views, actor-derived idempotent/versioned
  mutation RPCs, card reconciliation and version capture, media bucket/policies, publication
  projection, narrow public reads, the Phase 01 due-account-deletion content extension, and exact
  grants;
- `20260716002000_content_integration_hardening.sql` — atomic note-plus-media reconciliation,
  actor-scoped media resolution and exact library counts, bulk tag/move transactions, derived
  publication-only card/media identifiers, field filtering, public Storage-locator separation, and
  narrow frozen-table column grants;
- `20260716003000_content_rpc_parameter_names.sql` — stable named PostgREST parameters for archive,
  restore, and delete lifecycle RPCs;
- `20260716004000_content_guarded_read_volatility.sql` — `VOLATILE` classification for guarded
  library/media reads whose shared device/session authorization takes a row lock;
- `20260716005000_content_security_audit_hardening.sql` — serialized and authorization-aware
  idempotency replay, non-null expected-version enforcement, atomic-only browser note/media writes,
  the intermediate pending-only Storage policy, embedded-media usage triggers/backfill, and orphan
  cleanup on note deletion/version restore;
- `20260716006000_content_note_create_identity.sql` — stable note creation identity derived from
  the required idempotency key before entering the underlying upsert implementation;
- `20260716007000_content_conflict_sqlstate.sql` — typed version-conflict detail retained under
  user-exception SQLSTATE `P0001` instead of retryable serialization-failure SQLSTATE `40001`;
- `20260716008000_content_atomic_authoring_and_media_deletion.sql` — one transaction for a
  copy-on-write custom note-type definition plus the note/media graph, one transaction for deck
  settings plus publication state, removal of direct browser Storage mutation, and a private leased
  queue with service-only claim/complete boundaries for physical Storage deletion;
- `20260716009000_content_receipt_payload_binding.sql` — canonical command fingerprints on legacy
  content and media-registration receipts, transaction-local pending receipts, and fail-closed
  replay for mismatched or pre-binding receipt rows; and
- `20260716010000_content_version_media_graph.sql` — schema-two immutable deck snapshots with the
  exact explicit media-reference graph, atomic graph restoration (including deterministic legacy
  reconstruction), exact same-command version finalization, owner-only media-safe duplication,
  direct-RPC embedded-media validation, and fail-closed remediation of frozen publications that
  contain internal media identities; and
- `20260716011000_content_function_volatility.sql` — hosted-catalog-safe `STABLE` classification
  for deterministic public-payload filtering, public-card ID derivation, and embedded-media graph
  collection helpers whose dependencies are not catalog-immutable.

No earlier migration is edited. Phase 02 introduces no schedule, review, mastery, assignment,
collaboration, game, XP, currency, or AI-job row.

### Blueprint-to-schema mapping

| Blueprint concept            | Phase 02 object(s)                                                                                                               | Important invariant                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nested organization          | `folders`, `folder_items`                                                                                                        | One active folder placement per deck; owner-scoped sibling names; trigger rejects self/descendant cycles; tombstones preserve future sync semantics                |
| Deck ownership and lifecycle | `decks`, `deck_members`                                                                                                          | Owner/member roles are relational; `version` protects metadata and lifecycle writes; `current_version` identifies content history; archive/delete are soft states  |
| Deck taxonomy                | `tags`, `note_tags`                                                                                                              | Tags are deck-scoped and cycle-checked; note links are tombstone-capable                                                                                           |
| Note schema                  | `note_types`, `note_type_fields`, `card_templates`                                                                               | System or account-owned types; ordered unique fields/templates; safe template/CSS checks at both domain and SQL boundaries                                         |
| Authored notes               | `notes`, `note_field_values`                                                                                                     | Versioned note, trusted-derived plain/normalized text, cryptographic content hash, bounded rich JSON and specialized payload, soft deletion                        |
| Generated study units        | `cards`                                                                                                                          | Stable UUID, deterministic `generation_key`, unique note/template/key, independent sibling identity, obsolete cards deactivated instead of repurposed              |
| Choice/cloze content         | `card_choices`, `cloze_definitions`                                                                                              | Stable semantic keys and deterministic positions/ranges                                                                                                            |
| Visual content               | `image_occlusions`, `diagram_hotspots`                                                                                           | Rectangle/ellipse/polygon geometry is normalized to 0–1 coordinates and SQL-validated; labels/aliases provide text fallback                                        |
| Structured-answer content    | `ordering_items`, `list_answer_items`                                                                                            | Stable keys, explicit position, aliases/requiredness, and tombstones                                                                                               |
| Audio/voice/drawing          | `audio_prompts`, `pronunciation_prompts`, `drawing_reference_layers`                                                             | Transcript/language/playback/self-review/vector data only; no cloud speech or automatic drawing score                                                              |
| Sources                      | `source_references`                                                                                                              | Bounded structured citation document and safe HTTP(S) source URL; no trusted imported HTML                                                                         |
| Media                        | `media_assets`, `media_references`, cover/audio/pronunciation/drawing foreign keys, private Storage bucket `lumen-content-media` | Per-owner SHA-256 deduplication, opaque-public-ID path, magic verification, quota, authorization through every usage source, authoritative count, delayed deletion |
| Note history                 | `note_revisions`                                                                                                                 | Immutable per-note-version snapshots and actor/idempotency uniqueness                                                                                              |
| Deck history                 | `deck_versions`                                                                                                                  | Immutable numbered snapshots; restore creates a new version and records `restored_from_version`                                                                    |
| Future schedule choice       | `content_change_impacts`                                                                                                         | Scheduling-neutral classification and affected generation keys; resolution is pending/preserve/relearn/reset, but Phase 02 never updates a schedule                |
| Mutation replay              | `private.content_mutation_receipts`                                                                                              | Account + idempotency UUID uniquely identifies one operation/resource/result; no browser schema access                                                             |
| Public deck projection       | `deck_publications`, `card_publications`, `media_publications`; `published_decks`, `published_cards`, `published_media`          | Frozen current publication only; excludes draft/member/revision/owner UUID data; normal anonymous enumeration is public-only                                       |
| Physical media cleanup       | `private.content_media_deletion_jobs`                                                                                            | Service-only bounded leases and completion; retry backoff is durable; Storage locators never receive a browser/table grant                                         |

The complete authoring and 17-card-type contract is documented in
[CONTENT_AUTHORING.md](./CONTENT_AUTHORING.md).

### Versions, hashes, and reconciliation

`notes.version`, `folders.version`, note-type/template versions, and `decks.version` are positive
optimistic-concurrency values. A new note uses the explicit expected-version sentinel `0`; every
update must send a non-null expected version, and every bulk vector must contain only non-null
versions. Null is never treated as a wildcard. A mutation RPC locks the row and compares the
caller's expected version before changing it. A mismatch raises the structured content-conflict
detail consumed by the application under SQLSTATE `P0001`; it is never a last-write-wins success
or a serialization failure that a database client should retry automatically. When a browser
creation has no note ID yet, the atomic note/media boundary uses its required idempotency UUID as
the note ID, so exact create retries cannot drift to a second identity or inherit stale procedural
branch state.

Custom field/template definitions participate in the same note command. The transaction reuses an
existing account-owned definition only when its canonical definition hash matches; an edited
definition creates a new copy-on-write note type before the note graph is reconciled. Other notes
that still reference the earlier schema are not rewritten. A definition error or any later
note/media failure rolls the entire command back.

`decks.current_version` advances for accepted content changes. `note_revisions` captures the prior
or accepted note state, and `deck_versions` captures a stable deck/content snapshot. Restoring a
historical version appends a new head rather than updating/deleting the old snapshot. The history
repository compares the immutable snapshot with current validated authoring data and exposes
side-by-side card type, prompt, answer, source, and tag values; it does not render stored HTML or
publish private revision payloads.

Domain generation computes a canonical semantic generation key and the database reconciler uses
that key when preserving, reactivating, creating, or deactivating rows. The uniqueness constraint
prevents duplicate active or historical siblings with the same identity. Content hashes are based
on a canonical structured projection; plain text is derived from sanitized JSON at a trusted
boundary and is not accepted as authoritative client HTML.

### Authorization and RLS matrix

All Phase 02 exposed tables enable RLS in the schema-creation transaction. Browser roles receive
no direct insert, update, or delete table grants. Authenticated table reads are policy-scoped:

- folders and media assets require owner identity plus a live self content context;
- decks, notes, fields, tags, cards, specialized rows, sources, and media references require a
  view-capable owner/member role;
- member-list reads are limited to the caller's membership or a deck manager;
- note revisions, deck versions, and content-impact rows require edit permission; and
- system note types/templates are readable in an active content context, while account-owned
  types require owner access.

`private.has_current_content_context()` binds content access to a live account/device and self
learner context. `private.can_view_deck`, `can_edit_deck`, `can_manage_deck`, `can_host_deck`,
`can_study_deck`, and `can_view_note_type` centralize indexed policy predicates. Managed learners
cannot inherit a guardian's creator access.

Authenticated writes use exact-signature `current_*` wrappers for folder, note type, deck,
atomic custom-definition/note/media reconciliation, settings/publication, and version-restore
operations. Each wrapper derives `auth.uid()`, requires current content context, authorizes the
resource, validates the expected version where mutable state exists, consumes an operation-specific
idempotency receipt bound to the complete canonical command, and writes bounded audit metadata.
Receipt lookup first takes an account/idempotency-key transaction advisory lock; a replay must match
the original operation and command fingerprint and still pass the current permission for its stored
resource. The first execution creates a pending receipt in the mutation transaction and completes
it only with the accepted result; rollback removes both the pending receipt and command effects.
Legacy receipts without a trustworthy fingerprint fail closed instead of replaying an unverified
command. The standalone note upsert, media-link, and media-release components have no browser-role
execute grant, so fields,
specialized rows, sources, tags, media links, generated siblings, revision, and version bump cannot
be split across browser transactions. The former composed note/media wrapper is also revoked from
browser roles because it does not resolve a custom definition. Deck metadata/theme submitted with
publish or unpublish commits with the frozen-projection transition in one transaction. The reusable
implementation helpers remain inaccessible to browser roles. `admin_finalize_media_asset()` is
service-only and accepts only the server-verified hash, MIME, magic result, actor, asset, and
idempotency context.

`current_get_library_counts()`, `current_get_deck_media()`, and `current_get_media_asset()` are
declared `VOLATILE` even though they return read projections. Their shared current-context guard
takes a device/session row lock, and PostgREST would otherwise execute a `STABLE` RPC in a read-only
transaction that cannot obtain the lock.

### Public projection

`deck_publications`, `card_publications`, and `media_publications` are publication snapshots, not
views over draft tables. The publish transaction verifies manage permission, expected version,
active cards, verified media, and image alternative text before replacing the snapshot. It copies
only public IDs, sanitized content/template data, creator attribution, license/language/theme,
card-type summaries, safe sources, and referenced media metadata. Unpublish deletes the snapshot.
The public web and embed renderers visibly apply the bounded frozen theme from this projection, so
a later draft theme change cannot alter an existing publication until the next publish transaction.

The `published_*` views are `security_invoker` plus `security_barrier` and enumerate only
`visibility = 'public'`. Anonymous/authenticated exact-resource RPCs can return a requested
`public` or `unlisted` publication by opaque public ID or slug. Published cards use deterministic
publication-only IDs, custom payloads retain only the selected safe template and referenced
fields, and attached draft media IDs are rewritten to opaque media publication IDs. Those narrowly
granted functions expose no internal deck/card/media ID, owner account ID, member row, revision,
mutation receipt, draft hash history, Storage bucket/path, or learner state. A separate
service-only locator function supplies exact Storage coordinates solely to mint short-lived signed
delivery URLs.

### Storage bucket and lifecycle

Migration-owned bucket `lumen-content-media` is private, has a 10 MiB object ceiling, and allows
the supported raster-image/audio MIME set only. Registration additionally enforces 5 MiB images,
10 MiB audio, 50 MiB per owner, safe dimensions, and a lowercase SHA-256 digest. Deduplication is
per owner, but the server-derived object path begins with the asset's separate opaque public UUID
and never contains the owner account UUID. The Route Handler recomputes the digest and validates
magic bytes before the service-only finalizer can mark an asset ready.

Storage policies expose only authorized reads. Browser credentials cannot insert, update, or
delete objects; the validated application route writes the exact hash- and magic-checked buffer
through its server-only client before trusted finalization. Reads require owner/authorized-deck
access or a matching verified public publication.

Explicit `media_references`, active deck covers, audio prompts, pronunciation reference audio, and
drawing reference layers all contribute to `reference_count`. Before cleanup is claimed, triggers
can revive a deleting asset and clear `delete_after`; retiring the last usage schedules the
seven-day deadline. Once any durable deletion job exists, the old asset identity is permanently
fenced because an expired worker may still have a Storage request in flight. The hardening
migration retires stale links for already deleted notes and rebuilds counts from every active usage
source. Note deletion and deck-version restore reconcile both explicit and specialized usages.

New `pending` reservations receive a 24-hour deadline. A known upload failure is compensated into
immediate eligibility, while a crashed or abandoned reservation becomes eligible when that bound
elapses. Physical cleanup is a distinct, durable private job. `admin_claim_due_media_deletions()`
is service-role-only and leases at most 100 due pending, quarantined, or unreferenced assets for
30–900 seconds. It locks each asset and rechecks the deadline, zero count, every
explicit/specialized/cover use, and frozen publication absence before exposing the exact
bucket/path to the worker. `admin_complete_media_deletion()` accepts only the matching lease token.
Success tombstones the asset locator and marks the job complete; provider failure requeues it with
quadratic backoff capped at one day. An expired lease is reclaimable after a crashed worker. A
later upload of identical bytes creates a fresh asset/public ID and Storage path while preserving
the completed tombstone and job. The application worker performs this claim/remove/complete
protocol, but a timestamp or queued job still does not delete bytes until an owner-operated
scheduler invokes and monitors it.

The existing due-account-deletion transaction now activates a private Phase 02 extension during
the guarded `pending_deletion` to `deleted` transition. It withdraws owned publications, revokes
content relationships, soft-deletes and minimizes decks/notes/folders/tags/custom note types,
redacts immutable history snapshots while retaining structural coordinates, removes private
mutation receipts, and marks every owned media asset `deleting` with `delete_after` equal to the
deletion time. This preserves append-only deletion evidence without retaining authored content or
waiting another seven days to make the bytes eligible for the operated Storage cleanup worker.

## Phase 01 identity and privacy model

### Account and learner mapping

| Blueprint concept            | Phase 01 object(s)                                        | Important invariant                                                                                                               |
| ---------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Application account          | `profiles`                                                | One row per eligible non-anonymous `auth.users` row; exact birthday is not stored; an independent account cannot be under 13      |
| Account privacy defaults     | `privacy_preferences`                                     | One row per account; targeted advertising and data sale are constrained false                                                     |
| Overlapping account ability  | `account_capabilities`                                    | Separate `learn`, `create`, `host`, and `teach` rows; user metadata cannot grant them                                             |
| Study identity               | `learner_profiles`                                        | Exactly one immutable-identity `self` profile per account; child and school-managed kinds are distinct                            |
| Learner authorization        | `learner_profile_access`                                  | Role plus explicit permissions; active rows are indexed and revocable                                                             |
| Guardian boundary            | `guardian_relationships`, `consent_records`               | Guardian access also requires an active relationship; consent grants/revocations are append-only                                  |
| Browser/device inventory     | `devices`                                                 | Opaque device ID bound one-to-one to the account's verified Supabase Auth `session_id`; descriptive platform and revocation state |
| Learner switch               | `profile_sessions`, `private.learner_profile_credentials` | Auth-session-bound hashed token; bcrypt PIN and independent bcrypt 16-character family code                                       |
| Privacy request lifecycle    | `privacy_requests`, `data_export_jobs`, `deletion_jobs`   | Durable request/job state; one active deletion job per account                                                                    |
| Sensitive-change evidence    | `audit_events`                                            | Append-only, bounded metadata, server receipt time, actor-scoped correlation-key deduplication                                    |
| Ephemeral game identity      | `guest_sessions`                                          | No email/account requirement; safe nickname, game reference, expiry, and hashed reconnect token only                              |
| Abuse prevention             | `private.rate_limit_buckets`                              | Fixed-window counts keyed by an opaque digest, never a raw network address                                                        |
| Destructive-action proof     | `private.reauthentication_grants`                         | Short-lived, single-purpose, single-use proof digest                                                                              |
| School authorization proof   | `private.school_authorization_proofs`                     | Hashed upstream evidence plus a hashed, at-most-15-minute, single-use creation proof; never a general teach-capability shortcut   |
| Onboarding authorization     | `private.onboarding_authorizations`                       | Hashed, at-most-10-minute, account/Auth-session/payload-bound proof exchanged from the signed age gate and consumed once          |
| Child creation authorization | `private.child_creation_authorizations`                   | Hashed, at-most-10-minute, guardian/Auth-session/payload-bound proof issued only after strict deployment/consent/payload checks   |

### Transactional provisioning

`private.handle_auth_user_created()` runs after eligible `auth.users` inserts and calls `private.provision_account()`. Pre-existing or retried Auth flows converge on the same implementation through the server-only `admin_ensure_account()` adapter boundary. The earlier direct authenticated ensure function is not granted after the managed-session hardening migration.

Provisioning uses transaction advisory locks and conflict-safe inserts to create the account, privacy defaults, all four capability rows, the self learner, and explicit self access. A partial unique index makes a second self learner impossible even under concurrency. Supabase anonymous Auth identities are deliberately skipped; guest games use `guest_sessions` instead of creating persistent profiles.

Onboarding accepts only the `teen` or `adult` age band for an independent account. The final request body does not carry the age band: a signed, short-lived, account-bound onboarding cookie supplies the eligible value after the password/OAuth callback age gate. Before mutation, the server exchanges that cookie and the exact validated profile payload for a fresh random proof through `admin_issue_onboarding_authorization()`. Only the digest is stored, bound to the verified Auth session, eligible age band, canonical payload digest, and a maximum ten-minute lifetime. The authenticated `current_complete_account_onboarding()` RPC recomputes the payload digest and consumes the matching proof once in the same transaction that persists display name, handle, locale, IANA time zone, study-day boundary, goals, theme, motion, serious mode, and reading style. Authorization-critical status, age, and capability values cannot be updated directly from the browser.

An incomplete recent Auth identity without valid signup/onboarding authority is rejected through `admin_reject_provisional_account()`. The service-only boundary accepts only an uncompleted, child-free onboarding profile, revokes its application state, removes the Auth principal, minimizes the account and self learner into opaque tombstones, and records an idempotent audit fact. It cannot be used as a shortcut around the normal deletion-grace workflow for a completed account.

### Authorization and projection model

`private.can_access_learner_profile(account, learner, permission)` checks account/learner state, owner/self rules, unrevoked permission rows, and the additional active relationship required for guardians. Policy-supporting account, learner, role, status, session, and expiry lookups are indexed in the schema migration.

The authenticated role receives RLS-scoped `SELECT` only for:

- its own profile, privacy preferences, capabilities, devices, privacy requests, export jobs, and deletion jobs;
- learner/access/guardian/consent rows permitted by the helper; and
- a column-limited profile-session summary that omits `token_hash`.

`audit_events` and `guest_sessions` have RLS enabled but no client read policy or table grant. No exposed table has an insert/update/delete policy. Account-level mutations use signature-specific authenticated `current_*` RPCs. Each one derives the actor from `auth.uid()`, validates the JWT `session_id` against an unrevoked `devices` row, and holds the per-session managed-mode lock through authorization and mutation. `current_assert_self_context()` exposes only the successful account UUID after the same atomic check; it is used as a route precondition, not as mutation authority. Service-only runtime lookups use `admin_get_authentication_profile_state()` and `admin_register_request_device()` rather than direct reads; the latter verifies the requested session against `auth.sessions` and returns the canonical existing/new device row. The service role deliberately has no broad identity-table `SELECT` grant. Other `admin_*` functions remain implementation/infrastructure boundaries and are not client pass-throughs. The teacher-observer placeholder can call `get_observed_learner_profiles()` for a narrow projection, but managed mode, a missing/revoked device registration, or a non-live account makes the projection empty.

The same session state constrains reads. A live managed-session row restricts RLS to the exact managed learner and hides guardian account, device, consent, provider, privacy, and job rows. This lock intentionally ignores the short study expiry until a guardian performs a proof-consuming exit or another explicit revocation. Current-device sign-out remains available in managed mode so the child-facing browser can terminate its exact session without gaining account settings; all-device sign-out requires self context plus a fresh `security_change` reauthentication proof. `private.is_current_auth_session_revoked()` also denies a stale JWT when the account is deleted/suspended, its Auth subject is gone, or its exact Auth session has no active application device.

From self context, `current_revoke_profile_session()` can revoke one selected account-owned profile-session row after consuming a fresh `security_change` proof. The wrapper locks the selected row and its target Auth-session advisory boundary before delegating to `admin_revoke_profile_session()`. It cannot target another account, does not grant browser access to the actor-selecting implementation function, and leaves the containing device and unrelated learner sessions active.

### Credential and token storage

| Credential/context        | Raw value location                                                  | Stored database representation                             | Lifetime/control                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Supabase Auth session     | Supabase SSR HttpOnly cookies                                       | Supabase-managed Auth state plus verified JWT `session_id` | Refreshed best-effort by Edge middleware; account and session claims are verified at protected boundaries                         |
| Device identifier         | HttpOnly, SameSite=Lax cookie                                       | UUID device primary key plus Auth `session_id`             | One active registration per account/Auth session; revocation immediately denies that access token and linked learner sessions     |
| Learner-profile session   | HttpOnly, SameSite=Strict cookie                                    | 32-byte SHA-256 digest plus Auth `session_id`              | Study access expires within 30 minutes; the unrevoked managed-mode lock remains until guardian exit or explicit revocation        |
| Learner PIN               | Submitted only to the guarded switch route/RPC                      | Cost-12 bcrypt hash in `private`                           | Rotating credentials revoke existing profile sessions                                                                             |
| Family code               | Returned once/entered only in the guardian-managed flow             | Cost-12 salted bcrypt hash in `private`                    | 16 unambiguous characters (80 random bits); legacy 32-byte SHA values are read only until guardian rotation                       |
| Re-authentication proof   | Held inside one server mutation                                     | 32-byte digest in `private`                                | Maximum 10 minutes, purpose-scoped, single-use for the destructive/security action that consumes it                               |
| Onboarding proof          | Generated and consumed inside one onboarding Route Handler          | 32-byte proof and canonical payload digests in `private`   | Maximum 10 minutes; account/Auth-session/age/payload-bound; finalized once and proof digest cleared                               |
| Child-creation proof      | Generated and consumed inside one guardian Route Handler            | 32-byte proof and canonical payload digests in `private`   | Maximum 10 minutes; guardian/Auth-session/payload-bound; finalized once with the created learner ID and proof digest cleared      |
| Guest reconnect token     | Signed token in an HttpOnly, SameSite=Strict `/` cookie             | 32-byte SHA-256 digest                                     | No longer than room expiry or configured guest retention; no persistent XP/account linkage                                        |
| Rate-limit subject        | Derived transiently from request context or authorized resource ID  | 32-byte digest in `private.rate_limit_buckets`             | Server request contexts use HMAC; internal per-profile/account buckets use SHA-256(UUID); raw network addresses are never written |
| Pending password recovery | Signed HttpOnly, SameSite=Lax cookie issued before requesting email | Not stored in product tables                               | At most 15 minutes; binds safe return path, callback nonce hash, and normalized-email HMAC; consumed only by callback/confirm     |
| Password-recovery intent  | Signed HttpOnly, SameSite=Strict recovery cookie                    | Not stored in product tables                               | At most ten minutes; account-bound and issued only after pending state matches the recovered Supabase Auth session                |

Hashing a token is not a substitute for issuing high entropy. Routes use cryptographically random opaque values, fixed cookie paths, production-classified secure cookies, and bounded expiry. Production configuration requires HTTPS application and Supabase origins. Secret/service credentials never enter these tables or browser bundles.

### Consent, audit, export, and deletion lifecycle

`consent_records` stores a policy version, bounded scope, verification method, optional external evidence reference, and idempotency key. Revocation inserts a new row pointing to the original grant. The database trigger rejects any update or delete, including a privileged direct rewrite. Revoking guardian/child consent also revokes guardian access and active learner-profile sessions; a child with no remaining active guardian is locked.

Child creation uses two distinct authorities and is available only in local/test runtimes; every production runtime forces the managed-profile capability off until an independent opaque child-facing identity exists. The server first enforces that runtime gate and obtains `local_test` or nonproduction external-verifier evidence. It then calls the strict `admin_issue_verified_child_creation_authorization()` wrapper with the complete canonical payload and an independent proof digest. The wrapper accepts only child consent, the exact minimized consent scope, a closed seven-key learner-settings object, bounded evidence/pseudonym/avatar values, a live guardian Auth session/device, and no managed-session lock. Missing keys, JSON null, wrong types, extra keys, malformed scope, and expired/oversized proof state fail closed. The authenticated `current_create_child_learner_configured()` consumes the session/payload-bound authorization once and atomically creates the learner, access, guardian relationship, and consent row. Lower-level child issuers/creators are not service-callable.

Managed learner edits no longer accept an arbitrary settings document. `current_update_learner_profile()` accepts only display/pseudonym/avatar plus theme, reduced-motion, serious-mode, and reading-style fields, reconstructs the stored settings server-side, and preserves the mandatory minimized analytics, private-content, and disabled-social values.

`audit_events` is also append-only. Specific RPCs write privacy-minimized accepted facts through `private.write_audit_event()`. Metadata is constrained to a JSON object of at most 16 KiB. Idempotency is unique by event type, complete actor identity, and correlation ID with null actor columns treated consistently; a replay returns the original row only when its target also matches.

An export request creates a `privacy_requests` row and a queued `data_export_jobs` row. Authenticated `current_request_account_deletion()` atomically verifies self context, consumes recent re-authentication evidence through its implementation boundary, applies the configured grace period, creates the request and queued job, marks the account `pending_deletion`, and revokes profile sessions. `current_cancel_account_deletion()` performs the equivalent atomic self-context/proof check, refuses cancellation at or after `execute_after`, restores active account state, and appends its own audit event.

`admin_process_account_deletion()` is the service-only, idempotent due-job worker transaction. It requires an elapsed grace period and pending account, then removes the Supabase Auth principal, provider identities/Auth sessions, devices, learner credentials, re-authentication grants, and profile sessions; revokes capabilities/access/relationships and active school proofs; appends consent revocations; cancels open exports/requests; minimizes account/learner fields; and completes the job/request. `profiles.id` remains a durable opaque application identity while `auth_subject_id` becomes null and a separate deletion tombstone/receipt ID is recorded. This preserves append-only audit and consent referential integrity without preserving a live login or mutable personal profile. Auth deletion outside this transaction is rejected, and a deleted Auth subject cannot be recreated.

The worker boundary is implemented, but no scheduler is deployed. The owner must invoke and monitor it after the configured 1–90 day grace period. Archive assembly and expiring download storage remain later portability work. Future data-owning phases must extend the deletion transaction/worker for their tables before promotion. Audit/export/guest retention values likewise require scheduled cleanup or completion workers; configuration alone does not delete records.

### School-managed learner proof boundary

The default `teach` capability does not directly create a school-managed learner. A trusted service adapter must first verify provider/school evidence outside Postgres and call `admin_issue_school_authorization()` with only a proof digest and evidence-reference digest. The private proof lasts at most 15 minutes, is immutable except for one terminal consume/revoke transition, and is scoped to actor and owner accounts. `admin_create_school_managed_learner()` atomically consumes the matching unexpired proof and records the resulting learner ID; exact idempotent replay returns that learner, while reuse, expiry, actor/owner mismatch, or raw proof absence is denied. Creation accepts only `under_13` or `teen`, bounded name/pseudonym/avatar fields, and a closed seven-key settings object. Analytics must be `essential_only`, public content and social interactions must be false, and theme/reading-style/boolean values must use their exact allowed types and values. Missing keys, JSON null, wrong types, extra keys, unsafe values, `adult`, and `unknown` fail closed. The function reconstructs the persisted settings document from validated scalars rather than copying caller JSON. Raw provider evidence and bearer credentials never enter the table.

### Guest identity and cleanup

`admin_create_guest_session()` is service-only and may run only after an injected room adapter accepts the code and room policy. The Phase 01 production adapter intentionally returns no room; deterministic fixture rooms live only in tests. Unavailable, expired, locked, full, and unknown rooms collapse to a non-enumerating public result.

The guest row contains a safe nickname, opaque game reference, reconnect-token digest, status, and expiry—no email, account profile, device fingerprint, XP, or currency. `redeem_guest_session()` accepts only the reconnect digest and can return the bounded guest projection to anonymous/authenticated callers. `admin_purge_expired_guest_sessions()` can remove expired/revoked guests and expired rate-limit buckets, but Phase 01 does not deploy a scheduler; the owning game/operations phase must schedule and monitor it.

## Phase 01 RPC ownership

The public schema uses three privilege groups:

- **Authenticated atomic self-context:** proof-consuming onboarding; profile/privacy updates; export/deletion request and deletion cancellation; proof-consuming child creation; explicit learner/access updates; device/consent revocation; one-session profile revocation; guardian exit; current-device sign-out; reauthenticated all-device sign-out; safe observed-learner projection; and reconnect-token redemption. Every account mutation derives `auth.uid()` and, where applicable, validates/locks the exact Auth-session/device context in the transaction.
- **Server/service-only administration and infrastructure:** Auth-trigger/backfill provisioning, RPC-only authentication-profile lookup and Auth-session device registration, profile-session creation/resolution, onboarding/verified-child authorization issuance, provisional-account rejection, re-authentication-grant issuance, school authorization/profile creation, due deletion processing, shared rate limiting, guest creation/purge, and generic audit writing. Actor-accepting implementation functions are not browser entry points, and service role is not granted general identity-table reads.
- **Private helpers:** provisioning, learner authorization, capability checks, credential verification, audit insertion, and rate-limit mutation. Browser roles have no `private` schema usage.

Every privileged function fixes an empty `search_path`, schema-qualifies referenced objects, and receives only its explicitly granted role. Self-service and account/learner administrative functions validate their own actor/resource authorization. Service-infrastructure functions validate bounded state while relying on the server-only adapter and service-role grant for caller authority. [ADR-0012](./ARCHITECTURE_DECISIONS.md#adr-0012-narrow-public-rpc-entry-points-for-postgrest) documents why the smallest callable transaction wrappers live in `public` while reusable policy/credential helpers remain in `private`.

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

The Phase 01 matrix covers anonymous visitors, authenticated self/guardian, unrelated accounts, attacker metadata/tampered learner IDs, teacher-observer projection/revocation, child-profile session expiry/revocation, guest redemption, and the service/admin path. Later phases extend it for at least:

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
2. Its implementation lives in `private` or another non-exposed schema, unless it is the smallest intentionally callable PostgREST transaction wrapper allowed by ADR-0012.
3. It sets `search_path` to an empty or tightly controlled list and schema-qualifies every object.
4. It validates untrusted inputs and obtains self-service identity from trusted database context; service-only infrastructure input has an explicit server-adapter precondition.
5. It performs its own actor/resource authorization before account/learner access or mutation. A service-infrastructure wrapper that has no end-user actor is granted only to `service_role` and must not accept unsanitized client payloads.
6. Execute privilege is revoked from `public` and granted only to the required roles.
7. pgTAP tests cover success, denial, malformed input, replay/idempotency, and relevant concurrency behavior.

## Generated types and repositories

`pnpm db:types` generates the database contract from the local schema. `pnpm db:types:check` regenerates to a temporary location and fails when committed types drift from migrations. Generated types are inputs to `packages/database`; UI code does not instantiate a Supabase client or use generated table types as an authorization mechanism.

Repositories/services:

- accept validated domain inputs;
- return explicit public/private projections rather than `select *`;
- distinguish not-found from forbidden without leaking private resource existence to untrusted callers;
- pass request/correlation identifiers to logs without sensitive payloads;
- use transactions or RPCs when multiple writes must be atomic;
- surface optimistic version conflicts rather than silently overwriting state.

## Seed strategy

`supabase/seed.sql` is a real, repeatable entry point but does not fabricate product users, children, consent, guests, or content. Phase 01 actor matrices create transaction-scoped test users and rows inside pgTAP files. Browser/unit fixture rooms are injected through a test-only adapter and cannot be discovered by the production room adapter. Fixtures never require production credentials.

## Change checklist for later phases

Every schema-owning phase updates this document with:

- migration filenames and the blueprint-to-table mapping;
- tables, functions, views, and storage buckets introduced;
- RLS matrix and policy-supporting indexes;
- append-only/retention rules;
- generated-type changes;
- exact database test commands and measured results in `IMPLEMENTATION_STATUS.md`.

## Phase 03 learner scheduling model

Phase 03 migrations `20260721000000` through `20260722001000` add a scheduling graph that refers to
Phase 02 generated cards without changing their authored identity. `srs_presets` and immutable
`srs_preset_versions` belong to a learner profile; `deck_srs_settings` selects one preset per
learner/deck. `card_schedules` has exactly one current row per learner profile and generated card.
Its state, due time, version, FSRS memory values or SM-2 legacy ease, suspension, burial, star,
leech, due order, and content version are learner-private. Absence means New, so existing cards need
no destructive backfill.

`review_logs` is immutable canonical evidence with a client review UUID, complete idempotency
fingerprint, rating/source/timing/study day, engine and preset versions, and before/after schedules.
`private.srs_review_receipts` is append-only replay state keyed by learner and idempotency identity;
it binds the complete raw request hash to the exact canonical API result so an authorized lost-
response retry succeeds before mutable session or schedule preflight. Browser roles and direct
service-role table access are denied; only fixed-search-path service RPCs may read or append it.
`srs_undo_events` compensates without deleting a log. `study_sessions` and ordered
`study_session_items` preserve a temporary deterministic queue and resume point; they do not own
the schedule. `daily_study_counters` stores bounded per-study-day aggregates. `study_filters` stores
versioned validated private queue definitions. `srs_schedule_operations` records audited manual,
bulk, content-decision, rebuild, forget, and migration operations. `srs_optimization_jobs` stores
disabled-by-default optimizer metadata and never blocks review.

Every learner/queue/timeline/session predicate has a supporting index. RLS is enabled on all
exposed objects. Browser roles have no direct write path; service functions derive the actor and
active learner, use explicit search paths, and receive exact execute grants. Account deletion
detaches or pseudonymizes identifiers and descriptive values while preserving minimized immutable
evidence required by the established audit model. Full field semantics and the canonical mutation
are in [SRS_REVIEW_ENGINE.md](./SRS_REVIEW_ENGINE.md). Migration `20260721013000` replaces
row-by-row content-read authorization with fixed-search-path set-returning helpers for the current
registered session's viewable deck, note, and card IDs. The helpers preserve the prior owner/member,
deck-status, learner, and session-revocation semantics while allowing PostgreSQL to evaluate each
authorized set once for large queue, dashboard, and statistics reads. Migration `20260722000000`
adds the exact-response replay receipt and service-only preflight/v2 commit wrapper without changing
existing canonical evidence. Migration `20260722001000` aligns the replay function's volatility
with its runtime authorization helper.

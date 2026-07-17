# Event protocol template

**Scope:** Versioning/safety contract, Phase 01 identity audit facts, and Phase 02 content commands  
**Implemented product event catalogs:** Phase 01 identity/privacy and Phase 02 content audit catalogs  
**Last updated:** 2026-07-16

This document defines the template later phases must use for offline outbox events, realtime game/collaboration messages, immutable ledgers, and integration events. Phase 01 adds a private server-authored audit catalog; it is not a realtime transport or client event bus. Each owning phase must add its concrete event schemas, authorization rules, retention policy, and compatibility tests before exposing a producer.

## Commands are not facts

A client submits a **command** such as “record this review” or “submit this answer.” Commands are untrusted requests and can be rejected. A server/database boundary emits or persists an **event** only after validation, authorization, idempotency checks, and authoritative state transition.

Do not name a client request as though it were already accepted. For example:

```text
review.apply.requested     command
review.applied             accepted canonical event
game.answer.submit         command
game.answer.accepted       authoritative event
game.answer.rejected       authoritative rejection event
```

## Canonical envelope

Concrete protocols may use compact field names on a measured hot path, but their shared schema must represent this envelope:

```ts
interface EventEnvelope<TType extends string, TPayload> {
  protocolVersion: number;
  eventId: string;
  eventType: TType;
  occurredAt: string;
  receivedAt?: string;
  aggregate: {
    type: string;
    id: string;
    version?: number;
  };
  actor: {
    type: "account" | "learner_profile" | "guest" | "system";
    id?: string;
  };
  idempotencyKey?: string;
  correlationId: string;
  causationId?: string;
  sequence?: number;
  payload: TPayload;
}
```

Rules:

- `eventId` is globally unique and client-generated when the event must survive offline replay.
- `protocolVersion` is an integer validated before payload parsing.
- `eventType` is a stable, namespaced, past-tense fact for accepted events.
- timestamps are RFC 3339/ISO 8601 UTC strings over the wire and `timestamptz` in Postgres.
- `receivedAt` is authoritative server receipt time; client `occurredAt` is retained only after reasonableness validation.
- `aggregate.version` is the optimistic/causal version when ordering matters.
- `sequence` is assigned by the authority for ordered streams such as games; clients never choose it.
- `correlationId` follows one user-visible operation. `causationId` points to the command/event that directly caused this event.
- payload schemas reject unknown dangerous shapes and apply explicit size/depth/list limits.

## Versioning policy

Protocol versions are independent from database migration numbers and game-mode versions.

- Additive optional fields that old consumers safely ignore can remain in the current protocol version.
- Removing or renaming a field, changing meaning/units, changing requiredness, or changing ordering semantics requires a new protocol version.
- Producers emit one documented version. A compatibility adapter may accept the immediately preceding version during a bounded rollout.
- Persist the version alongside durable events so replay uses the historical decoder.
- Never reinterpret an old payload using only the newest schema.
- Unknown event types or unsupported versions are rejected/quarantined with a safe diagnostic; they are never silently treated as success.

Each concrete protocol records:

```text
Protocol name:
Owning package/phase:
Current version:
Previous accepted versions:
Producer authority:
Consumers:
Transport:
Ordering scope:
Delivery semantics:
Idempotency key:
Retention:
PII classification:
Authorization rule:
Schema source:
```

## Delivery, ordering, and replay

Assume delivery is at least once. Exactly-once claims require database-enforced evidence, not a client flag.

- Deduplicate at the authoritative mutation boundary using event/command ID plus the appropriate tenant or aggregate scope.
- A duplicate returns the original stable result when practical; it does not apply side effects again.
- Order only within the smallest required aggregate/stream. Do not invent a global order.
- Detect a stale causal version before mutation. Rebuild or show a conflict according to the owning domain; never discard an event silently.
- Realtime delivery is a notification path, not durable truth. Reconnect fetches an authorized snapshot and events after the last accepted sequence.
- Replay must be deterministic from the same trusted snapshot, event stream, schema versions, and seeded PRNG where used.
- Compensation/undo is a new event that references the original; immutable logs are not deleted.

## Authorization and privacy

Every ingress—Route Handler, RPC, Broadcast message, WebSocket, import file, or background job—is untrusted.

- Authenticate the transport and authorize the actor for the aggregate on every command.
- Realtime channels are private and scoped to the active resource. Channel membership alone is not mutation authority.
- Server timestamps, scores, ledger deltas, permissions, and authoritative sequences are server-owned.
- Do not include secrets, access tokens, private storage paths, raw authorization metadata, or provider credentials.
- Use the smallest public projection for each viewer; a host, player, spectator, and anonymous observer may receive different payloads.
- Avoid raw free-form child content in events. When it is required for an approved feature, define retention and redaction explicitly.
- Third-party telemetry receives identifiers and summaries only after privacy review; raw answers are excluded.

## Error response template

Rejected commands return a stable machine code and safe user-facing detail without leaking protected resource existence or internals:

```ts
interface ProtocolError {
  code:
    | "INVALID_INPUT"
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "CONFLICT"
    | "DUPLICATE"
    | "RATE_LIMITED"
    | "UNSUPPORTED_VERSION"
    | "INTERNAL";
  message: string;
  correlationId: string;
  retryable: boolean;
  retryAfterMs?: number;
  fieldErrors?: Record<string, string[]>;
}
```

Internal logs may contain a structured cause and stack under the correlation ID, but not secrets or unnecessarily retained answer text.

## Test contract for every concrete protocol

- runtime schema accepts a valid envelope and rejects malformed/oversized payloads;
- unsupported versions and unknown event types fail safely;
- actor/permission matrix covers allowed and attacker cases;
- duplicate IDs do not double-apply;
- stale versions surface a conflict;
- deterministic replay produces the same final state;
- public/viewer projections exclude private fields;
- sequence is monotonic within its documented scope;
- a power-up or score event cannot change academic accuracy, mastery, or FSRS state;
- retention/cleanup preserves required aggregates and audit evidence.

## Phase 01 identity and privacy audit facts

**Protocol name:** identity/privacy sensitive-change audit  
**Owning package/phase:** database/server adapters, Phase 01  
**Current version:** event names and bounded metadata defined by the Phase 01 migrations; no client wire version  
**Producer authority:** specific security-definer RPCs, or the service-only generic audit RPC  
**Consumers:** future owner security/privacy operations only; no authenticated/anonymous table read  
**Transport:** transaction-local Postgres insert  
**Ordering scope:** authoritative `received_at`; no global business ordering claim  
**Delivery semantics:** atomic with the accepted mutation where the specific RPC writes it  
**Idempotency key:** unique event type + complete actor identity + correlation ID (`NULLS NOT DISTINCT`)
**Retention:** configured owner policy; cleanup worker not deployed in Phase 01  
**PII classification:** actor/target opaque IDs and privacy-minimized metadata; no credentials or raw token values  
**Authorization rule:** browser roles cannot insert/read; service role reaches only audited server boundaries  
**Schema source:** `public.audit_events` and `private.write_audit_event()`

The row stores an opaque event ID, actor type (`account`, `learner_profile`, `guest`, or `system`), nullable actor identifiers, stable event/target types, optional target ID, correlation ID, bounded JSON metadata, and server receipt time. Metadata must be an object no larger than 16 KiB. An append-only trigger rejects update/delete. Idempotency is scoped to event type, actor type, all nullable actor identifiers, and correlation ID; null actor columns compare consistently. A retry returns the original fact only when the original target type and ID also match. This permits different actors to reuse an independently generated correlation UUID without colliding and rejects a same-actor replay aimed at another target.

Accepted event names are:

| Area         | Event names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account      | `account.provisioned`, `account.onboarding_authorization_issued`, `account.onboarding_completed`, `account.provisional_identity_rejected`, `account.profile_updated`, `account.privacy_preferences_updated`, `account.device_registered`, `account.device_revoked`, `account.auth_devices_signed_out`, `account.reauthentication_verified`                                                                                                                                                     |
| Learner      | `learner.child_creation_authorization_issued`, `learner.child_creation_authorization_consumed`, `learner.child_profile_created`, `learner.child_profile_configured`, `learner.school_authorization_issued`, `learner.school_profile_created`, `learner.profile_updated`, `learner.access_granted`, `learner.access_revoked`, `learner.credentials_rotated`, `learner.profile_access_configured`, `learner.profile_session_created`, `learner.profile_session_revoked`, `learner.guardian_exit` |
| Consent      | `consent.granted`, `consent.revoked`                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Privacy jobs | `privacy.export_requested`, `privacy.deletion_requested`, `privacy.deletion_cancelled`, `privacy.account_deletion_completed`                                                                                                                                                                                                                                                                                                                                                                   |
| Guest        | `guest.session_created`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

Specific account/learner RPCs assemble their own privacy-minimized metadata. The generic audit writer accepts bounded actor, target, and metadata fields only from a validated service-role adapter; browser roles cannot execute it, and a server route must never forward an arbitrary client payload into it. Neither path may attach an Auth metadata role, plaintext PIN/family code, profile/guest token, password, email-link token, raw network address, or Supabase credential. Guest-session audit IDs deliberately have no foreign key to the ephemeral guest row, so purge retains the opaque historical ID without rewriting the append-only audit fact.

`account.auth_devices_signed_out` distinguishes `scope: "current"` from `scope: "all"` in bounded metadata. Current scope is accepted for the exact JWT-bound application device even during managed mode; all scope requires self context and consumes a fresh `security_change` reauthentication proof. The fact is written only after the corresponding application device/profile sessions are revoked in the same transaction. Supabase provider sign-out happens afterward and is not represented as though it were the database authority.

`learner.profile_session_revoked` also covers the self-context, password-reauthenticated revocation of one selected account-owned learner session. The accepted transaction records the selected session target once, leaves the containing application device and unrelated sessions active, and never includes the password or proof digest in metadata. An ownership mismatch or consumed/missing reauthentication proof produces no accepted audit fact.

`consent_records` is a separate append-only legal/authorization evidence ledger, not generic audit metadata. A revocation is a new row with `prior_consent_record_id`; the original grant is never rewritten. Privacy requests and export/deletion jobs are mutable workflow state, not past-tense event streams. The implemented deletion-worker transaction appends `privacy.account_deletion_completed` when a due job reaches its tombstoned terminal state. Future export assembly and any future status-owning worker must add equivalent accepted transition facts; no scheduler is deployed by Phase 01.

`private.school_authorization_proofs` is another specialized authorization ledger rather than a client event stream. A service adapter records only proof/evidence digests after upstream verification, and the database permits one terminal consume or approved revoke transition. Issuance and successful learner creation are audited, but the raw school/provider evidence, bearer proof, and family/PIN credentials never enter audit metadata.

The school-profile creation fact is emitted only after the consumer accepts a minor age band and reconstructs the canonical seven-key privacy-safe learner settings document. Rejected adult/unknown age bands and missing, null, mistyped, extra, or unsafe settings do not consume the proof or emit `learner.school_profile_created`.

`private.onboarding_authorizations` and `private.child_creation_authorizations` are short-lived command-authorization ledgers, not login sessions or client event streams. Each service-issued row binds a random proof digest and canonical payload digest to the account, exact verified Auth session, issue idempotency key, and an expiry no more than ten minutes away. The authenticated consumer recomputes the payload digest, obtains an advisory/row lock, and either returns the stable prior result for an exact replay or consumes the proof once. Finalization clears the proof digest and a trigger prevents later changes to identity, payload, expiry, or terminal state. Child authorization also records the created learner ID.

The signed onboarding cookie and consent-verifier response are inputs to proof issuance; neither is written to these ledgers or accepted directly by the mutation RPC. The strict verified-child issuer accepts only the exact minimized consent scope and closed settings schema, including all required keys with correct JSON types and no extras. The lower-level child issuer/creator is not service-callable. Audit facts record issuance/consumption IDs and bounded age/target context, never the raw proof, payload digest, verifier credential, or guardian bearer token.

## Phase 02 content mutation and audit facts

**Protocol name:** content-authoring commands and accepted audit facts  
**Owning package/phase:** domain/server/database, Phase 02  
**Current version:** operation names and payload contracts defined by the Phase 02 migrations; no offline wire protocol yet  
**Producer authority:** authenticated `current_*` content transactions and the service-only media finalizer  
**Consumers:** creator UI conflict/replay handling; future owner security/content operations  
**Transport:** bounded same-origin Route Handler input followed by a transaction-local Postgres RPC  
**Ordering scope:** positive resource version and deck content-version within the affected resource  
**Delivery semantics:** at least once from the client; exactly-once accepted effect per account/idempotency key in the database  
**Idempotency key:** client-generated UUID scoped to the authenticated account and bound by the database to the exact operation plus canonical command  
**Retention:** mutation receipts are operational replay state; note/deck revisions are durable content history; the physical-media worker is implemented but its schedule is not deployed  
**PII classification:** account/resource opaque IDs and bounded content metadata; audit facts exclude authored field/media bytes  
**Authorization rule:** self learner + live Auth-session device + resource permission + optimistic version where applicable  
**Schema source:** content input/domain schemas, `private.content_mutation_receipts`, immutable revision tables, and `public.audit_events`

A content Route Handler receives a command, not an accepted fact. It validates the request body,
same-origin context, active self learner, current device-bound Auth session, card/rich-document
schema, and resource identifiers. The RPC repeats the authoritative actor/resource check, obtains a
row/advisory lock as required, and compares an explicit expected version. New-note creation uses
the sentinel `0` at the database boundary: the browser's null creation marker is mapped to `0` by
the Route Handler. When no note ID exists yet, the atomic note/media boundary derives that stable
ID from the command's required idempotency UUID. Null update versions and null bulk-vector elements
are invalid rather than wildcard versions.

Private receipt lookup serializes the account/idempotency-key pair with a transaction advisory lock
before checking replay state. The first execution inserts a transaction-local pending receipt bound
to a hash of the complete canonical command, then completes it with the accepted result in the same
transaction. A successful exact replay returns that stable resource/result and does not create a
second deck, note, version, media reference, or publication, but only after matching both operation
and command fingerprint and rechecking the permission required for the stored resource. A changed
payload under the same key and a legacy receipt without a trustworthy binding fail closed.
Concurrent retries therefore converge, and revoking a collaborator also revokes their ability to
replay an old accepted receipt.

The interactive client also treats delivery as at least once. It fingerprints a logical
operation/payload and retains one UUID after a network or explicitly retryable failure, when the
accepted outcome may be unknown. Success, a definitive nonretryable response, or an edited payload
retires that pending entry. This client behavior makes the database receipt reachable on an exact
retry; it does not replace server deduplication or authorize a command.

One account cannot reuse an idempotency key for a different operation or edited command. A version
mismatch returns an actionable conflict containing resource type/ID and expected/actual version
under user-exception SQLSTATE `P0001`, not serialization-failure `40001`, so transport/database
clients do not automatically repeat a known-stale command. The browser can invoke only the
definition-aware atomic note/media command: a copy-on-write custom field/template definition,
fields, specialized rows, sources, tags, media links, sibling reconciliation, revision,
deck-version bump, and impact either all commit or all roll back. Deck settings submitted with
publish/unpublish likewise share the publication transaction. Note and deck revision rows are
immutable accepted snapshots, not commands. A version restore appends a new head and audit fact
instead of rewriting historical events. Schema-two versions include the exact explicit media graph;
restore preflights the entire snapshot, recreates that graph and specialized usage atomically, and
reconciles exact counts/deletion fences. A legacy schema-one restore deterministically reconstructs
only links proven by the immutable embedded-media payload. Cross-deck note identity collisions fail
without changing either deck.

Accepted Phase 02 audit facts are:

| Area                 | Event names                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Folder               | `content.folder_created`, `content.folder_updated`, `content.folder_deleted`                                                                                                                                                               |
| Note type            | `content.note_type_created`, `content.note_type_updated`                                                                                                                                                                                   |
| Deck                 | `content.deck_created`, `content.deck_updated`, `content.deck_duplicated`, `content.deck_archived`, `content.deck_restored`, `content.deck_deleted`, `content.deck_published`, `content.deck_unpublished`, `content.deck_version_restored` |
| Note/card generation | `content.note_created`, `content.note_updated`, `content.note_deleted`, `content.note_media_reconciled`, `content.notes_bulk_tagged`, `content.notes_bulk_moved`                                                                           |
| Media                | `content.media_registered`, `content.media_verified`, `content.media_quarantined`, `content.media_linked`, `content.media_released`                                                                                                        |

Audit metadata is deliberately small: lifecycle/visibility/version/card-count, deck association, or
media kind/byte size/status as appropriate. It never includes rich documents, template source,
field text, Storage object bytes, signed URLs, raw hash claims, transcripts, bearer credentials, or
future learner schedule. Media verification and quarantine are emitted only after the server-held
finalizer compares detected MIME/hash/magic state with the owner-bound registered asset.

Card-generation reconciliation is deterministic from sanitized authoring data, current stored
generation identities, and the next content version. It creates no random semantic key and reads
no clock/provider state. The transaction preserves/reactivates matching identities, creates only
new semantic siblings, and deactivates obsolete siblings. A duplicate/mismatched existing identity
is a rejected command, not an event that silently changes card meaning.

Phase 02 does not define an offline content-operation envelope. Phase 05 must wrap these same
idempotency/version contracts in its outbox protocol and add merge/conflict/replay retention rules;
it may not weaken the database command boundary.

## Catalog ownership

Later phases add sections here rather than creating undocumented payloads:

| Protocol                | Owning phase          | Status          |
| ----------------------- | --------------------- | --------------- |
| Identity/privacy audit  | Phase 01              | Implemented     |
| Content authoring/audit | Phase 02              | Implemented     |
| Review/offline sync     | Phase 03 and Phase 05 | Not implemented |
| Collaboration           | Phase 07              | Not implemented |
| Assignment/reporting    | Phase 08              | Not implemented |
| Realtime games          | Phase 09              | Not implemented |
| XP/currency/progression | Phase 10              | Not implemented |
| AI jobs                 | Phase 11              | Not implemented |

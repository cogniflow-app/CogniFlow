# Event protocol template

**Scope:** Versioning and safety contract established in Phase 00  
**Implemented product event catalogs:** None in Phase 00  
**Last updated:** 2026-07-14

This document defines the template later phases must use for offline outbox events, realtime game/collaboration messages, immutable ledgers, and integration events. It does not claim those systems exist yet. Each owning phase must add its concrete event schemas, authorization rules, retention policy, and compatibility tests before exposing a producer.

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

## Catalog ownership

The catalog is intentionally empty in Phase 00. Later phases add sections here rather than creating undocumented payloads:

| Protocol                | Owning phase          | Status          |
| ----------------------- | --------------------- | --------------- |
| Review/offline sync     | Phase 03 and Phase 05 | Not implemented |
| Collaboration           | Phase 07              | Not implemented |
| Assignment/reporting    | Phase 08              | Not implemented |
| Realtime games          | Phase 09              | Not implemented |
| XP/currency/progression | Phase 10              | Not implemented |
| AI jobs                 | Phase 11              | Not implemented |

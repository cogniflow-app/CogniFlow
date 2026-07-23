# Offline PWA and synchronization

Phase 05 uses offline protocol `1`, IndexedDB schema `1`, Dexie `4.4.4`, and browser-standard
service-worker APIs. This document is the operational and engineering source of truth for the
offline boundary. The canonical content, SRS, practice, identity, and privacy documents still own
their server models.

## Authority and data flow

IndexedDB contains validated projections and durable commands. It is never authoritative.
`@lumen/offline` seals each command with deterministic serialization and a SHA-256 fingerprint over
the complete account/profile/device/entity/payload/idempotency command. `/api/sync/v1` validates
that fingerprint, reauthorizes the current Supabase session, registered device, and learner
profile, then dispatches through the existing Phase 02–04 server routes. The browser does not send
a trusted final schedule or mastery value.

The server stores only:

- `public.sync_device_state`: authorized device/profile checkpoint and bounded preferences;
- `private.sync_operation_receipts`: complete-command-bound idempotency result receipts;
- `private.sync_change_feed`: sequence, authorized scope, entity reference, version, tombstone, and
  timestamp.

It does not duplicate deck bodies, card answers, schedules, mastery, practice answers, or media
bytes. The synchronization response returns a typed result per operation, server time, capability
version, and five monotonic stream cursors. Independent operations can partially succeed. A
retryable or conflicting entity-chain predecessor blocks only later operations in that chain.

## Local schema

The fixed database name is `lumen-offline-v1`; user-controlled values are row namespaces, never
database names. Private keys use the validated
`private:<account UUID>:<learner-profile UUID>` form. Public data, when explicitly supported, uses
the isolated `public` namespace.

Schema version 1 stores:

`namespaceMetadata`, `pinnedDecks`, `deckProjections`, `cardEntryProjections`,
`studyCardProjections`, `mediaManifests`, `mediaBlobs`, `scheduleProjections`, `reviewOutbox`,
`reviewUndoOutbox`, `practiceOutbox`, `contentOutbox`, `mediaOutbox`, `localSessions`,
`localSessionItems`, `syncCursors`, `deviceState`, `operationReceipts`, `conflicts`,
`cachedCapabilities`, `featureFlags`, `cacheMetadata`, `lruMetadata`, `temporaryIdMappings`, and
`workerUpdateState`.

All reads used by the application pass back through the owned repository and runtime schemas.
Private rows cannot be queried without an active exact namespace. A future database version fails
closed. New versions must use an additive Dexie upgrade transaction, test upgrade/interruption
behavior, retain private data until the transaction commits, and update both version constants.
Do not create a parallel database and forget the old private store.

## Service worker and cache policy

`apps/web/public/sw.js` is generated-independent checked-in policy code. The install step precaches
the neutral `/offline` page, its discovered same-origin build chunks, the brand mark, and original
generated PWA icons. Cache names are versioned and old Lumen static/public caches are removed on
activation.

Authenticated navigation is always network-first with `cache: no-store`; failure returns the
neutral shell. Private deck/card/schedule/media projections are loaded from the active IndexedDB
namespace. They are never placed in a shared navigation cache. Same-origin immutable build assets
are cache-first. Only `/api/public/v1/decks/` is eligible for the distinct public
stale-while-revalidate cache.

The worker rejects cross-origin messages and never caches non-GET requests, opaque/error
responses, `private`/`no-store` responses, or `Set-Cookie` responses. The explicit excluded classes
include all APIs, authentication/callback/recovery pages, onboarding, settings, privacy export,
and account deletion. Signed private media URLs are fetched only long enough to verify and write a
profile-namespaced Blob; the URL is not stored.

Background Sync posts a foreground request to open clients where supported. Online, visibility,
focus, one-minute foreground cadence, and explicit **Sync now** are the fallback. Background
synchronization is not guaranteed.

## Pinning and storage

Pinning reads one authorized deck projection, active generated cards, entries, current learner
schedules, and referenced media metadata. Decks are limited to 10,000 cards. The client checks
available quota when the browser exposes it, downloads selected image/audio bytes with `no-store`,
and verifies size, MIME, and SHA-256 before writing. A pin becomes `ready` only after all required
records and selected media succeed.

Media Blobs are keyed by content hash and record their referencing deck IDs. Removing one deck does
not delete a Blob still referenced by another. Cache metadata supports reference-aware pinned
retention and unpinned LRU cleanup. The device preference can include images/audio, images only, or
no media. Excluded media is disclosed; video, model, arbitrary embed, and automatic large media
download are not supported.

The browser may evict non-persistent storage. `navigator.storage.persist()` is offered when
available, but refusal is normal and explicitly disclosed. A quota failure never marks a partial
pin ready.

## Review, practice, and content

An offline review creates its review UUID and idempotency key before applying `@lumen/srs`. It
stores the complete acknowledged before-state, base version, rating, occurrence time, session
context, and prior local review reference, then writes an optimistic pending schedule projection.
The sync route submits the event to the canonical review route. The server re-reads the current
schedule and preset, calculates the transition itself, and commits through the existing locked
append-only review transaction. If a stale event is strictly later than the canonical last review,
the server can deterministically apply it after replay and reports `applied_after_replay`.
Overlapping event time produces a retained learner-facing conflict. Undo is a separate compensating
outbox event.

Offline practice stores bounded raw evidence and computes only immediate local feedback with the
existing deterministic grader. The server reauthorizes the session/card/content version, regrades,
and recalculates mastery on sync. The local mastery projection is not trusted. Ordinary practice
does not mutate SRS; explicit qualification still requires the existing online learner acceptance
path.

Offline self-mode deck creation uses a stable `local:deck:<operation UUID>` identity and a typed
content operation. The canonical create response records a temporary-to-canonical mapping. Existing
content changes never use blind last-write-wins. On a version conflict, the server reads the
currently authorized deck/card-entry projection and performs a conservative three-way merge against
the sealed base snapshot. Independent scalar fields, object keys, and stable rich-document node
positions are merged, validated again with the canonical card schema, and retried at the current
version. The receipt records only the safe merged field paths for the recent-sync confirmation.
Concurrent rich-node insertions/deletions and overlapping scalar/node edits remain conflicts; the
server copy and local copy are retained without diffing serialized JSON as text. Same-field,
structured overlap, delete/edit, media, and permission conflicts remain in the Conflict Center.
Offline publication remains unavailable because authorization and frozen projection creation
require a live server transaction.

## Retry, conflicts, and recovery

Retry uses exponential backoff, deterministic bounded jitter, a maximum of eight automatic
attempts, online/focus/visibility signals, and a 20-second crash-recoverable per-namespace leader
lease. One tab ordinarily pushes; other tabs observe completion over `BroadcastChannel` with a
storage-event fallback. No busy loop is used.

Exact retries replay their stored result. Reusing an operation ID or idempotency key with any
different bound input is rejected. Exhausted/rejected work remains visible as a dead letter.
Learners can explicitly retry or abandon it. Conflicts cannot disappear until a resolution or a
confirmed abandonment is recorded. Ordinary UI omits operation IDs, raw JSON, answers, and rich
documents; safe result categories are available in an expandable disclosure.

If an update is broken, reconnect in a normal browser tab, unregister the Lumen service worker in
browser site settings, clear the Lumen static/public Cache Storage entries, and reload. Do not
delete IndexedDB if pending work must be recovered. If IndexedDB itself cannot open, stop and
capture only schema/version/error category—not stored private content—before choosing the
profile/account clear action.

## Identity and privacy

The existing device cookie and Supabase session remain the identity boundary; there is no
long-lived sync secret. Explicit sign-out, account deletion, guardian exit, profile switching,
session expiration, and current-device revocation invoke the common browser-isolation event. The
active namespace is cleared, private IndexedDB rows are removed, profile-bound work stops, private
cache names are removed, and other tabs reload through the server identity boundary. Deliberately
public cached data is separate.

An offline browser cannot learn that the server revoked its device or permission. On reconnect, the
runtime authorization check rejects future sync. The application then treats the namespace as
inaccessible and requires a live sign-in/authorization refresh. Previously cached public material
also cannot be remotely erased while fully offline; withdrawal is reconciled on reconnection.

Browser storage inherits the browser profile and operating-system trust boundary. It is not
encrypted against a malicious extension, compromised OS account, or someone with access to an
unlocked shared browser profile. No browser fingerprinting, service key, database password, custom
auth-token store, answer telemetry, or third-party analytics is added.

## Capability fallbacks and budgets

Capabilities are detected, not inferred from browser names. Online functionality remains usable
when service workers, install prompts, Background Sync, storage estimates, persistent storage,
media range support, or IndexedDB are unavailable. An absent IndexedDB disables offline features;
it does not block the protected online product.

The Phase 05 budgets are:

| Operation                                                      |           Budget |
| -------------------------------------------------------------- | ---------------: |
| Neutral shell first IndexedDB read                             |           250 ms |
| Pinned library metadata                                        |           100 ms |
| 10,000-card projection read in the repository test environment |         2,000 ms |
| One review event + projection transaction                      |     50 ms target |
| Pending count                                                  |           100 ms |
| Normal push/pull/reconcile batch (excluding network)           |    250 ms target |
| LRU cleanup of a normal eviction batch                         |    100 ms target |
| Service-worker startup work                                    | no database scan |

Real devices, quota modes, and storage implementations vary; these are regression budgets, not
latency guarantees.

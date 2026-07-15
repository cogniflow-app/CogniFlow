# Phase 5 — Installable PWA, offline study/editing, outbox synchronization, and conflict resolution

Read the implemented SRS, practice, content, auth, and profile-switching systems before changing anything. This phase must make the application resilient without creating a second incompatible data model.

## Objective

Deliver an installable PWA that can pin decks, study and review offline, create/edit content offline, queue idempotent events, synchronize safely across devices, and surface conflicts rather than losing data.

## 1. Offline architecture package

Create `packages/offline` with framework-independent types for:

- local entities/projections;
- sync cursor;
- outbox operation;
- review event;
- practice event;
- content mutation;
- media mutation;
- conflict;
- sync result;
- retry policy;
- profile cache namespace.

Use a versioned protocol. Every outbox item includes:

```ts
{
  id: string;
  protocolVersion: number;
  learnerProfileId: string;
  deviceId: string;
  entityType: string;
  operation: string;
  baseVersion?: number;
  occurredAt: string;
  createdAt: string;
  payload: unknown;
  attemptCount: number;
  nextAttemptAt?: string;
}
```

Validate all payloads with shared schemas.

## 2. IndexedDB/Dexie schema

Implement versioned Dexie stores for:

- pinned decks;
- deck public/private content projections;
- note/card data required for study;
- learner card schedules;
- review outbox;
- practice outbox;
- content operation outbox;
- pending media;
- sync cursors;
- device state;
- local study sessions;
- conflicts;
- cached feature flags/capabilities;
- cache metadata and LRU information.

Rules:

- namespace every private record by account and learner profile;
- clear/switch caches safely on sign-out/profile switch;
- never store server secret keys;
- avoid raw long-lived auth tokens beyond the official client session mechanism;
- schema upgrades must be tested from previous versions;
- do not leave stale child-profile content accessible after guardian exit;
- store only media explicitly pinned or recently needed, with a quota.

## 3. PWA and service worker

Implement:

- web app manifest;
- icons and install metadata using original assets;
- service worker through a maintained approach compatible with the selected Next.js version;
- app-shell caching;
- offline fallback page;
- update-available prompt;
- safe cache versioning;
- static asset precaching;
- network-first authenticated navigation;
- stale-while-revalidate public content where safe;
- explicit deck/media pinning;
- background sync where supported;
- foreground retry fallback where background sync is unavailable;
- no shared caching of private server-rendered responses;
- no caching of secrets, auth callbacks, account settings, or destructive routes.

Clear profile-scoped caches on sign-out. Test installability and offline navigation.

## 4. Device identity and sync sessions

Use a client-generated device ID stored locally and registered to the account. Provide:

- device name and last seen;
- revoke device;
- rotate local sync credentials/session;
- sync cursor per entity stream/profile;
- last successful sync;
- pending count;
- error state;
- “sync now”;
- metered connection preference;
- media download preference.

Do not use invasive fingerprinting.

## 5. Offline review

Offline SRS Review must work for pinned decks.

Flow:

1. local queue is built from cached schedule/content;
2. local `packages/srs` previews/applies an event optimistically;
3. client-generated review ID and base schedule version are stored in outbox;
4. local schedule is updated with a pending marker;
5. sync submits a batch to a server endpoint/RPC;
6. server deduplicates and validates;
7. server accepts, rebuilds, or returns a conflict;
8. local state reconciles;
9. no event is silently dropped.

Implement deterministic replay for nonconflicting events.

Conflict case: two devices reviewed the same stale schedule chain. Store both events, fetch canonical history, replay deterministically where valid, and show a conflict center explaining the result. Allow the user to accept canonical replay or inspect events. Never ask the user to manually retype scheduler internals.

Undo offline:

- create a compensating local operation;
- preserve the original event;
- sync through canonical undo logic;
- handle “already synced then undone” and “not yet synced” paths.

## 6. Offline practice

Support offline:

- Flashcards;
- Learn using deterministic grading and cached mastery;
- Write;
- Test;
- Match;
- Diagram where required media is pinned;
- audio only when cached/local.

Queue practice attempts and mastery deltas as events. The server recomputes or validates mastery from attempts; do not trust a client-provided final mastery number.

## 7. Offline content editing

Support:

- create deck/note;
- edit note fields;
- add/remove tags;
- reorder;
- archive/delete with tombstone;
- safe rich-document edits;
- draft media metadata.

Use optimistic `base_version`.

Conflict rules:

- different fields changed: auto-merge;
- same plain field changed: show side-by-side diff;
- rich content: use Yjs-compatible update representation or a structured merge;
- delete versus edit: preserve edited copy in conflict recovery;
- folder/settings low-risk conflicts: documented last-write-wins when appropriate;
- media: hash dedup.

The conflict UI must allow:

- keep server;
- keep local as a new revision;
- merge;
- duplicate note/deck;
- dismiss only after resolution.

Do not overwrite server content silently.

## 8. Sync API

Create a batched, versioned sync endpoint/service:

- authenticated and profile-authorized;
- request size limited;
- idempotent;
- cursor-based;
- supports reviews, practice, content, deletes, and acknowledgments;
- transaction boundaries per entity chain;
- partial success with typed per-operation result;
- exponential backoff with jitter;
- dead-letter/conflict state after configured attempts;
- structured logs without raw sensitive answer content;
- rate limiting;
- no service-role exposure to browser.

Consider database functions for critical batches. Keep request/response schemas in a shared package.

## 9. Media offline flow

Implement:

- pin/unpin media;
- size estimate before pin;
- browser quota handling;
- LRU cleanup;
- audio/image cache;
- pending image/audio created offline;
- upload when online with hash/quota/magic-byte checks;
- conflict and retry;
- explicit error when browser storage is insufficient;
- no automatic large model/video download.

## 10. UX

Add:

- install prompt where browser permits;
- offline banner;
- sync status;
- per-deck pinned indicator and size;
- pending operation count;
- conflict center;
- update available;
- retry;
- device settings;
- clear offline data;
- storage usage;
- profile-safe switch behavior.

Do not show a green “Synced” state until the server acknowledged all critical events.

## 11. Testing

Add:

- Dexie migrations;
- cache namespace isolation;
- sign-out cleanup;
- service worker cache policy;
- offline navigation;
- offline review then sync;
- duplicate event;
- stale review conflict;
- undo before and after sync;
- two-device content edit conflict;
- delete/edit conflict;
- rich content merge;
- profile switch;
- offline media quota;
- retry/backoff;
- network interruption during batch;
- server partial result;
- Playwright offline context;
- multi-context device simulation;
- no private response in public cache;
- accessibility of conflict center.

## Required acceptance criteria

- the app is installable;
- a pinned deck can be reviewed offline;
- offline reviews synchronize idempotently;
- simultaneous-device conflicts are visible and recoverable;
- practice attempts sync without trusting client mastery;
- content edits do not silently overwrite conflicts;
- sign-out/profile switch prevents cross-profile local data exposure;
- storage quotas and cleanup work;
- PWA tests, E2E offline flows, database tests, and production build pass;
- documentation explains browser limitations and recovery.

Do not implement import/export in this phase beyond ensuring the offline schema can receive imported content later.

# Phase 3 — FSRS-first scheduling, SM-2 compatibility, canonical review flow, custom study, and statistics

Read the full blueprint and the completed content model. Implement the long-term memory kernel. This is a correctness-critical phase; prioritize auditable domain behavior and database invariants over decorative extras, while still delivering a premium review interface.

## Objective

Create an Anki-grade review system using `ts-fsrs` behind a project-owned scheduler interface, with optional SM-2 compatibility, per-learner schedules, append-only review logs, atomic online reviews, offline-ready event IDs, undo, rebuild, custom study, advanced controls, and meaningful statistics.

## 1. Scheduler package

Create `packages/srs` with no dependency on React or Next.js.

Expose typed APIs for:

- preset validation and serialization;
- empty card creation;
- previewing Again/Hard/Good/Easy;
- applying a rating;
- retrievability;
- rollback;
- forget/reset;
- reschedule/rebuild from logs;
- schedule migration;
- SM-2 compatibility;
- due-queue helpers;
- study-day calculation.

Pin and record the `ts-fsrs` version/model assumptions. Persist scheduler version in review logs.

Default FSRS configuration:

```text
requested retention: 0.90
max interval: 36500 days
learning steps: 1m, 10m
relearning steps: 10m
short-term enabled
fuzz enabled
```

Do not expose a fabricated “ease factor” for FSRS. Store/display difficulty and stability. Preserve `legacy_ease_factor` only for SM-2/import compatibility.

## 2. Database schema

Create additive migrations for:

- `srs_presets`;
- `deck_srs_settings`;
- `card_schedules`;
- `review_logs`;
- `study_sessions`;
- `study_session_items`;
- `study_filters`;
- `daily_study_counters`;
- `schedule_snapshots` if needed for efficient replay;
- `review_undo_events` or a compensating-log representation;
- scheduler optimization job metadata, feature-flagged.

Constraints:

- schedule primary key is learner profile + card;
- shared decks never share schedule state;
- schedule version increments atomically;
- review log ID is client-generated and unique;
- idempotency key prevents double application;
- check constraints on ratings/states/durations;
- due and learner/card indexes;
- review log append-only permissions;
- RLS scopes all rows to accessible learner profile;
- public users cannot read schedules or logs;
- content deletion/deactivation preserves historical review references safely.

## 3. Presets and deck configuration

Implement UI and services for:

- create/duplicate/rename/delete personal preset;
- FSRS or SM-2 compatibility selection;
- requested retention;
- learning and relearning steps with parser/validation;
- maximum interval;
- new cards/day;
- reviews/day;
- new-card order;
- review order;
- new/review mixing;
- sibling bury settings;
- leech threshold and action;
- interval fuzz toggle;
- apply preset to one or multiple decks;
- restore system defaults;
- estimate workload when retention changes.

Settings are per learner/deck, not content-global.

## 4. Atomic online review RPC

Implement a database-backed canonical mutation. Inputs include:

- learner profile ID;
- card ID;
- study session ID;
- rating;
- reviewed-at;
- duration;
- timezone;
- study-day start;
- device ID;
- current schedule version;
- review ID/idempotency key;
- source.

The RPC/service must:

1. verify the caller can use the learner profile and study the card;
2. lock or atomically compare the schedule row;
3. return an existing result for duplicate review ID;
4. reject or return a typed stale-version conflict;
5. calculate the transition using the scheduler package or a trusted server path;
6. insert immutable before/after log;
7. update schedule and daily counters;
8. update session item;
9. handle sibling burying;
10. return new state, due count, and next-action data.

Do not calculate canonical state only in the browser. A local preview may use the same package.

If calling TypeScript from a Postgres function is impossible, use a server transaction pattern that still guarantees lock/idempotency and document the boundary. Do not create a race-prone read-then-write sequence.

## 5. Review queue

Implement deterministic queue construction honoring:

- learner profile;
- active deck/folder/filter;
- suspended/buried/inactive cards;
- due/new/relearning;
- daily limits;
- order settings;
- sibling separation;
- custom study;
- retrievability where relevant;
- deck hierarchy/folder selection;
- time zone and study-day cutoff.

Support:

- default Today queue;
- one deck;
- folder/multi-deck;
- new only;
- due only;
- forgotten today;
- leeches;
- starred;
- tag query;
- review ahead;
- cram/preview;
- relative overdueness;
- random;
- interval range;
- card state.

A preview-only session must not reschedule. A rescheduling filtered session follows the configured rule and records source.

## 6. Review interface

Build a polished review screen:

- prompt side;
- media, math, code, diagrams, and safe templates;
- reveal action before rating;
- Again/Hard/Good/Easy with next interval preview;
- keyboard shortcuts;
- touch/swipe option that never causes accidental grading;
- typed-answer comparison when card type supports it;
- audio autoplay preference;
- progress and remaining counts;
- optional timer;
- pause;
- edit note;
- star;
- bury card;
- bury siblings;
- suspend;
- report content;
- undo last review;
- offline-ready state indicator;
- accessible live announcements;
- reduced-motion card transition;
- serious mode.

Do not use red/green alone. Never expose the answer in the DOM before reveal in a way that trivial scripts/assistive navigation accidentally reads it; still ensure the revealed answer is accessible.

## 7. Advanced operations

Implement authorized and audited operations:

- suspend/unsuspend;
- bury until next study day;
- bury siblings;
- reset/forget;
- manual due date;
- reschedule range;
- set due order for new cards;
- mark leech;
- leech auto-suspend or tag action;
- undo last canonical review using scheduler rollback/compensating event;
- rebuild schedule from logs;
- detect schedule/content version mismatch;
- choose preserve/relearn/reset after semantic note edits.

Bulk operations need preview, count, confirmation, and transaction-safe behavior.

## 8. Statistics

Create learner-private statistics:

- due today;
- cards by state;
- review count/time;
- accuracy by rating;
- retention/retrievability estimate;
- stability and difficulty distribution;
- lapses/leeches;
- interval distribution;
- forecast;
- calendar heatmap;
- answer-time distribution;
- deck/tag breakdown;
- review history timeline per card;
- workload estimate;
- mature/young/new counts.

Use accessible charts with text/table alternatives. Avoid false precision and explain the metric.

## 9. Scheduler optimization

Create a feature-flagged optimizer adapter:

- requires a documented minimum number/quality of review logs;
- exports logs in a compatible schema;
- can run locally/worker-side when dependency is available;
- previews old/new parameter effects;
- requires user confirmation;
- stores versioned parameters;
- can roll back to previous preset.

Do not require Python or a paid worker for core operation. It is acceptable for the adapter to be implemented and locally testable while disabled by default, but not acceptable to display a working “Optimize” button if no execution path exists.

## 10. Tests and invariants

Add comprehensive tests:

- parity examples with `ts-fsrs`;
- default transitions;
- learning/relearning;
- max interval;
- fuzz boundaries;
- time zone/study-day;
- SM-2 ease and interval behavior;
- duplicate review idempotency;
- stale version conflict;
- concurrent review attempts;
- undo/rollback;
- rebuild from logs;
- import-style replay;
- sibling bury;
- daily limits;
- preview-only custom study;
- schedule isolation between learners;
- RLS;
- inactive/deleted content handling;
- property tests for nonnegative/bounded intervals and deterministic no-fuzz mode;
- Playwright review session with keyboard/mobile;
- accessibility;
- large due queue query performance.

## Required acceptance criteria

- FSRS is default and all four ratings work;
- schedules are per learner/card and never shared;
- canonical reviews are atomic and idempotent;
- review logs are append-only and replayable;
- undo produces a valid schedule without deleting history;
- SM-2 compatibility has tests and stores ease only in that mode;
- custom study includes preview and rescheduling semantics;
- advanced operations are authorized;
- statistics are based on real data;
- content changes surface schedule decisions;
- all checks, database tests, concurrency tests, and relevant E2E pass;
- implementation status records scheduler/package versions and measured queue performance.

Do not implement adaptive Learn mastery in this phase beyond the interface that can later offer an explicit SRS rating.

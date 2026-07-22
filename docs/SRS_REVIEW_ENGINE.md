# SRS review engine

Phase 03 adds learner-private canonical scheduling without coupling authored content to study
progress. This document is the implementation specification for the scheduler package, queue,
review transaction, time model, settings, operations, and statistics.

## Engine identity and defaults

`packages/srs` is framework-independent and is the only project API that may expose scheduling
behavior. It pins `ts-fsrs` `5.4.1` exactly and records canonical evidence as
`lumen-srs/1 (v5.4.1 using FSRS-6.0)`. No `ts-fsrs` card or review-log structure crosses the
package boundary.

The default FSRS preset uses requested retention `0.90`, maximum interval `36500` days, learning
steps `1m 10m`, relearning step `10m`, short-term scheduling, and fuzz. Fuzz is disabled for exact
preview comparisons and deterministic fixtures; user-facing fuzzed day previews say “About”. FSRS
surfaces difficulty, stability, estimated retrievability, scheduled interval, and due time. It does
not fabricate an ease factor.

The package owns preset validation and serialization, initial schedules, all four states and four
ratings, preview/application, requested retention, short-term steps, maximum interval, fuzz,
retrievability, rollback, forget, replay/rebuild, migration, content-change operations, queues,
study-day calculations, and a genuine SM-2 compatibility scheduler. Its optimizer interface is
disabled by default, requires at least 400 canonical logs, accepts a pluggable local/worker backend,
validates proposed parameters, and produces a preview only. Core review never depends on it.

## State machine

The canonical states are New, Learning, Review, and Relearning. A generated active card without a
`card_schedules` row is New. The first canonical review lazily creates and locks its schedule in the
same transaction. Again, Hard, Good, and Easy transitions are computed by the trusted server with
the exact preset version captured in evidence.

- Learning and Relearning honor configured short-term steps before graduating to Review.
- Review transitions are bounded by requested retention and the maximum interval.
- Again records a lapse and may trigger the configured leech action.
- Preview-only sessions reveal and advance but never invoke the canonical review mutation.
- Cram is non-rescheduling by default; any rescheduling filtered session is explicitly labeled and
  records its source.
- Suspend, bury, and inactive/deleted content are excluded from new queue construction.

SM-2 compatibility keeps actual interval, repetition, and ease-factor behavior. Legacy ease exists
only for SM-2 or compatible imported state. Changing FSRS/SM-2 algorithms requires a separate
preview and explicit audited replay; assigning an incompatible preset directly is rejected.

## Canonical mutation and trust boundary

The browser sends intent, not a transition: learner context, card, session, one rating,
`reviewedAt`, bounded duration, IANA time zone, study-day cutoff, device ID, current schedule
version, client review UUID, idempotency key, source, and expected preset/version. The browser may
render package-generated previews but never submits `scheduleAfter`.

The server authenticates and resolves the active learner, verifies study access and active content,
loads the exact preset and schedule context through a service-only RPC, validates the command, and
computes the transition through `packages/srs`. It then calls `admin_commit_srs_review`, which
repeats actor/profile/card/session/preset checks, locks the schedule target, compares the version and
before-state, binds idempotency to the complete command plus trusted transition, appends immutable
before/after evidence, updates the schedule and session item, updates the daily counter, and applies
sibling bury/leech behavior atomically.

An identical duplicate review UUID returns the stored canonical result. Reusing the UUID with any
payload difference is rejected. Competing valid commands produce exactly one commit and one typed
stale-version conflict. Review logs and preset versions are append-only at the database boundary;
undo appends a compensating record and restores a valid locked schedule rather than deleting
history.

Security-definer functions use an explicit `search_path`, actor-derived authorization, and exact
`service_role` execute grants. The service role has no direct table read/write grant for SRS data.
Browser roles cannot execute service RPCs. RLS keeps schedules, sessions, filters, statistics, logs,
and operations private to authorized learner context; public deck routes remain schedule-neutral.
Read-only RLS obtains the current registered session's viewable deck, note, and card IDs through
fixed-search-path set-returning helpers, so large queues reuse one authorized set instead of
repeating an equivalent security-definer check for every row.

## Queue construction

The server reads authorized active content through typed repositories, deterministically paginates
past PostgREST row caps, batches UUID filters, and maps rows into package-owned queue candidates.
`buildDueQueue` applies each deck's preset and today counters, then stable seeded ordering.

Supported scopes and modes include all decks, one deck, folder, multiple decks, saved filters,
Today, New, Due, forgotten-today, leeches, starred, tags, interval range, state, review-ahead,
relative overdueness, seeded random, cram, and preview-only. Queues honor Learning/Relearning due
times, new/review limits, new-card and review order, mixing, suspension, burying, leeches, active
content, time zone, and study-day cutoff. Session items snapshot enqueue position, state, and
schedule version for deterministic resume. Authorization is repeated when the card is read and
when it is mutated.

Time is stored in UTC. `studyDayFor`, `studyDayBoundaryFor`, and `nextStudyDayBoundary` resolve IANA
zones and local cutoffs across midnight and daylight-saving transitions. Named date filters include
the complete local study-day range rather than treating a UTC date as the learner's day.

## Content changes and advanced operations

Cosmetic and minor clarification edits preserve stable generated-card schedules. Answer- or
meaning-changing content records a mismatch and asks each learner to Preserve, Relearn, or Reset;
the conservative default is Relearn. A content owner cannot mutate another learner's schedule.
Deactivated/replaced card identities retain evidence but do not transfer history to unrelated
cards.

Authorized audited operations include star/unstar, suspend/unsuspend, bury until the next study
day, bury related cards, manual due date, range reschedule, new-card due order, leech marking,
forget/reset, replay rebuild, content-decision application, and compensating undo. Bulk operations
return an affected count and preview, require explicit confirmation and expected versions, run
transactionally, and cannot cross learner boundaries.

## Routes and learner experience

- `/app/study` is the Today dashboard, custom-study builder, saved-filter home, and paused-session
  resume point.
- `/app/study/session/[sessionId]` is the canonical review surface.
- `/app/stats` contains private real-data statistics.
- `/app/settings/scheduling` owns personal presets and deck assignment.

Before reveal, answer content is absent from readable and assistive DOM. Space/Enter reveals when
safe. After reveal, buttons and keyboard `1`–`4` submit Again/Hard/Good/Easy with interval previews.
A synchronous submission guard prevents double review; the active card remains on conflict or
failure. Swipe only selects a rating and requires explicit confirmation. The surface includes
progress, remaining count, state, optional timer, pause/resume, exact-card editing, star, card and
related-card bury, suspend, report, undo, content mismatch choices, serious mode, reduced motion,
mobile layout, and live announcements. Typed-answer comparison is local and does not create Phase
04 mastery state.

Statistics use canonical schedules, review logs, and daily counters only: due and state counts,
review count/time, rating distribution, lapses, leeches, estimated retrievability, stability,
difficulty, intervals, 14-day forecast, calendar heatmap, answer time, mature/young/new counts,
deck/tag breakdowns, workload, and a per-card history timeline. Empty accounts receive truthful
text alternatives; tables remain available to keyboard and screen-reader users.

## Performance and verification targets

Local pgTAP uses a realistic 10,000-card fixture with a registered Auth-session device and refreshed
planner statistics. A separate assertion proves all 10,000 rows are visible before timing, so a
fast authorization denial cannot satisfy the performance gate. Budgets are 500 ms for package queue
construction, 1500 ms for the Today query, 500 ms for resume, 500 ms for statistics aggregation,
and 500 ms for a canonical commit. The final Phase 03 measurements and complete command results are
recorded in `IMPLEMENTATION_STATUS.md`.

Phase 04 remains separate: no adaptive Learn mastery, generalized grading, test mode, or persistent
practice attempts are created here. Phase 05 owns actual offline synchronization; Phase 03 only
uses retry-stable client event IDs and idempotent server commands.

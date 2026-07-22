# Practice, mastery, grading, and product guides

This document is the Phase 04 operational contract. Canonical spaced-repetition behavior remains
owned by [SRS_REVIEW_ENGINE.md](./SRS_REVIEW_ENGINE.md); practice never writes a schedule unless the
explicit qualification flow calls that canonical API.

## Evidence boundaries

`practice_sessions` owns a seeded, resumable practice run. Its ordered
`practice_session_items` are the saved question set. `practice_attempts` is append-only learner
evidence, including minimized response retention, grading explanation, hints/reveal/retry state,
duration, content version, and an SRS-qualification status. `concept_mastery` is a learner-private
projection of that evidence. Test responses, personal bests, answer overrides, and accepted-answer
rules have separate tables and do not become review logs.

Only Learn or Write attempts can qualify for scheduling. The attempt must be correct unaided
free recall or a delayed retest, have no hint, reveal, or retry, and concern a new or currently due
card. The server calculates a suggested rating, but stores no review at that point. The learner must
choose a rating and confirm. The qualification route then invokes the unmodified Phase 03 review
endpoint and records the resulting `review_log_id`. Choice, Test, Match, Flashcards, Spell,
Pronunciation, and Diagram evidence is never eligible.

## Deterministic grading

`packages/grading` is framework-independent and has no network path. Every answer is NFKC
normalized and whitespace-collapsed. Strict, moderate, relaxed, and custom profiles control case,
punctuation, accent, edit, token, and partial thresholds. Creator-authored aliases, synonyms,
required/forbidden keywords, unordered or ordered lists, numeric tolerances with compatible units,
and a bounded arithmetic parser are evaluated before typo/token similarity. Select-all partial
credit rewards correct options and penalizes extras. The optional semantic provider interface is
disabled and cannot replace the deterministic result in the shipped path.

The UI shows a short explanation and an accessible answer comparison, not internal rule output.
“I was correct” and “Report answer-key problem” create audited override evidence; they do not edit
the original attempt or schedule.

## Mastery model

Mastery tracks recognition and recall independently in `[0,1]`; the displayed overall projection is
`0.35 × recognition + 0.65 × recall`. Evidence weights are:

| Evidence        | Recognition | Recall |
| --------------- | ----------: | -----: |
| Flashcard       |        0.07 |   0.05 |
| Multiple choice |        0.13 |  0.025 |
| Select all      |        0.15 |   0.04 |
| True/false      |        0.08 |  0.015 |
| Match           |        0.10 |   0.02 |
| Typed           |        0.05 |   0.19 |
| Write           |        0.04 |   0.24 |
| Spell           |        0.04 |   0.21 |
| Pronunciation   |        0.04 |   0.12 |
| Diagram         |        0.10 |   0.15 |
| Test            |        0.08 |   0.20 |

Correctness is scaled by confidence, latency, hints (`0.82^n`), reveal (`0.35`), retries
(`0.8^n`), and spacing. Evidence inside ten minutes receives `0.30` spacing weight; evidence inside
six hours receives `0.50`; evidence inside a day receives `0.72`. Recognition and recall use
24-day and 32-day half-life decay respectively. Edited content carries prior knowledge forward at
`0.72` recognition and `0.55` recall while resetting spaced-recall credit. “Mastered” requires two
unaided recall successes at least six hours apart, recall of at least `0.60`, and overall mastery of
at least `0.50`. This is practice mastery, not FSRS stability or retrievability.

## Adaptive selection and exam planning

Selection is stable for the same seed and state. Candidate priority combines mastery gap (`0.34`),
overdue pressure (up to `0.22`), recent misses (`0.14`), exam urgency (`0.14`), chosen deck (`0.06`),
tag (`0.05`), goal (`0.07`), desired progression (`0.08`), difficulty fit (`0.03`), and a tiny
seeded tie-breaker. A recently shown card receives `-1`; its sibling receives `-0.55`. Keyboard,
audio, and reduced-motion incompatibilities exclude a candidate. Distractors exclude the target and
sibling note, prefer comparable difficulty, and use the saved seed.

Exam plans use the learner's future date, included days, minutes/day, cards, and current average
mastery. Estimated passes are `1 + (1 − mastery) × 1.5`; capacity is shown honestly and an
infeasible plan recommends narrowing scope, adding time, or moving the date. Required SRS work and
extra practice remain visibly distinct, and no grade is promised.

## Study and mode experience

The Study hub groups canonical “Study today,” resumable practice, eight practice modes, weak-area
practice, exam planning, and the guide entry. Mode cards state their schedule effect. Setup uses a
shared material → goal/options → summary pattern with saved versioned preferences and advanced
controls disclosed only when relevant. Active modes use a compact focus shell with stable gutters,
progress, pause/exit, safe areas, serious mode, and reduced-motion behavior.

Flashcards use a bounded two-stage perspective flip; the answer is not in readable DOM before the
edge-on midpoint. Test supports saved seeded questions, one-at-a-time or answer-sheet navigation,
flags, timer, pause policy, end/after-each review, select-all partial credit, real question review,
mistake practice, retake/regenerate, and a printable answer key. Match uses seeded choices, keyboard
and touch targets, a timer, low-weight evidence, and personal-best summaries. Audio modes use local
browser speech; pronunciation recording is an explicit local-only action with no upload. Diagram
practice reuses normalized Phase 02 geometry and renderer accessibility text, with zoom and a typed
keyboard alternative.

## Versioned guides

Guide definitions live in `apps/web/lib/guides/definitions.ts` and use stable keys and positive
versions. The global seven-step guide and fourteen contextual mini-guides are optional, resumable,
restartable, role-aware, and learner-context-aware. The non-blocking first-visit invitation preserves
the requested route. The coach uses semantic dialog behavior, focus trapping/restoration, Escape,
keyboard controls, an anchored desktop presentation, and a mobile bottom sheet. Missing targets
fall back to a centered explanation rather than trapping the user.

`product_guide_progress` stores only key, version, status, current step, timestamps, and bounded
metadata. It has no clickstream and no third-party analytics. RLS and guarded RPCs isolate accounts
and learner profiles; deletion minimizes the record. Substantial guide changes increment the code
version and may be offered once without deleting prior history. `/app/getting-started` derives its
checklist from decks, cards, completed practice sessions, review logs, statistics availability, and
authorized publication state—never synthetic completion flags.

## Privacy, accessibility, and performance

Managed/minor responses are discarded or hash-only; adult self-profile text retention is bounded.
Recordings remain object URLs in the browser and are revoked on replacement/unmount. There is no
behavioral tracking or cloud grading. All practice tables use RLS, exposed writes are revoked, and
mutations use actor/device/session-bound security-definer RPCs with explicit search paths.

All critical actions are semantic controls, choice targets are keyboard operable, live feedback is
announced, comparison does not rely on color alone, mobile controls stay within safe areas, and
200% text plus 320 px layouts are acceptance-tested. Motion is removed for saved/system reduced
motion and serious mode. The deterministic selector's 10,000-candidate budget is below 1.5 seconds
in the unit performance test; normal UI sessions cap requested items at 500.

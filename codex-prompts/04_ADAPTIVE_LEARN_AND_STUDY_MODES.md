# Phase 4 — Adaptive Learn Mode, grading, flashcards, writing, tests, matching, spelling, diagrams, and exam planning

Read the existing SRS implementation carefully. Implement the practice/mastery layer as a separate system. Do not allow this phase to corrupt canonical review history.

## Objective

Deliver the polished consumer study experience: a Quizlet-quality flashcard interaction, a substantially stronger adaptive Learn Mode, deterministic flexible grading, practice tests, Match, spelling/pronunciation, diagrams, weak-area sessions, and transparent optional qualification into SRS.

## 1. Database schema

Create additive migrations for:

- `practice_sessions`;
- `practice_session_items`;
- `practice_attempts`;
- `concept_mastery`;
- `accepted_answer_rules`;
- `answer_overrides`;
- `learning_goals`;
- `exam_plans`;
- `practice_test_definitions`;
- `practice_test_attempts`;
- `practice_test_responses`;
- `personal_bests`;
- mode preference tables if not stored safely in profile settings.

Requirements:

- practice attempts are distinct from review logs;
- answer payload retention is configurable and minimized for child profiles;
- mastery is learner-private;
- SRS qualification status is explicit;
- overrides are auditable;
- no public RLS access;
- session resume is supported;
- all mode configurations are versioned JSON validated by shared schemas.

## 2. Grading package

Create `packages/grading`, framework-independent and exhaustively tested.

Implement answer types:

- text;
- aliases;
- ordered list;
- unordered set;
- numeric;
- unit-aware numeric;
- math expression where safely supported;
- multiple choice;
- multi-select;
- true/false;
- ordering;
- diagram hotspot/label;
- pronunciation self-review result;
- drawing self-review result.

Implement strict, moderate, relaxed, and custom grading.

Pipeline:

- Unicode NFKC;
- whitespace;
- case;
- punctuation;
- configurable accent/diacritic handling;
- exact match;
- aliases;
- required and forbidden keywords;
- list parsing;
- number formatting;
- unit conversion;
- safe math equivalence;
- Damerau-Levenshtein;
- token similarity;
- deterministic synonyms only when creator-authored;
- optional semantic-provider hook, disabled by default.

Return:

```ts
{
  correctness: number;       // 0..1
  verdict: "correct" | "partial" | "incorrect" | "needs_review";
  confidence: number;        // 0..1
  matchedRule: string;
  explanation: string;
  normalizedExpected: string[];
  normalizedReceived: string;
  overrideAllowed: boolean;
}
```

Do not use an LLM in the deterministic default path.

## 3. Mastery model

Create `packages/learning-engine`.

Mastery must be explainable and recalculable. Implement:

- recognition score;
- recall score;
- overall mastery;
- decay;
- attempt evidence weights;
- reduced evidence for immediate repeats;
- reduced evidence for multiple choice/true-false;
- stronger evidence for unaided delayed written recall;
- penalties for hints/retries/reveal;
- confidence/latency as bounded modifiers;
- content-version invalidation or weakening after semantic edits.

Stages:

```text
unseen
introduced
recognition
guided_recall
free_recall
mastered
needs_refresh
```

Write property tests ensuring mastery remains in bounds and games cannot call this API without an explicit practice-evidence adapter.

## 4. Adaptive selection

Implement a deterministic, seeded selector combining:

- current stage/mastery;
- due/overdue status;
- recent miss;
- time since last attempt;
- exam urgency;
- target session goal;
- tag/deck focus;
- question-type progression;
- sibling spacing;
- anti-repeat penalty;
- estimated item difficulty;
- accessibility preferences.

Default progression:

1. brief flashcard introduction;
2. recognition;
3. guided recall;
4. typed/free recall;
5. delayed retest;
6. session mastery after at least two appropriately spaced successes;
7. end summary and next recommendation.

A missed card is not repeated immediately unless the mode explicitly asks the learner to retype the correct answer; it reappears after intervening items.

## 5. Flashcards mode

Implement a premium non-SRS flashcard mode:

- flip, click, spacebar, swipe;
- orientation term/definition/both;
- shuffle with reproducible session seed;
- autoplay with pause;
- audio/TTS;
- star;
- know/still learning sorting;
- filter by starred/tag;
- progress;
- resume session;
- nonpersistent public preview;
- authenticated practice attempt recording only when the user classifies a card;
- reduced-motion fallback;
- screen-reader reveal behavior.

Clearly distinguish Flashcards from SRS Review.

## 6. Learn Mode

Implement:

- goal selection: time, count, mastery threshold, new, due, weak, starred, tags, exam date, mixed decks;
- question type selection;
- answer direction;
- strictness;
- audio;
- retype-correct-answer preference;
- hints policy;
- pause/resume;
- adaptive queue;
- mastery progress by concept;
- explanation of why an item returned;
- end summary;
- mistake review;
- recommended next session.

Question types:

- flashcard;
- multiple choice;
- select all;
- true/false;
- typed answer;
- ordering;
- list answer;
- diagram label/hotspot;
- audio/spelling;
- self-reviewed drawing/pronunciation where automatic grading is not valid.

### Explicit SRS qualification

After an eligible unaided free-recall/typed attempt on a due or new card:

- calculate a suggested Again/Hard/Good/Easy mapping;
- show why it is suggested;
- let the learner accept or choose another rating;
- apply through the canonical SRS review API;
- record practice attempt and linked review ID;
- never apply silently;
- ineligible attempts show no misleading scheduling claim.

## 7. Written practice

Create a focused Write mode:

- answer with either side or configured field;
- strictness;
- aliases/lists/math/units;
- two-pass default;
- revisit misses;
- require two spaced successes;
- “Don’t know”;
- reveal and optional retype;
- “I was correct” override;
- creator feedback path for wrong answer key;
- answer comparison that highlights differences accessibly.

## 8. Multiple-choice and distractors

Implement deterministic distractor generation:

- manual choices first;
- semantically related deck answers via tags/text similarity;
- same answer type/language;
- reject duplicates/correct answer/near duplicates;
- balance length/style;
- avoid choices from sibling cards that reveal answer;
- cache generated set per seeded session;
- allow deck creator preview/edit.

Track partial credit for select-all with a documented formula that discourages selecting every option.

## 9. Test mode

Build a test generator:

- question count;
- selected decks/tags;
- question-type mix;
- answer direction;
- timed or untimed;
- per-question or whole-test timer;
- random seed;
- one-page or question-by-question layout;
- answer review policy;
- partial credit;
- manual self-grade queue for unsupported open answers;
- pause policy;
- retakes;
- regenerate;
- mistake-only retest;
- printable answer key;
- no SRS side effects.

Store definition and attempts. Show accuracy, score, time, and concept breakdown.

## 10. Match mode

Implement:

- pair tiles;
- responsive layouts;
- keyboard selection;
- touch;
- accessible list alternative;
- timer;
- mistake feedback;
- personal best;
- seeded rounds;
- hide impossible duplicates;
- session summary;
- practice evidence with low weight;
- no SRS mutation.

## 11. Spell and pronunciation

Implement:

- audio or TTS prompt;
- typed answer;
- replay and slower speed;
- accents;
- language selection;
- optional learner recording;
- local playback/self-assessment;
- transcript;
- privacy notice for recording;
- no cloud upload without explicit provider phase;
- accessible text alternative.

## 12. Diagram mode

Implement:

- hotspot selection;
- typed label;
- drag label plus keyboard alternative;
- zoom/pan;
- occlusion practice;
- reveal/hint;
- text fallback;
- attempt evidence;
- accessible SVG labels.

## 13. Exam planning and custom study

Build:

- exam date;
- target decks/tags;
- available days/minutes;
- current due load;
- recommended daily practice plan;
- “today” session generation;
- weak-area focus;
- backlog catch-up;
- clear distinction between SRS due reviews and extra exam practice;
- adaptive recalculation based on completed work.

Do not promise a grade. Show assumptions.

## 14. UI and feedback

- premium transitions and microinteractions;
- no blocking celebration after every answer;
- concise explanation on incorrect/partial;
- confetti only for meaningful milestones and disabled in serious/reduced-motion mode;
- immediate local feedback;
- clear offline/sync state hooks;
- full keyboard support;
- mobile-first study layout;
- persistent but unobtrusive session controls;
- no dark patterns.

## 15. Tests

Add:

- grading corpus for languages, accents, Unicode, math, units, lists;
- distractor quality invariants;
- mastery bounds/decay;
- selection determinism and anti-repeat;
- SRS qualification eligibility and explicit consent;
- no SRS mutation from ordinary practice;
- all study modes;
- session resume;
- test scoring/partial credit;
- accessible Match fallback;
- audio unsupported-browser fallback;
- diagram keyboard flow;
- Playwright desktop/mobile/reduced-motion;
- large deck session performance.

## Required acceptance criteria

- every target study mode is functional with real deck content;
- Learn changes question type based on mastery;
- deterministic grading explains its result;
- user override is audited;
- SRS updates occur only through explicit qualified acceptance;
- practice and test results never masquerade as review logs;
- session resume and summaries work;
- accessibility alternatives exist for drag, audio, and visual diagrams;
- tests and production build pass;
- implementation status records formulas, thresholds, and measured performance.

Do not begin offline storage or cloud AI beyond interfaces required for later phases.

# Research Basis and Product Synthesis

**Research snapshot:** July 15, 2026  
**Purpose:** Record the product patterns that informed `PRODUCT_BLUEPRINT.md`. This is not a request to copy another company’s branding, source code, wording, or exact interface. Features and provider terms change; review current documentation before launch.

## Product-design conclusions

The platform should not be an “Anki clone with games” or a “Quizlet clone with an interval field.” Its architecture separates five truths:

1. **SRS state** describes durable-memory scheduling.
2. **Practice mastery** describes short-term evidence collected in Learn and study modes.
3. **Assessment results** describe a versioned assignment/test attempt.
4. **Game state and score** describe one game session.
5. **Progression** describes XP, streaks, quests, cosmetics, and motivation.

That separation is the most important synthesis. It preserves Anki-style scheduling integrity while allowing fast, playful practice. A power-up can change game score but not correctness. A lucky multiple-choice answer can produce weak practice evidence but must not silently become a high-confidence FSRS review.

The second architectural conclusion is to make **content reusable and mode-independent**. Notes and cards feed SRS Review, Learn, Write, Test, Match, diagrams, live quizzes, team games, tower defense, assignments, and exports through adapters. A game mode must not own its own copy of deck questions.

The third conclusion is to combine **power with progressive disclosure**. Advanced note types, templates, filtered study, scheduling presets, imports, and reports should exist, but common creation and study paths should remain obvious and beautiful.

## Anki

### Strengths to preserve

- A note can generate multiple cards, each with an independent schedule.
- Rich note types, fields, templates, cloze deletion, typed answers, image occlusion, media, sibling handling, and custom study.
- Explicit New, Learning, Review, and Relearning behavior.
- Again, Hard, Good, and Easy ratings.
- FSRS configuration, desired retention, learning/relearning steps, interval limits, deck presets, review logs, statistics, filtered decks, review ahead, cram, suspend, bury, leech, reschedule, forget, and undo.
- Portable, inspectable learning history is treated as real data rather than a disposable UI detail.

### Weaknesses to avoid

- A dated, utility-first interface with a steep first-run learning curve.
- Important concepts exposed through jargon before the learner needs them.
- Add-on and template power that can create cross-device inconsistency or unsafe rendering.
- Limited native social, adaptive-practice, classroom-game, and onboarding experiences.

### Resulting decisions

- Use an Anki-like note/card distinction and FSRS-first scheduling kernel.
- Hide complexity behind beginner presets while retaining an advanced panel.
- Permit sanitized templates and scoped CSS, but never arbitrary user JavaScript.
- Keep an immutable review log and make every schedule mutation explainable.
- Build the interface from an original premium design system rather than imitating Anki’s UI.

Official references:

- [Anki manual: Getting Started](https://docs.ankiweb.net/getting-started.html)
- [Anki manual: Deck Options and FSRS](https://docs.ankiweb.net/deck-options.html)
- [Anki manual: Filtered Decks and Custom Study](https://docs.ankiweb.net/filtered-decks.html)
- [Anki manual: Editing and card generation](https://docs.ankiweb.net/editing.html)

## Quizlet

### Strengths to preserve

- Low-friction term/definition creation and paste-based import.
- Polished card flipping, term/definition orientation, shuffle, autoplay, and public sharing.
- Learn-style mixing of flashcards, multiple choice, and written recall.
- Flexible grading and learner override.
- Test generation, Match, diagrams, audio/spelling, classes, visibility controls, links, and embeddable study experiences.
- A consumer-first interface that makes starting a session feel easy.

### Weaknesses to avoid

- Treating simple term/definition text as full-fidelity portability.
- Subscription boundaries that can make foundational study behavior feel inconsistent.
- Opaque adaptive or AI behavior that is difficult to audit.
- Short-term progress labels that may be mistaken for durable memory.
- Public-by-default behavior that is inappropriate for younger users or private study.

### Resulting decisions

- Make common deck creation nearly instantaneous, while preserving advanced note types.
- Build Learn as a transparent mastery engine separate from FSRS.
- Support exact, normalized, alias, keyword, list, math, unit, typo-tolerant, local-semantic, and optional cloud-semantic grading with reasons and override.
- Default new content to private and make public publishing deliberate.
- Provide complete project/account exports in addition to CSV/TSV/pasted text.

Official references:

- [Quizlet: Creating sets by importing content](https://help.quizlet.com/hc/en-us/articles/360029977151-Creating-sets-by-importing-content)
- [Quizlet: Studying with Learn](https://help.quizlet.com/hc/en-us/articles/360030986971-Studying-with-Learn)
- [Quizlet: Studying with Write](https://help.quizlet.com/hc/en-us/articles/360030986911-Studying-with-Write-mode)
- [Quizlet: Changing set visibility](https://help.quizlet.com/hc/en-us/articles/360030255191-Changing-a-set-s-visibility)
- [Quizlet: Offline studying behavior](https://help.quizlet.com/hc/en-us/articles/360030565412-Studying-offline-with-Quizlet-mobile-apps)

## Wayground, formerly Quizizz

### Strengths to preserve

- Live and assigned sessions with host-paced and learner-paced variants.
- Configurable attempts, timers, shuffle, answer release, late join, leaderboards, power-ups, mastery goals, and redemption questions.
- Power-ups that change score without changing accuracy.
- Serious or distraction-reduced presentation.
- Reports generated for sessions, including downloadable and longitudinal views.
- Transparent host controls and optional anti-cheating signals.

### Weaknesses to avoid

- A classroom-first information architecture that can overwhelm independent learners.
- Competition and spectacle becoming more important than retrieval quality.
- Speed pressure or power-up outcomes being confused with academic performance.
- Intrusive anti-cheating or public ranking.
- Feature fragmentation across plans.

### Resulting decisions

- Keep the consumer study dashboard primary; classes and assignments are optional layers.
- Store accuracy, score, time, streak, power-ups, mastery, and FSRS as separate data.
- Make serious/reduced-motion modes first-class.
- Use non-invasive anti-cheating signals only when disclosed and never infer guilt automatically.
- Offer accuracy, improvement, team, and mastery-oriented rankings, not only fastest-player ranking.

Official references:

- [Wayground: Live Session Modes](https://help.wayground.com/support/solutions/articles/158000404918-live-session-modes-on-wayground)
- [Wayground: Session Settings](https://help.wayground.com/support/solutions/articles/158000404930-navigate-session-settings)
- [Wayground: Power-Ups and score/accuracy separation](https://help.wayground.com/support/solutions/articles/158000404941-power-ups-their-types)
- [Wayground: Reports](https://help.wayground.com/support/solutions/articles/158000404058-reports-on-wayground)
- [Wayground: Live versus assigned sessions](https://help.wayground.com/support/solutions/articles/158000404965-what-s-the-difference-between-live-and-assigned-hw-sessions-)

## Gimkit and Blooket

### Strengths to preserve

- Reusable question sets that can feed many substantially different game modes.
- Standard room settings plus mode-specific configuration.
- Strategy/economy/board mechanics that create replay value beyond a normal quiz.
- Guest participation, safe nicknames, late join, spectator/host controls, assignments, and post-game reports.
- Cosmetics and progression as long-term motivation.

### Weaknesses to avoid

- Gameplay loops that reduce the proportion of time spent retrieving knowledge.
- Snowball mechanics that make early leaders unbeatable.
- Game-mode complexity that lacks accessible keyboard, reduced-motion, or non-canvas alternatives.
- Correct answers becoming merely a resource faucet with little learning feedback.
- Mode availability and reporting depth varying by plan.

### Resulting decisions

- Define a common deterministic game engine and mode-plugin registry.
- Allow hosts to tune the ratio of questions to gameplay.
- Apply anti-snowball and accuracy-first scoring defaults.
- Require every mode to declare keyboard/touch/reduced-motion behavior, reconnect semantics, reports, and deterministic tests.
- Keep cosmetics earnable-only and nonfunctional in the beta; no pay-to-win or loot boxes.

Official references:

- [Gimkit: Game options and 2D balance](https://help.gimkit.com/en/article/game-options-explained-16312ua/)
- [Gimkit: Hosting, controls, spectators, and reports](https://help.gimkit.com/en/category/hosting-1lmb5bt/)
- [Gimkit: Assignments and reports](https://help.gimkit.com/en/category/assignments-lp0oy4/)
- [Blooket: Reusable question sets and game modes](https://www.blooket.com/)
- [Blooket: Detailed game reports](https://help.blooket.com/hc/en-us/articles/16180020488727-How-to-Read-Blooket-Reports)

## RemNote, Mochi, and Knowt

### Strengths to preserve

- RemNote: bidirectional cards, cloze, image occlusion, list/multiline cards, and cards embedded in structured notes.
- Mochi: Markdown-first authoring, local-first behavior, linked cards, independent reverse schedules, diagram cards, and a complete native backup format containing metadata and review history.
- Knowt: mixed question types in Learn and spaced-repetition modes, test/match modes, exam-oriented settings, sharing, and creator/community workflows.

### Weaknesses to avoid

- Notes and cards becoming so tightly coupled that simple deck creation feels heavy.
- Proprietary native formats being the only way to preserve full history.
- An “activity streak” counting passive app opens rather than meaningful study.
- Cloud/AI generation being required for a basic workflow.

### Resulting decisions

- Support both quick deck entry and advanced structured note types.
- Include Markdown plus rich editing, references, custom fields, and full native JSON/archive exports.
- Count a streak only after a meaningful retrieval/study threshold.
- Keep deterministic and manual flows complete when AI is unavailable.

Official references:

- [RemNote: Creating flashcards](https://help.remnote.com/en/articles/6025481-creating-flashcards)
- [RemNote: Switching from Anki](https://help.remnote.com/en/articles/8664083-switching-from-anki-to-remnote)
- [Mochi documentation](https://mochi.cards/docs/)
- [Mochi: Native, Markdown, and CSV export](https://mochi.cards/docs/import-and-export/exporting/)
- [Mochi: Cards and review history](https://mochi.cards/docs/cards/)
- [Knowt: Learn Mode](https://help.knowt.com/en/articles/10714631-how-do-i-use-learn-mode)
- [Knowt: Spaced Repetition Mode](https://help.knowt.com/en/articles/10714645-how-do-i-use-the-spaced-repetition-mode)
- [Knowt: Practice Test Mode](https://help.knowt.com/en/articles/10714642-how-do-i-use-the-practice-test-mode)

## Infrastructure and agent-operation conclusions

- Supabase is suitable for the free beta, but its current free quotas are operating constraints, not scale guarantees. Quotas are read from configuration and the app degrades gracefully before storage or Realtime exhaustion.
- Vercel remains useful for previews and a 13+ non-commercial beta, but under-13 profiles are server-disabled in that deployment profile. A child-capable deployment remains provider-portable and launch-gated.
- Optional services, including AI, email, analytics, and error reporting, are adapters. Missing credentials must never break core study behavior.
- Codex receives durable repository rules through root `AGENTS.md`; each numbered prompt implements and verifies one dependent phase. The final prompt runs a cross-system repair audit.

Official references:

- [OpenAI Codex: AGENTS.md](https://developers.openai.com/codex/agent-configuration/agents-md)
- [OpenAI Codex: Best practices](https://developers.openai.com/codex/learn/best-practices)
- [Supabase pricing and free plan](https://supabase.com/pricing)
- [Supabase billing and project limits](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Vercel Acceptable Use Policy](https://vercel.com/legal/acceptable-use-policy)

## Final design rule

Use the competitors as evidence about effective product patterns, not as visual specifications. The shipped product must have original naming, copy, illustrations, component styling, motion language, information architecture, and game presentation. The goal is to combine the strongest learning and engagement principles while avoiding opaque scheduling, shallow portability, manipulative gamification, unsafe social behavior, and vendor lock-in.

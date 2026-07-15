# Phase 10 — Advanced strategy games, persistent progression, quests, cosmetics, seasons, and fair leaderboards

Read the completed game engine, event protocol, reports, SRS/mastery separation, identity/privacy model, and design system. Extend the platform through registered modules and append-only progression ledgers. Do not fork the realtime architecture or duplicate content/question logic.

## Objective

Deliver a compelling long-term game ecosystem around real learning: advanced strategy modes, solo progression, asynchronous challenges, XP, meaningful study streaks, achievements, quests, earnable cosmetic currency, inventory, and privacy-aware leaderboards. Gamification must make studying exciting without rewarding guessing, excluding accessible users, manipulating children, enabling pay-to-win, or corrupting academic/SRS data.

The beta contains no purchases. Design future monetization seams without adding checkout, loot boxes, paid power, ads, or dark patterns.

## 1. Architectural boundaries

Extend `packages/game-engine` with mode plugins and shared systems:

- deterministic resource/economy primitives;
- grid/board primitives where useful;
- wave and encounter engines;
- target selection;
- status effects;
- upgrade definitions;
- campaign progression contracts;
- asynchronous challenge verification;
- renderer-neutral public projections.

Add or complete:

- `packages/progression` only if it has real consumers and tests; otherwise keep progression in an appropriate domain package;
- game-renderer interface supporting DOM/CSS first and Canvas/WebGL only for modes that materially need it;
- dynamic loading so advanced renderers do not inflate normal study and dashboard bundles;
- deterministic seeded simulation with no renderer-dependent rules;
- versioned registries for modes, items, cosmetics, achievements, quests, and seasons.

The authoritative reducer remains capable of headless replay. Rendering receives a sanitized view model and emits intent commands; it never owns score, health, inventory, board truth, or answers.

## 2. Database schema

Create additive migrations, reconciling existing tables rather than duplicating them:

- `progression_accounts` or per-learner projection;
- `xp_events`;
- `level_definitions`;
- `streak_events` and `streak_projections`;
- `achievement_definitions`;
- `achievement_progress`;
- `achievement_unlock_events`;
- `quest_definitions`;
- `quest_instances`;
- `quest_progress_events`;
- `currency_events`;
- `catalog_items`;
- `inventory_events` and inventory projection;
- `loadouts`;
- `season_definitions`;
- `season_participation`;
- `leaderboard_definitions`;
- `leaderboard_entries` or materialized projections;
- `friend_connections` only if the existing social model safely supports mutual/guardian-aware relationships;
- `campaign_definitions`;
- `campaign_progress_events`;
- `challenge_definitions`;
- `challenge_attempts`;
- `challenge_invites`;
- `reward_claims`;
- `progression_adjustments` for compensating/admin corrections;
- anti-farming counters/projections where needed.

Requirements:

- XP, currency, rewards, inventory, and campaign progress use append-only or compensating ledgers;
- unique source-event keys prevent double awards;
- definitions are versioned and can be retired without invalidating history;
- no floating-point currency;
- projections are rebuildable;
- season boundaries use UTC with clear display zones;
- leaderboard eligibility and privacy are explicit;
- child, class, room, friend, and public scopes are distinguishable;
- indexes support daily award caps, projections, season rank, inventory, quests, and replay;
- retention preserves earned ownership while allowing raw telemetry minimization;
- all sensitive mutations occur through authorized transactions/RPCs.

## 3. Persistent progression principles

Implement one progression service that consumes trusted domain events, not arbitrary client claims. Eligible source events include:

- canonical due reviews;
- qualified written recall;
- reaching new mastery thresholds;
- completing meaningful study goals;
- assignment completion;
- validated game participation/performance;
- challenge completion;
- useful creator contribution after anti-abuse checks.

Never award from:

- opening the app;
- repeatedly revealing answers without retrieval;
- self-authored trivial content loops;
- repeated retries beyond configured diminishing returns;
- client-supplied score totals;
- deleted/replayed offline events with duplicate IDs;
- cosmetic clicks or time spent idle.

Separate progression presentation from academic truth. A level is a motivation indicator, not a claim of subject mastery.

## 4. XP and levels

Implement transparent versioned award rules:

- base XP by meaningful activity;
- quality multiplier for recall/accuracy when appropriate;
- smaller participation XP so less-skilled learners are not excluded;
- first-completion and improvement bonuses;
- diminishing returns for repeated content/mode farming;
- daily soft cap and configurable hard abuse cap;
- no penalty for reduced-motion, untimed, TTS, fewer choices, or other accommodations;
- no speed-exclusive XP;
- no XP loss for ordinary mistakes;
- compensating event for invalidated/duplicate awards rather than history deletion.

Build:

- level curve defined in data/code with tests;
- progress-to-next-level UI;
- XP receipt/details showing why it was earned;
- daily/weekly summary;
- serious mode that minimizes celebration;
- owner/admin diagnostics for duplicate/failed event processing.

Do not use manipulative endless bars, artificial near-miss purchase prompts, or notifications designed to shame a learner.

## 5. Meaningful daily study streak

A day counts only when a learner reaches a configurable meaningful threshold, such as:

- completes a minimum number of genuine SRS reviews;
- completes a minimum amount of active-answer study;
- reaches a mastery/session goal;
- completes an assignment;
- completes a validated challenge/game with enough genuine answers.

Implement:

- per-learner IANA time zone and study-day cutoff;
- preview of progress toward today’s streak;
- current, longest, and calendar history;
- idempotent daily qualification;
- time-zone change abuse protections without punishing legitimate travel;
- optional limited streak repair earned through study, not purchased in beta;
- grace behavior for service outage documented and auditable;
- guardian/serious-mode control for celebration intensity;
- no punitive messaging or public exposure by default.

Opening the app or leaving a timer running never qualifies.

## 6. Achievements

Create a data-driven achievement registry with categories:

- study consistency;
- review milestones;
- mastery/improvement;
- content creation quality;
- collaboration;
- assignment completion;
- mode-specific skill;
- accessibility-inclusive alternatives;
- community contribution where safely measurable.

Each achievement defines:

- stable key/version;
- localized title/description;
- criteria schema;
- hidden/visible state;
- progress metric;
- reward;
- icon token, not a hard-coded external asset;
- eligibility restrictions;
- retirement/migration behavior.

Avoid achievements for unhealthy session length, all-night usage, humiliating failure, excessive speed alone, spamming public content, or sharing personal data.

Unlock atomically and once. Notify accessibly. Provide a low-stimulation rendering. Add property tests for criteria and duplicate event delivery.

## 7. Daily and weekly quests

Implement a quest generator using trusted activity types and deterministic seeds. Quest examples:

- complete a small due-review goal;
- practice weak concepts;
- use written recall;
- improve accuracy relative to a personal baseline;
- finish a game without random guessing;
- create/revise a few quality cards;
- collaborate inside an authorized deck/class;
- complete an assignment before due date.

Rules:

- quests scale to account history and available content;
- always provide a non-speed alternative;
- never require social sharing, public posting, spending, ads, or cloud AI;
- do not assign impossible activities when a feature is disabled;
- allow one limited reroll without manipulation;
- use local date boundaries correctly;
- rewards claim idempotently or auto-claim with a clear receipt;
- child profiles receive conservative, privacy-safe quests;
- missed quests disappear without guilt-inducing loss language.

Build daily/weekly quest panels, completion animation, serious-mode display, and history.

## 8. Currency, catalog, cosmetics, and inventory

The beta currency is earned only. Implement:

- integer currency ledger;
- award/spend/refund/adjustment event types;
- idempotent transactions;
- catalog availability windows;
- inventory ownership projection;
- equip/unequip loadouts;
- preview;
- duplicate handling;
- refunds for retired/broken items;
- age-appropriate labels;
- serious mode that hides currency/catalog/cosmetics;
- configurable global disable switch.

Initial cosmetic categories:

- generated-avatar parts;
- profile frames;
- card backs;
- study table/background themes;
- game trails/effects with reduced-motion alternatives;
- podium poses/stickers;
- room banners;
- sound packs with mute controls;
- badges/titles.

Requirements:

- no random paid rewards, loot boxes, wagering, trading, cash value, scarcity pressure, or pay-to-win;
- no user-uploaded marketplace in this phase;
- cosmetics cannot obscure questions/answers or impair accessibility;
- effects have motion/flash/audio limits;
- all item assets are original, locally owned/licensed, or generated from project primitives;
- future commerce can plug into a separate entitlement interface but remains unimplemented and disabled.

## 9. Leaderboards and social ranking

Implement opt-in scoped leaderboards:

- personal best/history;
- private room;
- class;
- mutually approved friends, only if the safe relationship model exists;
- team;
- seasonal eligible-user leaderboard behind a disabled-by-default public feature flag.

Support ranking by:

- game score;
- accuracy;
- improvement;
- mastery progress;
- consistency;
- team contribution.

Privacy/safety:

- under-13 profiles never appear on global/public leaderboards;
- child profiles use class/private room/family-approved scopes only;
- pseudonyms and generated avatars by default;
- users can opt out and hide rank;
- blocked users do not appear to one another where feasible;
- class staff control class leaderboard visibility;
- accommodations do not create a visible label or ranking penalty;
- minimum cohort sizes where aggregate privacy matters;
- ties are deterministic and documented;
- suspicious runs may be withheld pending review, never publicly accused.

Prevent rank manipulation with unique verified source events, daily caps, content diversity checks, impossible-rate signals, and administrative compensating adjustments.

## 10. Seasons

Implement a configurable season framework without creating pressure to pay:

- start/end/grace dates;
- eligible scopes;
- season points from trusted activities;
- tier definitions;
- free reward track only in the beta;
- opt-in participation;
- private-by-default display;
- end-of-season snapshot and reward grant;
- archived history;
- no loss of purchased value because there is no purchasing;
- no child global participation;
- no countdown dark patterns or aggressive notifications.

Provide a seeded development season and an admin/owner setup workflow. A season may be disabled entirely without breaking XP, streaks, or games.

## 11. Advanced game modes

Implement each mode as a complete registered plugin over Phase 9 infrastructure. All use real deck questions, deterministic reducers, versioned configs, reports, reconnect, and accessibility alternatives.

### 11.1 Battle

- correct answers charge actions such as attack, shield, heal, cleanse, or team support;
- targets and effects are abstract/friendly rather than violent or harassing;
- no targeting based on protected/personal characteristics;
- eliminated players remain engaged through support/spectate/practice mechanics;
- strategy affects game resources/score, not correctness;
- team and free-for-all variants;
- prevent dogpiling with target cooldowns or defensive balancing;
- report academic and battle outcomes separately.

### 11.2 Economy

- correct answers earn bounded in-game income;
- players choose transparent upgrades with deterministic costs/effects;
- no real money, wagering, or randomized purchases;
- anti-snowball balancing and catch-up paths;
- solo, team, and asynchronous variants;
- end conditions based on score/objective/time;
- strategy log and accessible non-animated shop.

### 11.3 Territory

- teams claim/defend cells or zones through correct answers;
- board seed and adjacency rules are deterministic;
- simultaneous conflicts resolve through documented fair rules;
- color plus shape/pattern labels for accessibility;
- reconnect reconstructs the board;
- compact event deltas rather than full-board broadcast;
- keyboard/list alternative to map interaction.

### 11.4 Tower Defense

- correct answers generate placement/upgrade resources;
- deterministic waves and pathing;
- no answer activity while a visually inaccessible real-time action is required—support pause/turn windows or auto-resolution;
- tower, upgrade, enemy, wave, and map registries;
- difficulty scales without making questions unfair;
- solo first, cooperative team variant where stable;
- save/resume solo campaign run;
- Canvas renderer only if justified, with DOM/list strategy alternative.

### 11.5 Board Control

- turn or phase-based movement/area control driven by correct answers;
- deterministic board and action order;
- no physical dexterity advantage;
- compact rule set, tutorial, and projected legal actions;
- solo AI opponent may be deterministic/rule-based, not cloud AI;
- team and head-to-head variants;
- accessible grid/list controls.

### 11.6 Solo Campaign

- map/stage definitions;
- encounters, bosses, modifiers, and rewards;
- uses decks/tags selected by the learner;
- adapts question selection through existing mastery signals without writing false mastery;
- save/resume;
- three-star or equivalent goals based on accuracy/improvement, not only speed;
- practice failed stage without resource punishment;
- content/version migration strategy;
- offline-capable where dependencies allow.

### 11.7 Asynchronous Challenge

- host/player creates a seeded challenge from authorized content;
- shareable high-entropy invite with expiry and attempt policy;
- content snapshot and exact rule version;
- one canonical scored attempt plus unranked practice attempts;
- server-verifiable event/answer log;
- private/friend/class standings;
- late/offline upload policy with signed start/end windows;
- no public child exposure;
- report and rematch.

### 11.8 Assignment Game wrapper

- any compatible game mode can be attached to an assignment snapshot;
- assignment completion, academic score, game score, and XP are separate;
- accommodations override mode settings safely;
- teacher can disable leaderboard/power-ups/speed;
- report maps to existing class views;
- replay/rematch does not silently replace a submitted graded attempt.

## 12. Renderer and media behavior

Prefer semantic DOM/CSS for lobbies, questions, economy panels, cards, simple boards, and results. Use Canvas/WebGL only for advanced game scenes that need it, behind a lazy-loaded adapter.

Renderer contract:

- receives immutable public projection;
- emits validated intents;
- no database/network calls;
- deterministic interpolation from state/timestamps;
- pause/resume;
- resize and safe-area handling;
- keyboard/touch/gamepad only where accessible;
- reduced-motion mode;
- high-contrast/pattern mode;
- screen-reader summary and equivalent controls;
- audio manager with mute, volume, captions/text cues;
- disposes resources on route/session end;
- no hidden animation loop on inactive tabs.

Enforce performance budgets and avoid adding a heavy game dependency to the core dashboard bundle.

## 13. Fairness, healthy engagement, and child safeguards

Implement product-level guardrails:

- accuracy-first defaults;
- no negative currency/debt;
- no purchased advantages;
- no random monetized rewards;
- no public under-13 profiles/rankings;
- no direct messages or unrestricted chat;
- no shame messages for broken streaks or losses;
- configurable celebration intensity;
- session-duration reminders after a reasonable configurable period;
- quiet hours for optional notifications;
- guardian controls for social scopes, cosmetics, and celebration intensity;
- serious mode globally available;
- accommodations never reduce academic credit or progression opportunity;
- age-appropriate naming/content moderation for catalog assets.

Do not claim clinical or educational outcomes. Gamification is a motivational interface over real practice, not proof of learning.

## 14. UI and journeys

Build polished routes/components for:

- progression home/summary;
- XP receipt and history;
- study streak calendar/progress;
- achievements gallery/detail;
- daily/weekly quests;
- catalog;
- inventory/loadout;
- cosmetics preview;
- personal/class/private leaderboards;
- seasons;
- campaign map/stage setup/play/results;
- asynchronous challenge create/join/results;
- rules/tutorial/configuration/play/results for every advanced mode;
- serious/reduced-motion equivalents;
- owner/admin definition diagnostics where appropriate.

The main dashboard should surface a compact “continue learning” priority before optional games/progression. Avoid casino styling, deceptive scarcity, or clutter. Celebrations must be satisfying, brief, skippable, and accessible.

## 15. Tests and verification

Add:

- ledger idempotency/rebuild/compensation tests;
- concurrent reward claim/spend tests;
- XP caps/diminishing returns/content-farming tests;
- streak timezone, DST, study-day cutoff, travel, and outage tests;
- achievement/quest property tests;
- inventory ownership/equip/refund tests;
- season boundary tests;
- leaderboard privacy/tie/eligibility/block tests;
- child/guardian/class restrictions;
- deterministic reducer/replay tests for all advanced modes;
- board/wave/economy invariant/property tests;
- reconnect/save/resume/asynchronous verification;
- renderer disposal/bundle split/performance tests;
- keyboard/touch/reduced-motion/high-contrast/screen-reader tests;
- Playwright journeys for earning XP, streak, quest, cosmetic purchase with earned currency, equip, campaign, each advanced mode, challenge, assignment wrapper, and opt-out;
- load tests for compact territory/battle events and leaderboard projections;
- production build and bundle analysis.

Use fixed clocks/seeds and deterministic fixtures. Tests must prove game strategy cannot change academic correctness, mastery, or FSRS state.

## Required acceptance criteria

- all eight advanced mode/wrapper capabilities are implemented as real common-engine plugins;
- solo campaign and asynchronous challenges persist and recover correctly;
- XP, streaks, achievements, quests, currency, inventory, and rewards use trusted idempotent ledgers/events;
- meaningful streaks require real study behavior;
- cosmetics are earned-only, nonfunctional, accessible, and hideable;
- leaderboards are opt-in/scoped and exclude under-13 users from public/global scopes;
- accommodations and serious mode work across progression and games without penalty;
- no pay-to-win, ads, checkout, loot boxes, or dark patterns are introduced;
- advanced renderers are isolated and do not bloat ordinary study routes;
- reports keep academic and strategic results separate;
- RLS, database, property, E2E, accessibility, performance, load, and production-build checks pass;
- implementation status, event protocols, data model, rules registry, accessibility notes, and setup documentation are updated with exact evidence.

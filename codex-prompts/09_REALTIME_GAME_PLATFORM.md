# Phase 9 — Authoritative realtime game platform, guest rooms, initial modes, reports, and recovery

Read `AGENTS.md`, the blueprint, architecture decisions, implementation status, all existing content/study/class code, and the current Realtime abstractions before changing anything. Implement the game platform as a real shared engine over reusable deck content. Do not build a collection of disconnected page-specific demos.

## Objective

Deliver a production-oriented solo, asynchronous, and realtime multiplayer platform that can turn eligible deck content into engaging games. The server/database is authoritative for joins, assigned questions, accepted answers, scores, power-ups, host commands, and final results. Clients render optimistic presentation only. Academic correctness, game score, mastery, and FSRS state remain separate.

Core study and deck use must continue to work when Realtime is unavailable or the room quota is reached.

## 1. Architecture and packages

Create or complete real APIs in:

- `packages/game-engine` for mode-neutral deterministic state, seeded randomization, reducers, scoring, question selection, answer adjudication contracts, and replay;
- `packages/realtime` for provider-neutral rooms, channels, presence, sequence recovery, reconnect, authorization, and message schemas;
- `packages/domain` for game/session/report entities;
- `packages/database` for typed repositories and authorized commands;
- `packages/ui` for reusable lobby, player, host, scoreboard, question, power-up, results, and accessibility components;
- `apps/web` for routes, Server Actions/Route Handlers, screens, and Realtime clients.

Do not let mode code import React, Supabase clients, or wall-clock globals. Inject time, seeded PRNG, and IDs so reducers are deterministic and replayable.

Define stable interfaces such as:

```ts
interface GameModeDefinition<Config, State, Event, PublicView> {
  id: string;
  version: number;
  configSchema: ZodType<Config>;
  initialState(input: GameStartInput<Config>): State;
  reduce(state: State, event: AuthoritativeGameEvent<Event>): State;
  getPublicView(state: State, viewer: GameViewer): PublicView;
  getEndResult(state: State): GameEndResult | null;
  mapToReport(state: State): GameReportProjection;
}
```

Use versioned registries. A recorded session must identify the exact mode/rules/scoring/content versions needed for replay and reports.

## 2. Database schema

Add additive migrations for the canonical game model, adapting names only when existing schema already owns them:

- `game_modes` or a code registry projection;
- `game_sessions`;
- `game_session_content_snapshots`;
- `game_join_codes`;
- `game_participants`;
- `game_participant_sessions` for reconnect/device presence when useful;
- `game_teams`;
- `game_team_members`;
- `game_rounds`;
- `game_question_instances`;
- `game_answer_submissions`;
- `game_score_events`;
- `game_resource_events`;
- `game_powerup_events`;
- `game_events` for critical authoritative events;
- `game_snapshots`;
- `game_host_commands`;
- `game_reactions` with short retention;
- `game_room_bans`;
- `game_reports` and report projections;
- `daily_challenge_definitions` and attempts where needed;
- retention/cleanup job records.

Requirements:

- immutable content snapshot or snapshot reference for every started session;
- protocol, mode, config, content, scoring, and reducer versions;
- sortable authoritative sequence per game;
- idempotency keys on joins, commands, and answers;
- accepted/rejected answer status with reason code;
- correctness and partial-credit fields separate from score delta;
- integer score/resource ledgers, not mutable client-owned totals;
- server timestamps and deadline timestamps;
- reconnect token hashes only, never raw tokens;
- short-lived guest identity metadata with documented cleanup;
- indexes for join-code lookup, active rooms, participant reconnect, sequence reads, reports, and retention;
- no public table that permits room, participant, or join-code enumeration.

Use atomic Postgres RPCs or equally strong server-side transactions for join, start, answer acceptance, host command, power-up use, and game completion. Set explicit `search_path`, validate authorization, and test concurrent calls.

## 3. Authorization and RLS

Implement and test policies for:

- host/owner;
- co-host or authorized class staff;
- authenticated participant;
- ephemeral guest participant;
- team member;
- spectator;
- class member;
- blocked/kicked/banned participant;
- expired room;
- public versus private room;
- parent/guardian context where applicable;
- service/cleanup worker.

Rules:

- a participant receives only the public projection and private question/answer data assigned to that participant;
- clients cannot write score totals, correctness, deadlines, teams, inventory, or authoritative events directly;
- spectators cannot submit answers or infer hidden answers;
- team-private state is visible only to authorized teammates/host;
- a guest claim authorizes one room/participant and expires quickly;
- host capability is checked server-side for every command;
- game reports obey class/content permissions and do not expose unrelated personal study data;
- child profiles never expose real names or private profile fields through room payloads.

Add SQL policy tests and application-level capability tests.

## 4. Realtime provider and event protocol

Use authorized private Supabase Realtime Broadcast channels for compact ephemeral events and Presence only for low-frequency connected-state information. Persist critical transitions in Postgres. Do not broadcast timer ticks; broadcast a server deadline and let clients derive display time.

Implement a versioned protocol containing at least:

```text
room.created
room.locked
room.unlocked
participant.joined
participant.left
participant.reconnected
participant.kicked
participant.banned
participant.role_changed
team.changed
game.started
round.started
question.assigned
answer.received
answer.accepted
answer.rejected
score.updated
streak.updated
resource.updated
powerup.granted
powerup.used
reaction.sent
host.command
game.paused
game.resumed
round.ended
game.ended
snapshot.available
room.closed
```

Every envelope includes:

- protocol version;
- game/session ID;
- event ID;
- authoritative sequence;
- server timestamp;
- safe actor reference;
- event type;
- schema-validated payload;
- optional correlation/idempotency ID.

Create shared Zod schemas and exhaustive event handling. Reject unknown versions safely, log a diagnostic without secrets, and trigger snapshot recovery when a sequence gap is detected.

## 5. Snapshot, reconnect, and recovery

Implement a reconnect protocol:

1. client retains its participant ID and single-use/rotating reconnect credential in safe session storage;
2. server validates room, participant, hash, expiry, and ban state;
3. client requests the latest authorized snapshot and events after its last sequence;
4. server rotates the reconnect credential where practical;
5. client reconstructs state through the deterministic reducer;
6. duplicate answer/command submissions resolve idempotently;
7. expired games open in read-only results mode when authorized.

Persist snapshots at game start, round boundaries, material host changes, configurable event intervals, and game end. Compact or expire raw low-value events according to retention while preserving the report and score ledger.

Handle:

- tab refresh;
- brief network loss;
- host disconnect;
- participant device switch;
- duplicate tabs;
- late join;
- room full;
- Realtime connection limit reached;
- Postgres write succeeds but Broadcast fails;
- Broadcast arrives before local fetch completes;
- clock skew;
- session pause/resume;
- server restart.

## 6. Guest join and lobby

Implement a polished join flow at `/join` and `/join/[code]`:

- human-friendly high-entropy join code with collision handling;
- normalized input and rate-limited lookup;
- room preview containing only safe fields;
- optional generated nickname or filtered custom nickname;
- safe-name mode;
- generated avatar/icon without personal photos;
- optional Supabase anonymous auth or a signed room-scoped ephemeral claim behind an adapter;
- explicit guest privacy notice;
- host approval option;
- team choice or auto-balance;
- spectator option when enabled;
- reconnect support;
- guest cleanup within configured retention;
- no account needed to join an enabled room;
- account conversion after the game is optional but never dark-patterned.

Lobby features:

- host-ready controls;
- participant list with connection status;
- team management;
- capacity indicator;
- lock/unlock;
- safe names;
- remove/ban;
- reaction mute;
- late-join policy;
- spectators;
- accommodations/serious mode;
- game rules preview;
- accessible “copy code/link”;
- QR code generated locally, without an external tracking service.

Unrestricted text chat and direct messages are out of scope and must not be added. Implement curated, rate-limited reactions/phrases only.

## 7. Game creation and configuration

Any content owner, host, or authorized class staff member can create a game from a deck, selected tags, assignment snapshot, or supported question subset.

Configuration supports:

- mode;
- solo, synchronous, self-paced, team, or asynchronous variant when the mode allows it;
- public/private/unlisted room;
- maximum players, capped by `MAX_GAME_PLAYERS`;
- guests;
- spectators;
- late join;
- manual/automatic team assignment;
- question count;
- question selection and card-direction rules;
- multiple-choice/written/mixed question types;
- answer retries;
- whole-game/per-question timers;
- randomized order and options;
- same question for all versus individualized assignment;
- power-ups;
- speed influence;
- streak behavior;
- leaderboard visibility;
- serious/reduced-stimulation mode;
- assignment/report linkage;
- accessibility accommodations;
- content language and TTS settings;
- deterministic seed;
- end condition.

Validate incompatible combinations and explain them in the UI rather than failing at start.

## 8. Question eligibility and answer adjudication

Use the existing content and grading engines. Build a question adapter that maps supported cards/notes to game-safe question instances. Preserve the source card/note/version reference for reports, but never leak the answer before adjudication.

Rules:

- use manually authored distractors when available;
- deterministic deck-derived distractors otherwise;
- do not require cloud AI;
- avoid sibling answers that trivially reveal the correct option;
- deduplicate choices after normalization;
- support partial credit only for compatible modes/types;
- accessibility accommodations can reduce choice count or replace drag interactions;
- question-instance tokens are server issued and expire;
- one accepted answer per participant/question unless retries are explicitly enabled;
- server computes correctness using the shared grading package;
- a game submission never becomes an FSRS review automatically;
- optional post-game “review missed cards” creates a practice/custom-study session, not retroactive ratings.

## 9. Scoring and streaks

Implement a versioned scoring strategy with the blueprint default:

```text
base = 1000 * correctness
speedComponent = clamp((deadline - answerTime) / allowedTime, 0, 1)
speedMultiplier = 0.75 + 0.25 * speedComponent
streakMultiplier = 1 + min(streak, 10) * 0.03
difficultyMultiplier = clamp(questionDifficulty, 0.9, 1.2)
score = floor(base * speedMultiplier * streakMultiplier * difficultyMultiplier)
```

Requirements:

- incorrect answers earn no correctness score;
- speed never outweighs accuracy;
- submitted-at time is server-clamped with documented latency handling;
- accessibility accommodations may remove speed scoring without reducing academic credit or persistent XP fairness;
- mode overrides are explicit and versioned;
- every score change is derived from an append-only score event;
- scoreboard is a projection that can be rebuilt;
- ties use deterministic, documented rules;
- score, accuracy, time, streak, mastery, XP, and SRS remain separate fields.

## 10. Power-ups

Implement the mode-neutral power-up framework and an initial set:

- 50/50;
- erase one distractor;
- retry shield;
- score x2 for a bounded eligible event;
- streak shield;
- time freeze/extension represented server-side;
- gift to teammate/player where allowed;
- risk/reward double jeopardy.

Each power-up has:

- registry definition/version;
- eligibility;
- grant rule;
- target rule;
- duration/consumption;
- reducer event;
- accessible explanation;
- visual treatment;
- serious-mode treatment;
- audit/ledger row;
- abuse tests.

Power-ups affect only game score/resources/presentation, never correctness, mastery, assignment academic score, or FSRS scheduling. Do not add paid or pay-to-win acquisition.

## 11. Host controls

Implement server-authorized controls:

- start;
- pause/resume;
- end;
- lock/unlock;
- enable/disable late join;
- kick/ban;
- mute reactions;
- rename to generated safe name;
- move/balance teams;
- promote co-host where policy permits;
- toggle spectator;
- skip/replace an invalid question with report annotation;
- extend a deadline;
- enable/disable power-ups;
- show/hide leaderboard;
- serious mode;
- accommodations;
- download report.

Define host-disconnect policy: a co-host takes over when present; otherwise allow a configurable grace period and server-driven continuation/pause. Never let an ordinary participant acquire host rights through a client event.

## 12. Initial game modes

Implement all of these as registered, tested modes using the common engine—not as stubs:

1. **Classic Quiz** — synchronized or self-paced, solo/individual/team.
2. **Speed Round** — rapid sequence with bounded speed multiplier and clean transition timing.
3. **Match Race** — term/definition matching with penalties for incorrect matches and a keyboard/list alternative.
4. **Streak Challenge** — streak-focused run with shields and accuracy-first ranking.
5. **Survival** — limited lives, progressive difficulty, no humiliating elimination display; eliminated players can spectate or practice.
6. **Mastery Peak** — individual and optional team progress toward a mastery-like session target; does not write canonical mastery unless the ordinary practice qualification policy applies.
7. **Team Relay** — controlled turns or contribution windows with reconnect/absence handling.
8. **Daily Challenge** — date/locale-aware seeded solo challenge, one canonical scored run plus practice reruns, private/friend/class ranking only.
9. **Head-to-Head Duel** — short synchronized match with fair same-content policy and disconnect resolution.
10. **Host-Paced Classroom** — host advances the same question for everyone, with answer reveal and discussion pause.

Every mode must include:

- rules and examples;
- typed configuration schema;
- deterministic reducer;
- end conditions;
- question compatibility declaration;
- reconnect behavior;
- solo/local fallback where sensible;
- keyboard and touch controls;
- reduced-motion/serious alternative;
- results mapping;
- unit/property/E2E tests.

Do not implement the advanced strategy games owned by Phase 10 in this phase.

## 13. Reports and post-game experience

At game end, create an immutable report projection containing:

- participants/teams using safe display identities;
- completion/disconnect state;
- game score;
- academic accuracy and partial credit;
- answer count;
- response-time summary;
- streaks;
- question/card/concept performance;
- most missed concepts;
- power-up/resource summary separate from academics;
- skipped/invalid question annotations;
- assignment completion mapping;
- content/mode/scoring versions;
- suspicious-event flags as signals, never automatic guilt.

Build:

- animated but reduced-motion-safe podium/summary;
- personal recap before public standings;
- accuracy/improvement/team views, not only speed rank;
- “study missed cards” action;
- rematch with a new seed;
- host report dashboard;
- CSV export;
- print/PDF-friendly report;
- class/assignment report integration;
- privacy-aware participant labels;
- report retention and deletion behavior.

Guests see their own result during the session without gaining permanent access to class reports.

## 14. Anti-cheating and abuse controls

Implement proportionate protections:

- server-issued question-instance token;
- server deadlines;
- one accepted submission/idempotency;
- sequence validation;
- duplicate-tab/device rules;
- impossible-latency and impossible-volume signals;
- rate limits for join, name change, answer, command, reaction, reconnect;
- optional disclosed focus/visibility/fullscreen signals;
- normalized name filtering;
- room ban list;
- no camera/microphone surveillance;
- no browser fingerprinting;
- no automatic punitive action from a heuristic alone.

Record privacy-minimized audit information and expose a host-readable explanation for flags.

## 15. Free-tier and graceful-degradation behavior

Default to 40 active players per room and read all limits from validated configuration. Minimize Realtime usage:

- deadline timestamps instead of timer ticks;
- deltas instead of full snapshots;
- Presence only when useful;
- coalesce cosmetic updates;
- disable cursor-like/nonessential presence first;
- keep authoritative events compact;
- batch safe report writes;
- measure approximate message count in load tests.

When capacity is unavailable:

- prevent starting an over-cap room before participants invest time;
- show a clear owner/host message;
- offer solo/asynchronous fallback where possible;
- never corrupt an active game;
- keep results and exports available;
- do not claim that free-tier limits guarantee a particular load.

## 16. UI and visual quality

Build premium, original responsive experiences for:

- game picker and mode previews;
- create/configure flow;
- lobby;
- host console;
- participant screen;
- spectator screen;
- synchronized question reveal;
- self-paced question flow;
- team status;
- power-up tray/targeting;
- scoreboard;
- pause/reconnect/offline/full-room states;
- results/podium/recap;
- reports.

Use the established design tokens. Motion must communicate state, not delay input. Respect reduced motion and serious mode. Keep controls reachable on phones, avoid layout shift, use safe-area insets, and give every drag/timed interaction an accessible alternative. Announce time, answer status, score changes, and round transitions without overwhelming screen-reader users.

## 17. Tests and verification

Add meaningful automated coverage:

- reducer unit and property tests for deterministic replay;
- score, ties, streaks, deadlines, partial credit, and accommodations;
- power-up invariants;
- question eligibility/no answer leakage;
- concurrent answer idempotency;
- join-code collision/expiry/rate limits;
- guest/reconnect/rotation/ban;
- host authorization;
- RLS matrix;
- sequence gaps/snapshot recovery;
- host disconnect;
- Realtime failure after DB commit;
- all ten modes and end conditions;
- assignment/report mapping;
- child/safe-name/social restrictions;
- axe/keyboard/reduced-motion checks;
- Playwright multi-context host, players, spectator, late join, reconnect, kick, teams, and game end;
- k6 or equivalent room simulations at documented free-beta targets using a safe local/test environment;
- production build.

Use deterministic clocks and seeds. Do not make CI depend on paid services. Document any true provider behavior that is implemented but not live-verified without credentials.

## Required acceptance criteria

- a host can create a game from real deck content and configure a supported mode;
- guests can join by code without a permanent account when enabled;
- authenticated and guest participants can reconnect safely;
- the server/database—not the client—adjudicates answers, scoring, power-ups, host commands, and completion;
- all ten initial modes are actually playable and share the common engine;
- teams, spectators, late join, safe names, curated reactions, and host controls work;
- academic accuracy is visibly separate from game score;
- no game action silently changes FSRS;
- reports and CSV/print exports work and integrate with assignments;
- sequence recovery and idempotency prevent duplicate scoring;
- room limits and Realtime failure degrade gracefully;
- RLS, database, unit, E2E, accessibility, load, and production-build checks pass;
- implementation status, data model, event protocol, setup, and operating documentation are updated with exact evidence.

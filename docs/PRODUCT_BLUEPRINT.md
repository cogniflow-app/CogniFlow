# Product and System Blueprint — Project Lumen

**Status:** Canonical product target  
**Temporary brand:** Lumen  
**Product class:** Premium flashcards, adaptive learning, spaced repetition, and modular study games  
**Initial commercial posture:** Free beta; no advertising; no sale of user data; possible freemium later  
**Primary platform:** Responsive web application and installable PWA  
**Backend:** Supabase  
**Preferred preview/13+ beta hosting:** Vercel  
**Provider-portable child-capable candidate:** Cloudflare Workers/OpenNext, subject to current terms and legal review

---

## 1. Product vision

Lumen should feel like a polished consumer learning product rather than a database front end. It combines three deep systems:

1. **Long-term memory:** an auditable FSRS-first spaced-repetition engine with Anki-style notes, templates, sibling cards, advanced scheduling controls, and full review history.
2. **Adaptive practice:** a friendly, high-motion but accessible study layer that changes question format as mastery improves and supports flashcards, written recall, multiple choice, tests, matching, diagrams, spelling, audio, and exam planning.
3. **Games:** a reusable question-content layer feeding solo, asynchronous, classroom, and live multiplayer game modules with accuracy, speed, streaks, teams, power-ups, progression, and reports.

These systems share content but do not share truth indiscriminately:

- **Card scheduling state** represents long-term memory.
- **Practice/mastery state** represents confidence and performance in guided study.
- **Game state and score** represent a particular game.
- **XP, streaks, quests, and currency** represent engagement.
- **Assignment results** represent completion and assessment evidence.

A game power-up may change game score. It must never change academic accuracy, mastery evidence, or FSRS state. A lucky multiple-choice answer may improve practice mastery slightly, but it must not silently count as a high-confidence FSRS review.

---

## 2. Product priorities

In order:

1. Long-term personal retention.
2. Short-term exam preparation.
3. Classroom review and host-led games.
4. Language learning.
5. Medical, legal, and professional certification study.
6. Public deck discovery and creator ecosystem.
7. Social study with friends.

The product is not exclusively a classroom tool. Any authenticated user can create decks and may host a game or create an assignment. “Learner,” “creator,” and “host” are capabilities, not mutually exclusive account types.

---

## 3. Launch profiles and child-safety gate

### 3.1 Vercel profile

The Vercel profile is for previews and an initial 13+ non-commercial beta.

```env
DEPLOYMENT_PROFILE=vercel_beta
ENABLE_CHILD_PROFILES=false
ENABLE_PUBLIC_CHILD_CONTENT=false
ENABLE_FREE_TEXT_GAME_CHAT=false
```

The server must reject attempts to create, activate, or switch into an under-13 learner profile even if a client tampers with the UI. Public deck preview and ephemeral game joining are still subject to the platform owner’s current provider-policy review.

### 3.2 Child-capable profile

The codebase must remain deployable using a portable adapter, provisionally Cloudflare Workers with OpenNext. This is not a declaration of legal compliance. Under-13 support stays disabled until:

- current hosting, database, email, analytics, realtime, storage, AI, and error-monitoring terms are reviewed;
- a real privacy notice and direct notice to parents exist;
- a verifiable parental-consent method is selected and implemented;
- data retention, deletion, parent access, incident response, and vendor records are reviewed;
- applicable U.S. federal and state requirements are evaluated by qualified counsel.

### 3.3 Account model for minors

Under-13 learners do not receive independent email-based Supabase Auth accounts.

- A guardian owns an authenticated account.
- The guardian creates a pseudonymous child learner profile.
- A child may switch into that profile with a family code and PIN or a signed profile session.
- Store an age band, not an exact birth date, unless a reviewed consent process requires more.
- A school-managed learner profile may be created under a school authorization context, but school access does not grant ownership of private personal decks or personal SRS history.
- Child profiles have no public biography, direct messages, unrestricted comments, unrestricted chat, external links, or global leaderboards.
- Child public publishing requires guardian, teacher, or moderator approval.
- Curated emoji and phrase reactions are permitted in games; free-text game chat is disabled in the beta.
- Analytics on child surfaces are first-party and minimized; no session replay, targeted advertising, or cross-site tracking.

---

## 4. Competitive synthesis translated into product rules

### Anki-derived strengths to preserve

- Notes generate one or more independently scheduled cards.
- Basic, reverse, optional reverse, cloze, image occlusion, typed answers, custom fields, templates, and sibling burying.
- Four ratings: Again, Hard, Good, Easy.
- Learning, Review, Relearning, and New states.
- Desired retention, learning/relearning steps, maximum interval, limits, ordering, custom study, filtered study, review ahead, cram, bury, suspend, leech, reset, reschedule, and undo.
- Review history, statistics, forecast, and import/export of scheduling data.
- Power and auditability without reproducing Anki’s dated visual design.

### Quizlet-derived strengths to preserve

- Extremely low-friction deck creation and editing.
- A delightful card flip/swipe experience.
- Learn Mode that mixes flashcards, multiple choice, and written recall.
- Strict, moderate, and relaxed grading.
- “I was correct” override with audit.
- Test generation, Match, spelling/audio, diagrams, term/definition orientation, shuffle, starred-only study, and autoplay.
- Public view links and easy plain-text import/export.

Weaknesses to avoid:

- Hiding foundational learning tools behind confusing paywalls.
- Treating simple term/definition export as full portability.
- Letting opaque grading or AI silently decide high-stakes correctness.
- Conflating short-term “mastery” with durable memory.

### Wayground/Quizizz-derived strengths to preserve

- Join codes, live and assigned sessions, individual/team/host-paced modes.
- Power-ups that affect game score but not academic accuracy.
- Redemption opportunities, configurable timers, late join, spectator and host controls.
- Reports for accuracy, score, completion, time, student, question, and attempt.
- Mastery-oriented collaborative goals, not only winner-take-all competition.
- Focus/anti-cheat signals that are transparent and non-invasive.

### Gimkit/Blooket-derived strengths to preserve

- Reusable question content independent from game mode.
- A broad mode catalog with calm, competitive, strategic, solo, and team options.
- Game-specific options plus common room options.
- Accounts optional for joining live games; accounts required for persistent progression.
- Safe nickname generation.
- Assignments and downloadable reports.
- Persistent cosmetics and progression without pay-to-win.

### RemNote/Mochi/Knowt-derived strengths to preserve

- Bidirectional and list-answer cards.
- Markdown-friendly content and portable backups.
- Templates, attachments, and review history in exports.
- Mixed question types inside spaced or adaptive study.
- Exam-date planning and a clean global due queue.
- Collaboration and published deck links.

---

## 5. Information architecture and routes

Use route groups where helpful. Exact URL names may change, but every destination needs a real implementation.

### Public routes

```text
/
 /discover
 /deck/[slug]
 /creator/[handle]
 /embed/deck/[publicId]
 /join
 /join/[code]
 /privacy
 /terms
 /safety
 /copyright
 /auth/*
```

Unauthenticated users can:

- discover public decks;
- open a public deck;
- flip through a nonpersistent preview;
- view public creator profiles appropriate to their age context;
- join an allowed live game by code as an ephemeral guest.

They cannot save progress, create content, follow, rate, comment, study adaptively, or gain persistent XP without an account.

### Authenticated application routes

```text
/app
/app/today
/app/library
/app/library/folders/[id]
/app/decks/new
/app/decks/[id]
/app/decks/[id]/edit
/app/decks/[id]/cards
/app/decks/[id]/settings
/app/decks/[id]/history
/app/study/[deckId]/flashcards
/app/study/[deckId]/review
/app/study/[deckId]/learn
/app/study/[deckId]/write
/app/study/[deckId]/test
/app/study/[deckId]/match
/app/study/[deckId]/spell
/app/study/[deckId]/diagram
/app/study/custom
/app/stats
/app/import
/app/export
/app/classes
/app/classes/[id]
/app/assignments/[id]
/app/games
/app/games/host/[deckId]
/app/games/room/[code]
/app/games/history/[id]
/app/profile
/app/settings/*
/app/parent/*
/app/moderation/*         # capability-gated
```

### Primary dashboard

The home dashboard shows:

- due reviews and a prominent “Study now” action;
- daily goal and meaningful streak;
- recent decks;
- weak concepts;
- active assignments;
- game invitations/history;
- quick create/import;
- optional discovery recommendations;
- offline/sync state.

Avoid a cluttered Anki-style deck list. Preserve information density through progressive disclosure.

---

## 6. Original premium design system

### Visual character

- Original identity; no Quizlet or Wayground clone.
- Friendly geometry, excellent typography, clear hierarchy, generous spacing.
- Light and dark themes.
- Premium study surfaces use depth, restrained gradients, soft shadows, and crisp borders.
- Game surfaces may be more expressive but still share core tokens.
- No excessive glassmorphism, random neon, or animation that obstructs learning.

### Tokens

Define semantic CSS variables and typed tokens:

```text
background, surface, surface-raised, surface-sunken
text, text-muted, text-subtle, text-inverse
border, border-strong
brand, brand-hover, brand-contrast
success, warning, danger, info
mastery-new, mastery-learning, mastery-familiar, mastery-mastered
game-accent-1..n
radius-sm/md/lg/xl/full
shadow-sm/md/lg/focus
duration-fast/base/slow
easing-standard/emphasized/spring
```

Never rely on color alone for correctness or mastery.

### Motion

- Typical UI transition: 150–240 ms.
- Card flip: perspective-based, interruptible, keyboard accessible.
- Study answer feedback: short and nonblocking.
- Game effects: layered and optional.
- `prefers-reduced-motion` disables flips, parallax, confetti, shaking, and rapid zoom.
- “Serious mode” also suppresses celebratory effects, power-up visuals, and sounds.

### Accessibility

Target WCAG 2.2 AA:

- complete keyboard operation;
- visible focus;
- 44px touch targets where practical;
- semantic headings and landmarks;
- screen-reader announcements for answer feedback, timer changes, reconnect state, and game results;
- captions/transcripts for uploaded instructional media where supplied;
- no flashing content;
- adjustable text scale;
- dyslexia-friendly reading option using a user-selected system-safe font and increased spacing;
- contrast-tested tokens;
- alternatives to drag-only interactions;
- timing accommodations in assignments and games.

---

## 7. Technical architecture

### 7.1 Monorepo

```text
apps/web
apps/worker
packages/config
packages/ui
packages/domain
packages/database
packages/auth
packages/srs
packages/grading
packages/learning-engine
packages/game-engine
packages/realtime
packages/offline
packages/import-export
packages/ai
packages/test-utils
supabase/
docs/
```

### 7.2 Rendering and data flow

- Server Components fetch initial authorized data.
- Client Components own interactive study/game/editor state.
- Server Actions are for form-like mutations and must authorize internally.
- Route Handlers are used for streaming, webhooks, file processing, sync batches, guest tokens, and provider callbacks.
- Atomic scheduling, permissions, scoring, ledgers, and invitation redemption use Postgres RPCs.
- Public deck pages are cacheable and invalidated by version tags.
- Authenticated pages avoid leaking private data into shared caches.

### 7.3 Repository/service boundaries

UI never embeds scheduling or scoring formulas. Domain packages expose interfaces such as:

```ts
export interface Scheduler {
  preview(input: ReviewInput): ReviewPreview;
  apply(input: ApplyReviewInput): ReviewResult;
  rollback(input: RollbackInput): RollbackResult;
  rebuild(input: RebuildInput): CardSchedule;
}

export interface Grader {
  grade(input: GradeInput): GradeResult;
}

export interface GameMode<TConfig, TState, TEvent> {
  code: string;
  version: number;
  configSchema: ZodSchema<TConfig>;
  createInitialState(ctx: GameContext, config: TConfig): TState;
  reduce(state: TState, event: TEvent, ctx: GameContext): TState;
  publicView(state: TState, viewer: ViewerContext): unknown;
  isComplete(state: TState): boolean;
  summarize(state: TState): GameSummary;
}

export interface AIProvider {
  capabilities(): AICapability[];
  generateStructured<T>(request: AIRequest<T>): Promise<AIResult<T>>;
}
```

### 7.4 Provider adapters

Create interfaces for:

- hosting/runtime;
- email;
- object storage;
- realtime;
- rate limiting;
- background jobs;
- AI;
- analytics;
- error reporting.

Supabase remains the initial database/auth/storage/realtime provider. Do not create an unnecessary abstraction over every SQL query; abstract provider-specific infrastructure where migration cost is material.

---

## 8. Database model

Use migrations, generated TypeScript types, comments, indexes, constraints, and RLS tests. The list below is canonical in meaning; Codex may split or rename tables when it documents the mapping.

### 8.1 Identity and learner context

#### `profiles`

One row per authenticated Supabase account.

Key columns:

```text
id uuid pk references auth.users
handle citext unique
display_name text
avatar_asset_id uuid null
locale text
timezone text
study_day_start smallint
age_band enum: under_13, teen, adult, unknown
account_status enum
onboarding_completed_at timestamptz
created_at, updated_at
```

Authorization roles are not stored in user-editable metadata.

#### `learner_profiles`

Represents the person whose SRS and mastery data are being used.

```text
id uuid pk
kind enum: self, child, school_managed
owner_account_id uuid
display_name text
pseudonym text
age_band enum
avatar_seed text
status enum
settings jsonb
created_at, updated_at
```

Every adult/teen account has a `self` learner profile. Child scheduling rows point to a child learner profile, not directly to `auth.users`.

#### `learner_profile_access`

```text
learner_profile_id
account_id
role enum: self, guardian, teacher_observer, school_admin
permissions jsonb
created_at
unique(learner_profile_id, account_id, role)
```

#### `guardian_relationships`

Links guardians to child profiles with status and verification metadata.

#### `consent_records`

Append-only consent and revocation ledger:

```text
id
learner_profile_id
guardian_account_id
consent_type
policy_version
scope jsonb
verification_method
status
recorded_at
revoked_at
evidence_reference
```

Do not store raw identity-verification documents in the beta.

#### `profile_sessions`

Short-lived signed profile-switch sessions, hashed token identifiers, device binding where practical, expiration, revocation.

#### `privacy_requests`, `deletion_jobs`, `data_export_jobs`

Track access/export/deletion workflows and audit status.

### 8.2 Organization

- `folders`
- `folder_items`
- `deck_collections`
- `tags`
- `note_tags`
- `favorites`
- `recent_items`

Folders may contain decks and nested folders without cycles.

### 8.3 Decks, notes, fields, and generated cards

#### `decks`

```text
id uuid pk
owner_account_id uuid
title text
slug text
description_doc jsonb
description_plain text
visibility enum: private, shared, unlisted, public, password
license enum: all_rights_reserved, cc_by, cc_by_sa, cc0
language_front text
language_back text
cover_asset_id uuid null
default_note_type_id uuid
source_deck_id uuid null
fork_mode enum: independent, linked
current_version bigint
content_hash text
card_count int
status enum: active, archived, moderated, deleted
created_at, updated_at, published_at
```

#### `deck_members`

Roles:

```text
owner, manager, editor, suggester, viewer, study_only, host, assignment_manager
```

#### `share_links`

Hashed tokens, permission, expiration, password hash when applicable, usage limits, revocation.

#### `note_types`

Owner or system note type; schema version; display name; template policy.

#### `note_type_fields`

Field key, label, type, position, required, language, grading settings, display settings.

#### `card_templates`

```text
id
note_type_id
name
ordinal
generation_condition
front_template
back_template
styling_css
answer_field_key
card_kind
schema_version
```

Templates use a safe DSL with field references, conditionals, loops over bounded lists, approved components, and scoped CSS. No arbitrary JavaScript, network requests, iframes outside approved embeds, or unsafe HTML.

#### `notes`

```text
id
deck_id
note_type_id
created_by
updated_by
version
sort_text
content_hash
source_reference
metadata jsonb
created_at, updated_at, deleted_at
```

#### `note_field_values`

```text
note_id
field_id
value_doc jsonb
plain_text text
normalized_text text
position
version
```

Rich documents use a versioned Tiptap/ProseMirror-compatible JSON schema.

#### `cards`

Generated study unit:

```text
id
note_id
template_id
ordinal
card_kind
generation_key
content_version
active
created_at, updated_at
unique(note_id, template_id, generation_key)
```

Card IDs remain stable across nonstructural edits. Structural template changes use deterministic reconciliation and preserve schedules where the semantic card still exists.

#### Specialized content

Use explicit tables/JSON schemas as appropriate:

- `card_choices`
- `cloze_definitions`
- `image_occlusions`
- `diagram_hotspots`
- `ordering_items`
- `list_answer_items`
- `audio_prompts`
- `drawing_reference_layers`

### 8.4 Media

#### `media_assets`

```text
id
owner_account_id
sha256
kind
mime_type
byte_size
width, height, duration_ms
storage_bucket, storage_path
status
alt_text
metadata jsonb
created_at, deleted_at
unique(owner_account_id, sha256)
```

- Verify magic bytes.
- Re-encode raster images and strip metadata where possible.
- Compress images before upload.
- Uploaded video is disabled by default; allow safe external video links.
- Apply per-account and global quotas.
- Reference-count assets and delay physical deletion.
- RLS protects private assets; public media uses explicit publication linkage, not an accidentally public private bucket.

### 8.5 SRS presets and card state

#### `srs_presets`

```text
id
owner_account_id null for system
name
algorithm enum: fsrs, sm2_compat
request_retention numeric
maximum_interval_days int
enable_fuzz boolean
enable_short_term boolean
learning_steps jsonb
relearning_steps jsonb
new_cards_per_day int
reviews_per_day int
new_order enum
review_order enum
bury_new_siblings boolean
bury_review_siblings boolean
leech_threshold int
leech_action enum
parameters jsonb
version
created_at, updated_at
```

Default FSRS preset:

- requested retention 0.90;
- maximum interval 36,500 days;
- learning steps `1m`, `10m`;
- relearning step `10m`;
- fuzz on;
- sibling burying on.

#### `deck_srs_settings`

Maps a learner profile and deck to a preset so shared deck content does not share scheduling preferences.

#### `card_schedules`

One row per learner profile and card:

```text
learner_profile_id
card_id
algorithm
state enum: new, learning, review, relearning
due_at timestamptz
last_review_at timestamptz null
stability numeric
difficulty numeric
elapsed_days int
scheduled_days int
learning_step int
reps int
lapses int
legacy_ease_factor int null
interval_days int
suspended_at timestamptz null
buried_until timestamptz null
leech_score int
schedule_version bigint
source_content_version bigint
created_at, updated_at
pk(learner_profile_id, card_id)
```

Store ease only for SM-2 compatibility/import. Do not fabricate “ease” as an FSRS concept.

#### `review_logs`

Append-only canonical review event:

```text
id uuid client-generated
learner_profile_id
card_id
study_session_id
device_id
rating smallint 1..4
reviewed_at timestamptz
received_at timestamptz
duration_ms int
timezone text
study_day_start smallint
source enum: dedicated_review, qualified_learn, import, manual_rebuild
state_before jsonb
state_after jsonb
scheduler_version text
preset_version bigint
idempotency_key text
undone_by_log_id uuid null
created_at
```

A review is undone through a compensating event and scheduler rollback, not deletion.

#### `study_sessions`, `study_session_items`, `study_filters`

Study filters support deck, folder, tag, state, due range, starred, recent misses, leeches, random, order added, due order, interval, retrievability, and limits. Sessions may be preview-only or rescheduling.

### 8.6 Practice and mastery

#### `practice_sessions`

Mode, goal, configuration, start/end, progress summary, learner profile, selected decks/filter.

#### `practice_attempts`

```text
id
session_id
learner_profile_id
card_id
question_type
prompt_variant
answer_payload
grade_result jsonb
correctness numeric 0..1
hints_used int
retries int
response_ms int
confidence smallint null
occurred_at
srs_qualification enum: ineligible, offered, accepted, rejected
```

Avoid storing raw child free-form text longer than needed when a normalized grade record is sufficient. Retention policy is configurable.

#### `concept_mastery`

```text
learner_profile_id
concept_key
deck_id
mastery numeric 0..1
recognition_score
recall_score
last_practiced_at
next_practice_at
attempts
correct_streak
version
```

Mastery is explainable and recalculable from attempts.

### 8.7 Sharing, versions, and discovery

- `deck_versions`
- `note_revisions`
- `deck_snapshots`
- `deck_forks`
- `source_update_offers`
- `suggestions`
- `comments`
- `ratings`
- `deck_follows`
- `creator_profiles`
- `search_documents`
- `content_reports`
- `moderation_cases`
- `moderation_actions`
- `copyright_notices`
- `copyright_counter_notices`

Restoring a version creates a new revision; history remains.

### 8.8 Collaboration

- `collab_documents`
- `collab_snapshots`
- `collab_update_batches`
- `collab_presence_audit` only when necessary

Yjs updates are authorized to the active deck/note, batched, compacted, and expired after a durable snapshot. Presence is ephemeral. Do not persist raw cursor streams.

### 8.9 Classes and assignments

- `classes`
- `class_members`
- `class_invites`
- `assignments`
- `assignment_targets`
- `assignment_accommodations`
- `assignment_attempts`
- `assignment_item_results`
- `curriculum_standards`
- `content_standard_links`

Class membership does not expose personal decks or private SRS history. Assignment reports contain only assignment-scoped evidence and approved aggregate mastery.

### 8.10 Games

#### `game_sessions`

```text
id
join_code unique
host_account_id
deck_id
deck_version
mode_code
mode_version
status
visibility
config jsonb
seed bigint
started_at
ended_at
max_players
allow_guests
allow_late_join
allow_spectators
team_mode
authoritative_sequence bigint
snapshot jsonb
created_at
```

#### `game_participants`

Authenticated or anonymous guest identity, pseudonym, team, role, connection status, score, academic accuracy, streak, reconnect secret hash, joined/left timestamps.

#### Other tables

- `game_teams`
- `game_rounds`
- `game_questions`
- `game_answers`
- `game_events`
- `game_snapshots`
- `game_powerup_ledger`
- `game_reports`
- `guest_sessions`

Game events use idempotency IDs and monotonically increasing authoritative sequence numbers. Retain detailed raw events for a short configurable window, then aggregate and purge.

### 8.11 Persistent progression

- `xp_ledger`
- `level_definitions`
- `study_streaks`
- `achievement_definitions`
- `user_achievements`
- `quest_definitions`
- `quest_progress`
- `currency_ledger`
- `cosmetics`
- `inventory`
- `seasons`
- `leaderboard_entries`

XP and currency are append-only ledgers. Use daily caps and anti-farming rules. No purchasable gameplay advantage.

### 8.12 AI and jobs

- `ai_jobs`
- `ai_usage_ledger`
- `ai_consents`
- `ai_drafts`
- `import_jobs`
- `import_job_items`
- `export_jobs`
- `job_queue`
- `job_attempts`

Provider secrets are never stored in ordinary exposed tables. BYOK values are encrypted server-side or stored only in deployment secrets, not readable by clients after submission.

---

## 9. Authorization and RLS model

Every exposed table has RLS.

### Public

Anonymous users may select only:

- published public deck metadata;
- current published content projection;
- approved creator profile fields;
- media explicitly linked to published content;
- active game join metadata necessary to join.

Anonymous users cannot enumerate private/unlisted IDs, list storage folders, read review history, or mutate content.

### Authenticated content permissions

Access is derived from:

- deck ownership;
- `deck_members`;
- class-scoped assignment permission;
- a valid hashed share link redeemed into a short-lived access grant;
- public visibility.

Create stable SQL helper functions in a private schema:

```text
can_view_deck(account_id, deck_id)
can_study_deck(account_id, learner_profile_id, deck_id)
can_edit_deck(account_id, deck_id)
can_manage_deck(account_id, deck_id)
can_host_deck(account_id, deck_id)
can_access_learner_profile(account_id, learner_profile_id, required_permission)
can_access_game_participant(account_id/guest_claim, participant_id)
```

Index all membership and ownership columns used by policies.

### Service credentials

- Publishable key may be used in browser with RLS.
- Secret/service key is server-only.
- Administrative operations go through audited server routes/RPCs.
- Never trust `raw_user_meta_data` for authorization.

---

## 10. FSRS and review behavior

### Scheduler

- FSRS is default.
- SM-2 compatibility is an optional preset for imported/legacy behavior.
- Wrap `ts-fsrs` and persist the exact scheduler package/model version.
- Validate serialized parameters.
- Support preview, apply, rollback, forget, reschedule, and rebuild from logs.
- Client may display a local preview; the server or sync reconciler owns the canonical state.

### Four ratings

- Again: failed recall.
- Hard: recalled with major effort or partial support.
- Good: correct normal recall.
- Easy: immediate confident recall.

Show next intervals on buttons when enabled.

### Atomic review flow

A canonical online review:

1. client sends card ID, current schedule version, rating, duration, timestamps, device, session, and idempotency ID;
2. RPC verifies learner-profile access and card availability;
3. locks the schedule row;
4. returns the previous response for a duplicate idempotency ID;
5. detects stale schedule version;
6. calculates the transition;
7. inserts an immutable review log;
8. updates the schedule;
9. updates due counts and session progress;
10. returns new state and preview.

### Offline replay

Review events are client-generated and queued. On sync:

- validate a causal base schedule version;
- deduplicate IDs;
- order nonconflicting events deterministically;
- rebuild affected schedules from the last trusted snapshot plus logs;
- surface a conflict when two devices reviewed the same stale card chain;
- never discard a review silently;
- let the learner inspect and accept the replay result.

### SRS versus Learn and games

Dedicated SRS Review always updates scheduling.

A Learn attempt is eligible to **offer** an SRS rating only when:

- the question was free recall or typed recall;
- no hint, answer reveal, retry, or multiple-choice cue was used;
- grading met the configured confidence threshold;
- the attempt is for a due or new card;
- the learner explicitly accepts a suggested Again/Hard/Good/Easy rating or selects one.

Games never update FSRS automatically.

### Advanced controls

Implement:

- deck presets;
- requested retention;
- learning/relearning steps;
- max interval;
- new/review limits and ordering;
- bury card and siblings;
- suspend;
- leech threshold and action;
- manual due date;
- reset/forget;
- undo;
- review ahead;
- preview-only study;
- filtered/custom study;
- time zone and study-day cutoff;
- card and deck statistics;
- forecast and heatmap;
- review timeline;
- optimization adapter from sufficient review history, feature-flagged.

---

## 11. Adaptive learning engine

### Separate mastery model

Mastery is a 0–1 estimate with separate recognition and recall evidence. It decays over time and is updated by transparent weights.

Question evidence strength, from weakest to strongest:

1. flashcard exposure;
2. true/false;
3. multiple choice;
4. select-all;
5. guided recall/hint;
6. typed recall with typo tolerance;
7. strict free recall;
8. correct recall after a meaningful delay.

Immediate repeats receive reduced evidence. Lucky-guess-prone formats receive modest credit.

### Stages

```text
unseen
introduced
recognition
guided_recall
free_recall
mastered
needs_refresh
```

### Selection priority

Use a deterministic score combining:

- low mastery;
- due/overdue status;
- recent miss;
- time since last attempt;
- desired question-type transition;
- deck/session goals;
- tag focus;
- sibling spacing;
- anti-repetition penalty;
- estimated difficulty;
- exam-date urgency.

### Default Learn flow

1. Introduce unfamiliar content with a brief flashcard.
2. Use recognition questions.
3. Move to typed or free recall.
4. Recycle misses after intervening items.
5. Retest without hints.
6. Require at least two successful recalls with spacing for session mastery.
7. End with a summary and next recommended action.
8. Offer eligible SRS ratings separately.

### Session goals

- minutes;
- card count;
- mastery threshold;
- learn all new cards;
- clear due cards;
- exam date;
- weak cards;
- starred cards;
- tags;
- recent misses;
- multi-deck mix.

---

## 12. Grading engine

### Modes

- Strict
- Moderate
- Relaxed
- Custom rules

### Pipeline

1. Parse answer type.
2. Unicode NFKC normalization.
3. Configurable case, whitespace, punctuation, and accent handling.
4. Exact/alias match.
5. List/set/order rules.
6. Numeric and unit equivalence.
7. Math-expression equivalence where supported.
8. Damerau-Levenshtein and token similarity.
9. Required/forbidden keyword rules.
10. Optional local semantic similarity.
11. Optional cloud semantic review.
12. Return score, explanation, matched rule, confidence, and whether human override is allowed.

Never return only a boolean. Store enough explanation to debug grading.

### User override

“I was correct” creates an override event with the original grade, chosen result, and optional reason. It changes practice evidence. It does not automatically rewrite the accepted-answer set or FSRS state.

### Distractors

Preference order:

1. manually authored choices;
2. valid answers from semantically related cards;
3. deterministic transformations;
4. AI-generated drafts reviewed by the creator.

Reject duplicates, the correct answer, near-identical choices, and obvious length/style giveaways.

---

## 13. Card types and editor

All listed types are in target scope:

- basic;
- basic reversed;
- optional reverse;
- true bidirectional;
- custom multi-field templates;
- typed answer;
- cloze, including overlapping/multiple clozes;
- image occlusion;
- multiple choice;
- select all;
- true/false;
- ordering;
- list answer;
- diagram labels/hotspots;
- audio prompt;
- pronunciation/voice recording;
- drawing/handwritten answer.

### Editor capabilities

- rich text and Markdown shortcuts;
- tables;
- KaTeX/LaTeX;
- syntax-highlighted code;
- images;
- crop, rotate, annotate, alt text;
- image occlusion;
- audio upload and in-browser recording;
- safe external video embed;
- browser text-to-speech;
- hints and extra fields;
- citations/source references;
- tags and nested tags;
- custom note fields;
- safe HTML/CSS templates;
- live front/back and generated-card preview;
- keyboard shortcuts;
- undo/redo;
- autosave with visible state;
- bulk add/edit;
- duplicate detection;
- card-quality warnings.

### Material edits and schedules

Default field-level policy:

- cosmetic formatting changes preserve schedule;
- source/citation changes preserve schedule;
- prompt or answer semantic changes mark affected schedules `content_changed`;
- learner chooses preserve, relearn, or reset;
- major automated imports ask once with a bulk policy;
- version history records the decision.

---

## 14. Study modes

### Flashcards

- flip, swipe, keyboard, autoplay;
- shuffle;
- orientation;
- starred-only;
- know/still-learning sorting;
- audio and TTS;
- progress;
- no accidental scheduling unless launched as SRS Review.

### SRS Review

- due/new/relearning queue;
- Again/Hard/Good/Easy;
- interval preview;
- reveal-before-rate;
- keyboard/touch;
- undo;
- bury/suspend/edit;
- timer optional;
- answer comparison for typed cards.

### Learn

Adaptive flow described above.

### Write

- typed recall;
- two-pass default: revisit misses and require two spaced successes;
- strictness control;
- answer override;
- aliases, lists, math, units.

### Test

Configurable:

- question count;
- timed/untimed;
- MC, multi-select, T/F, written, ordering, diagram;
- one or two directions;
- random seed;
- answer key;
- partial credit;
- manual grading queue;
- retake/mistake review;
- no scheduling side effects.

### Match

- term/definition tiles;
- keyboard/touch alternative;
- accessible list-based fallback;
- personal best;
- mistakes feed practice evidence, not FSRS.

### Spell/pronunciation

- audio prompt, typed answer;
- replay speed;
- accent settings;
- optional recording and self-comparison;
- local speech features where available.

### Diagram

- hotspot reveal, label placement, occlusion, typed labels;
- zoom/pan;
- accessible text alternative.

---

## 15. Offline PWA and synchronization

### Offline capabilities

- installable manifest;
- app shell and last-used routes;
- explicitly pinned decks;
- due review;
- flashcards;
- Learn with deterministic grading;
- content creation/editing;
- queued media metadata and later upload;
- review/practice outbox;
- sync status and conflict center.

### IndexedDB

Use versioned Dexie stores for:

- cached deck/content projections;
- learner schedule rows;
- review outbox;
- practice outbox;
- content operation outbox;
- device metadata;
- sync cursors;
- media cache metadata;
- conflict records.

Do not store server secrets. Encrypting IndexedDB with a key in the same browser is not a complete security boundary; use it only as defense in depth and document the limits.

### Conflict strategies

- Review logs: event replay and explicit conflict.
- Content: optimistic `base_version`; auto-merge nonoverlapping fields; otherwise show diff/duplicate.
- Collaborative documents: Yjs merge.
- Deck settings: last-write-wins only for low-risk preferences; show changed timestamp.
- Deletes: tombstones with grace period.
- Media: hash deduplication.

### Service worker

- cache versioned static assets;
- network-first authenticated HTML;
- stale-while-revalidate public deck projections;
- explicit offline download of deck content/media;
- never cache private API responses in a shared/public cache;
- clear profile-specific caches on sign-out/profile switch.

---

## 16. Import, export, and portability

### Required import

- pasted term/definition text;
- CSV;
- TSV;
- JSON;
- Markdown;
- Quizlet-style exported/pasted text;
- Anki `.apkg`;
- Anki `.colpkg` where format is supported;
- media attachments;
- internal full backup archive.

### Required export

- CSV/TSV;
- plain text;
- JSON;
- Markdown;
- printable study guide;
- printable cut-out cards;
- internal full-fidelity ZIP archive;
- Anki-compatible package for supported card types;
- optional review history;
- complete account data export;
- public link;
- embeddable read-only study widget.

### Rules

- Import via adapters with sniffing, parse preview, field mapping, validation, duplicate policy, progress, cancellation, and detailed result report.
- Never scrape a private service.
- Sanitize imported HTML and strip scripts.
- Preserve Anki note/card relationships, media, tags, supported templates, scheduling, and review logs when possible.
- Store original unsupported snippets only in a quarantined, nonrendered diagnostic artifact if the user requests it.
- Report every unsupported transformation.
- Internal archive is versioned, documented, and round-trip tested.

### Anki implementation approach

Prefer portable WASM parsing:

- unzip package;
- parse SQLite via a maintained WASM SQLite library;
- read media map;
- normalize notes/models/cards/revlog;
- map supported template constructs;
- strip arbitrary scripts;
- import in chunks with idempotency;
- rebuild schedules from trusted data/logs when needed.

Export uses the inverse mapping and fixture round trips.

---

## 17. Sharing, collaboration, and discovery

### Visibility

- private;
- specific users;
- class;
- unlisted;
- password-protected;
- public.

### Permissions

- view;
- study;
- copy/fork;
- comment;
- suggest;
- edit;
- manage;
- co-own;
- host games;
- assign.

Each learner always has private schedule/mastery state even when content is shared.

### Forks

At copy time:

- **Independent:** no future updates.
- **Linked:** retains source/version; owner may preview and selectively merge source updates.

Always retain attribution and license lineage when required.

### Realtime collaboration

- Yjs for rich text.
- Supabase private Broadcast channel per active document.
- Presence for collaborators, not high-frequency cursor streams.
- Debounced binary updates.
- Durable snapshots and compaction.
- Offline merge.
- Permission changes immediately revoke future channel authorization.
- Non-rich metadata uses versioned optimistic mutations.

### Discovery

- Postgres full-text search and trigram similarity.
- Filters: subject, language, card count, type, license, creator, recency, rating.
- Ranking combines text relevance, quality, saves, completion, report rate, and freshness without burying new creators.
- Search index stores only public approved content.
- Public preview has clear report and attribution controls.

### Moderation

- local profanity/name filters;
- rate limits;
- report deck/user/comment;
- moderation queue;
- hide pending review when thresholds are reached;
- audit actions;
- appeal workflow;
- copyright notice/counter-notice records;
- repeat-infringer policy support;
- child restrictions described earlier.

---

## 18. Classes, assignments, and reports

### Classes

Any eligible authenticated account can create a class. Roles:

- owner;
- instructor;
- assistant;
- learner.

Join via invite link/code. Child rules apply.

### Assignments

Assign:

- a deck or filtered subset;
- SRS review goal;
- Learn mastery goal;
- Test;
- specific game mode;
- custom question selection.

Settings:

- start/due/close times;
- attempt limit;
- time limit;
- late policy;
- randomization;
- answer visibility;
- leaderboard visibility;
- individual accommodations;
- anonymous mode;
- required mastery/completion.

### Accommodations

- extra time;
- untimed;
- read-aloud;
- reduced motion;
- larger text;
- fewer answer choices;
- no leaderboard;
- keyboard-only alternative;
- alternate question type.

### Reports

Views:

- overview;
- learner;
- question/card;
- concept/tag;
- attempt;
- longitudinal trend.

Metrics:

- completion;
- accuracy;
- partial credit;
- score;
- time;
- retries;
- hints;
- mastery change;
- most missed;
- discrimination-like signal;
- game events relevant to report.

Exports: CSV and print/PDF-friendly layouts. Do not expose unrelated personal study history.

---

## 19. Realtime game architecture

### Principles

- Server authoritative for answers, scoring, power-ups, joins, and results.
- Clients animate and predict only presentation.
- Use database timestamps rather than broadcasting a tick every second.
- Supabase Realtime Broadcast for events; Presence for low-frequency connected state.
- Persist snapshots and critical events in Postgres.
- Default free-beta room cap: 40 players.
- Configurable architecture target: 200 ordinary players after infrastructure upgrade.
- Compact payloads and sequence numbers.
- Reconnect by fetching snapshot and missed state, not trusting a client.

### Guest flow

1. player enters join code;
2. server validates room and policy;
3. Supabase anonymous auth or an equivalent signed ephemeral claim is created;
4. safe generated nickname is assigned or a filtered name is accepted;
5. participant row and reconnect token hash are stored;
6. token expires after the session;
7. cleanup purges ephemeral identity and raw events according to retention.

### Event protocol

At minimum:

```text
room.created
participant.joined
participant.left
participant.reconnected
participant.kicked
team.changed
game.started
round.started
question.assigned
answer.submitted
answer.accepted
answer.rejected
score.updated
streak.updated
powerup.granted
powerup.used
host.command
round.ended
game.paused
game.resumed
game.ended
snapshot.available
```

Every event includes:

- protocol version;
- game ID;
- event ID;
- authoritative sequence;
- server timestamp;
- actor type/ID where safe;
- payload validated by shared schema.

### Host controls

- start/pause/resume/end;
- lock room;
- late join;
- kick/ban;
- mute reactions;
- move teams;
- spectator mode;
- skip/replace broken question;
- extend time;
- enable safe names;
- enable/disable power-ups;
- hide/show leaderboard;
- serious mode;
- accommodations;
- download report.

### Anti-cheat

Use proportionate signals:

- server-issued question instance token;
- one accepted answer per question unless retries are allowed;
- server time windows;
- idempotency;
- impossible latency checks;
- sequence validation;
- focus/fullscreen/visibility signals only when host enabled and clearly disclosed;
- reconnect queue;
- rate limits;
- no camera, microphone surveillance, fingerprinting, or automatic guilt.

### Scoring

Store separately:

- `correctness` / academic accuracy;
- `game_score`;
- `streak`;
- `mode_resources`.

Default score:

```text
base = 1000 * correctness
speed_component = clamp((deadline - answerTime) / allowedTime, 0, 1)
speed_multiplier = 0.75 + 0.25 * speed_component
streak_multiplier = 1 + min(streak, 10) * 0.03
difficulty_multiplier = clamp(questionDifficulty, 0.9, 1.2)
score = floor(base * speed_multiplier * streak_multiplier * difficulty_multiplier)
```

Do not reward an incorrect answer. Mode-specific attacks/currency can add strategy without rewriting accuracy.

### Power-ups

Initial set:

- 50/50;
- erase one;
- retry shield;
- score x2;
- streak shield;
- time freeze;
- gift;
- risk/reward double jeopardy.

Power-ups affect only game state/score.

---

## 20. Game mode catalog

All modes share content and the engine interface.

### Initial realtime/solo modes

1. **Classic Quiz** — individual, self-paced or synchronized.
2. **Speed Round** — rapid questions with capped speed influence.
3. **Match Race** — matching with accuracy penalties and accessible fallback.
4. **Streak Challenge** — maintain correct streaks.
5. **Survival** — limited lives; difficulty rises.
6. **Mastery Peak** — personal progress plus class/team mastery target.
7. **Team Relay** — team members alternate or contribute.
8. **Daily Challenge** — seeded solo challenge with private/friend ranking.
9. **Head-to-Head Duel** — short synchronized match.
10. **Host-Paced Classroom** — everyone receives the same question.

### Advanced modes

11. **Battle** — correct answers earn attacks/shields; no harassment mechanics.
12. **Economy** — correct answers earn currency for strategic upgrades.
13. **Territory** — teams claim zones through correct answers.
14. **Tower Defense** — answer to place/upgrade defenses against deterministic waves.
15. **Board Control** — movement/area control driven by answers.
16. **Solo Campaign** — persistent stages and bosses.
17. **Asynchronous Challenge** — shareable seeded run with deadline.
18. **Assignment Game** — mode wrapped in completion/mastery rules.

Each mode needs:

- rules screen;
- configuration schema;
- deterministic reducer;
- mobile and keyboard controls;
- reduced-motion alternative;
- reconnect behavior;
- end condition;
- report mapping;
- tests.

---

## 21. Persistent gamification

### Meaningful streak

A day counts when the learner performs a meaningful action, such as:

- completes a configured number of reviews;
- achieves a minimum amount of active study;
- completes an assignment;
- completes a challenge with genuine answers.

Opening the app alone does not count.

### XP

Award for:

- due reviews;
- written recall;
- reaching mastery;
- completing assignments;
- participating in games;
- creating high-quality content.

Use diminishing returns and daily caps to prevent farming. Never penalize a learner for using accessibility accommodations.

### Currency and cosmetics

- earned, not purchased in the beta;
- cosmetics only;
- no pay-to-win;
- transparent ledger;
- age-appropriate catalog;
- serious mode can hide all cosmetics.

### Leaderboards

- personal best;
- friends;
- class;
- private room;
- seasonal opt-in for eligible users.

No global leaderboard for under-13 profiles. Accuracy and improvement leaderboards are available so speed is not the only status signal.

---

## 22. AI architecture

Core functionality does not require AI.

### Layer 1: deterministic local intelligence

Always available:

- grading normalization;
- aliases/keywords/lists/math/units;
- distractors from deck;
- duplicate hashes/trigram similarity;
- card-quality heuristics;
- cloze suggestions;
- language detection;
- scheduler/mastery recommendations.

### Layer 2: local browser models

Optional and capability-detected:

- embeddings;
- semantic similarity;
- clustering;
- lightweight summarization;
- supported speech/language tasks.

Download models only with explicit notice; show size; allow deletion; degrade gracefully.

### Layer 3: optional cloud provider

Provider adapters may support:

- card generation from text/files;
- distractors;
- explanations;
- hints;
- translations;
- card rewrites;
- semantic grading;
- quality review.

Requirements:

- no key in browser;
- structured JSON schema output;
- quotas;
- consent/disclosure;
- no private child identifiers or activity history;
- draft review before saving/publishing;
- source references;
- provider terms reviewed before enablement;
- deterministic mock for tests;
- core app remains functional when quota is exhausted.

Do not make Gemini API the default for this mixed-age product. Use an optional provider whose current terms have been reviewed, a local model, or adult BYOK.

### Tutor

Secondary feature flag:

- grounded only in selected deck/source documents;
- cites card/note identifiers;
- says when material is insufficient;
- does not invent grades;
- does not update FSRS or mastery from conversation alone;
- child access remains disabled until provider and safety review.

---

## 23. Free-tier operating profile

Current provider limits change. Read quotas from configuration and document the values used at deployment.

Default beta application quotas:

```text
MAX_CARDS_PER_DECK=10000
MAX_CARDS_PER_ACCOUNT=50000
MAX_MEDIA_BYTES_PER_ACCOUNT=52428800
MAX_IMAGE_UPLOAD_BYTES=5242880
MAX_AUDIO_UPLOAD_BYTES=10485760
ALLOW_VIDEO_UPLOADS=false
MAX_GAME_PLAYERS=40
MAX_PUBLIC_DECKS_PER_ACCOUNT=100
MAX_AI_JOBS_PER_DAY=5
MAX_IMPORT_BYTES=52428800
RAW_GAME_EVENT_RETENTION_DAYS=30
GUEST_RETENTION_HOURS=24
```

Graceful degradation:

- warn owner/admin at quota thresholds;
- stop new media uploads before storage exhaustion;
- keep studying, reviewing, exporting, and deleting available;
- disable nonessential cursor/presence effects before game events;
- aggregate raw telemetry;
- use content-addressed media deduplication;
- use compact Realtime messages;
- avoid uploaded video;
- provide a provider-upgrade/migration runbook.

Scale-ready design target after upgrades:

- 10,000 DAU;
- 100,000 cards per account;
- 200 ordinary players per room;
- partitioned review/game event tables;
- dedicated job workers;
- archival storage;
- replaceable realtime provider for larger rooms.

Do not claim the free tier will support those targets.

---

## 24. Security and privacy requirements

### Application security

- strict environment schema;
- no secret logging;
- CSP and security headers;
- origin/CSRF protections;
- authentication and authorization inside every mutation;
- RLS tests for owner, collaborator, class member, public, anonymous guest, and attacker;
- input validation;
- output encoding;
- rich-content sanitization;
- upload MIME/magic-byte checks;
- SSRF protection for URL imports;
- rate limits;
- idempotency;
- audit logs;
- dependency and secret scanning;
- safe error messages;
- no user-controlled SQL, template JS, or arbitrary iframe.
- safe signed URLs with short expiration.
- profile cache clearing on sign-out.

### Privacy

- data minimization;
- no ads or data sale;
- first-party analytics;
- no child session replay;
- retention schedule;
- export and deletion;
- parent review controls;
- consent ledger;
- pseudonymous game guests;
- no persistent guest tracking;
- notification minimization;
- no dark patterns.

### Moderation and safety

- safe-name generator;
- word filtering;
- rate-limited reactions;
- reports/blocking;
- host moderation;
- child public restrictions;
- moderation audit;
- no unrestricted chat in beta.

---

## 25. Testing strategy

### Unit and property tests

- FSRS wrapper parity and invariants;
- SM-2 compatibility;
- review undo/rebuild;
- grading normalization and edge cases;
- mastery updates and selection;
- template compiler and sanitizer;
- card generation;
- import parsers;
- game reducers/scoring/power-ups;
- ledgers;
- permission helpers.

Use fast-check for invariants such as:

- intervals never exceed configured maximum;
- duplicate review IDs do not double-apply;
- score never changes academic accuracy;
- currency ledger balances;
- game reducer is deterministic for seed/event stream;
- public projection never contains private fields.

### Database tests

- migrations from empty;
- RLS matrix;
- security-definer functions;
- atomic review RPC;
- game answer RPC;
- invitation redemption;
- version restore;
- cleanup/retention jobs;
- indexes and query plans for critical paths.

### E2E

Playwright projects:

- desktop Chromium;
- mobile viewport;
- reduced motion;
- authenticated user;
- parent/child profile when enabled in local test profile;
- collaborator;
- teacher/class;
- anonymous public visitor;
- two-to-eight browser contexts for multiplayer.

Flows:

- sign up/onboard;
- create/edit deck;
- all card types;
- review/undo;
- Learn/Test/Match;
- offline review and sync;
- import/export round trip;
- public share/fork;
- collaboration;
- assignment;
- game host/join/reconnect/result;
- moderation;
- account export/delete request.

### Accessibility

- axe checks;
- keyboard scripts;
- screen-reader-friendly live regions;
- contrast tests;
- reduced-motion visual check;
- drag alternative.

### Performance and load

- Lighthouse budgets on public, dashboard, deck, study.
- Bundle analysis.
- k6 for join, answer submission, report fetch.
- Realtime message accounting.
- large-deck fixture.
- import memory limits.
- no N+1 critical queries.

---

## 26. Performance budgets

Initial targets on a representative mobile connection/device:

- public landing LCP under 2.5s;
- authenticated dashboard LCP under 3.0s after auth;
- CLS under 0.1;
- INP under 200ms for common interactions;
- card flip response under 100ms;
- answer feedback under 150ms locally, under 500ms online target;
- game answer acknowledgment under 500ms at target load;
- initial public route JS minimized through Server Components;
- heavy editors, charts, local models, and game renderers dynamically loaded.

Budgets are targets, not fabricated test results. Record measured results.

---

## 27. Observability and operations

Free-first:

- structured server logs with request/event IDs;
- first-party error table for critical job failures without sensitive payloads;
- admin health/usage dashboard;
- Supabase usage and quota instructions;
- optional Sentry/PostHog adapters disabled by default;
- no raw answer text in third-party logs;
- job retries with backoff and dead-letter state;
- backup/export runbook because free Supabase has limited backup guarantees;
- seed and restore scripts;
- status page not required for beta.

---

## 28. Phase sequence

1. Foundation and design system.
2. Identity, auth, privacy, and profile safety.
3. Content model, editor, media, and all card types.
4. FSRS/SM-2 review engine and statistics.
5. Adaptive Learn and study modes.
6. Offline PWA and synchronization.
7. Import/export and full portability.
8. Sharing, collaboration, discovery, moderation.
9. Classes, assignments, reports.
10. Realtime game platform and initial modes.
11. Advanced games and persistent gamification.
12. AI features.
13. Full integration, security, accessibility, performance, and deployment audit.

This is build order, not a reduction in final scope.

---

## 29. Global definition of done

The application is not complete merely because routes render.

A feature is done when:

- domain behavior is implemented;
- UI handles loading, empty, success, error, offline, and permission states;
- mutations are authorized;
- RLS exists and is tested;
- keyboard/touch/accessibility behavior exists;
- mobile and desktop layouts work;
- errors are actionable;
- analytics are privacy-safe;
- automated tests cover critical paths;
- setup and owner operations are documented;
- no fake data is used outside explicit seeds/stories/tests;
- no in-scope TODO or dead button remains;
- production build passes;
- final integration audit verifies the combined system.

No prompt or generated code can guarantee legal compliance or a defect-free launch. The repository must make verification possible and clearly identify launch gates.

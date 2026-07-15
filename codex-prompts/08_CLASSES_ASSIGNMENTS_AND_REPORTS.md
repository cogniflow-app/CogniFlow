# Phase 8 — Classes, rosters, assignments, accommodations, completion, grading, and reports

Read the content-sharing, learner-profile, practice, SRS, and game interface code. Implement classroom capabilities as an optional layer over the consumer product, not as the application’s organizing center.

## Objective

Allow any eligible user to create a class, invite learners, assign decks/study/test/game activities, provide accommodations, monitor completion, and download clear reports without gaining access to unrelated private study data.

## 1. Database schema

Create additive migrations for:

- `classes`;
- `class_members`;
- `class_invites`;
- `class_join_codes`;
- `class_content`;
- `assignments`;
- `assignment_targets`;
- `assignment_accommodations`;
- `assignment_attempts`;
- `assignment_item_results`;
- `assignment_manual_grades`;
- `assignment_extensions`;
- `curriculum_standards`;
- `content_standard_links`;
- `class_announcements` only if implemented without chat;
- `notification_preferences` and `notifications` for real in-app notifications.

Roles:

- owner;
- instructor;
- assistant;
- learner.

Statuses and timestamps must support draft, scheduled, open, paused, closed, archived.

RLS must ensure:

- class staff see class-scoped reports only;
- learners see own attempts and class information;
- no teacher access to personal decks or unrelated personal SRS history;
- guardian access follows learner-profile rules;
- public/guest users cannot enumerate classes;
- invite codes are hashed/limited/expiring.

## 2. Class creation and roster

Implement:

- create/rename/archive/delete class;
- description, subject, color/icon;
- join code/link;
- invite specific account;
- CSV roster import using pseudonymous identifiers where appropriate;
- approve/remove learner;
- change staff roles;
- transfer ownership;
- safe-name mode;
- class content library;
- member search;
- child and school-managed profile path in local child-enabled profile;
- no requirement that consumer accounts become “teacher accounts.”

For a school-managed child profile, represent the school authorization context but keep the production launch gate and legal-review warning.

## 3. Assignments

An assignment can target:

- deck or selected tags/cards;
- due-review goal;
- Learn mastery goal;
- Write practice;
- generated Test;
- Match/Spell/Diagram;
- a game mode once games exist;
- a custom activity sequence.

Settings:

- title/instructions;
- assigned class/individuals;
- start, due, close;
- time zone;
- attempt limit;
- target card count/mastery/accuracy;
- whole-test/per-question timer;
- randomization;
- answer release;
- late policy;
- required or optional;
- allow resume;
- leaderboard visibility;
- serious mode;
- guest completion policy;
- schedule-impact policy;
- accommodations;
- versioned content snapshot.

Assignments use a content version/snapshot so later deck edits do not silently change an active graded assignment. Staff may intentionally update with a visible version change.

## 4. SRS assignment semantics

Implement clear choices:

- **Practice only:** assignment attempts never change FSRS.
- **Qualified review:** eligible written recalls can offer explicit ratings to the learner.
- **Due review goal:** completion is based on canonical reviews the learner performs; staff sees completion/aggregate accuracy, not private unrelated history.

Never let a teacher directly alter a learner’s personal FSRS rating. A class assignment may provide a recommended schedule preset but cannot silently replace personal settings.

## 5. Accommodations

Per class or assignment/learner:

- extra time percentage;
- untimed;
- read-aloud/TTS;
- larger text;
- reduced motion;
- serious mode;
- fewer answer choices;
- keyboard-only/drag alternative;
- no leaderboard;
- alternate question type;
- allow pauses;
- extended due date;
- hide speed bonus.

Accommodations must not reduce XP or label a learner publicly. Reports expose only to authorized staff and learner/guardian.

## 6. Attempt lifecycle

Implement:

- start;
- resume;
- save;
- submit;
- auto-submit only with clear timer behavior;
- late;
- reopen;
- extension;
- retake;
- manual grade needed;
- graded;
- returned;
- excused.

Use idempotent submissions and content snapshot IDs. Offline attempts queue and reconcile through the existing sync engine.

## 7. Manual grading

For open, drawing, pronunciation, and teacher-reviewed answers:

- queue by assignment;
- rubric/point range;
- comment visible to learner;
- bulk navigation;
- keyboard shortcuts;
- save draft;
- finalize;
- regrade audit;
- no private direct messaging.

AI-assisted draft grading may be added later but can never auto-finalize without configured policy.

## 8. Reports

Implement views:

- assignment overview;
- completion;
- class accuracy;
- score;
- time;
- attempts;
- learner;
- question/card;
- concept/tag;
- standard;
- manual grading queue;
- longitudinal class trend where enough data exists.

Metrics:

- assigned/started/completed;
- on-time/late;
- accuracy and partial credit;
- game score separately;
- average/median response time;
- hints/retries;
- most missed questions;
- mastery change;
- question quality signal;
- accommodations applied;
- version used.

Provide:

- filters;
- sortable accessible tables;
- charts with table/text alternatives;
- CSV export;
- print/PDF-friendly report;
- share report with another authorized instructor;
- guardian/learner summary;
- no exposure of unrelated personal data.

## 9. Standards and tagging

Create optional standards taxonomy:

- custom standards;
- imported simple CSV taxonomy;
- link deck/note/card;
- report by standard;
- no paid standards API required;
- source/version metadata;
- avoid claiming official certification.

## 10. Notifications

Implement in-app notifications for:

- class invite;
- assignment published;
- due soon;
- extension;
- grade returned;
- class role change.

Email adapter is optional and disabled without configuration. Child notifications are conservative and guardian-configurable. Do not implement engagement-spam push notifications.

## 11. UI

Build:

- class dashboard;
- roster;
- join;
- content;
- assignment builder;
- learner assignment list;
- attempt launch;
- accommodation editor;
- grading;
- reports;
- export/print;
- empty/error/offline states.

The consumer dashboard should show assignments but remain centered on personal study.

## 12. Tests

Add:

- class role/RLS matrix;
- invite expiration/reuse;
- child/school profile restrictions;
- assignment content snapshot;
- schedule semantics;
- accommodations;
- timer/resume/offline;
- duplicate submission;
- manual grading audit;
- report privacy;
- CSV/print;
- staff role changes;
- archived class;
- Playwright instructor and learner contexts;
- accessibility.

## Required acceptance criteria

- users can create and join classes;
- assignments can target all implemented study modes;
- active assignments use stable content versions;
- accommodations affect the experience and do not penalize progression;
- teachers see assignment-scoped data only;
- manual grading is auditable;
- reports separate accuracy, mastery, score, and completion;
- CSV and print exports work;
- offline attempt resume works;
- tests, RLS, E2E, and production build pass;
- documentation clearly states the limits of school/child launch readiness.

Do not build the realtime game implementation here; use the existing game assignment interface and enable game targets after Phase 9.

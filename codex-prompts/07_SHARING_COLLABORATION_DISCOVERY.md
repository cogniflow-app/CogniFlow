# Phase 7 — Sharing permissions, linked forks, realtime collaboration, version history, creator profiles, discovery, ratings, moderation, and copyright workflow

Read the existing identity, content, offline, and portability systems. Implement sharing without exposing private schedules or child data.

## Objective

Turn private decks into a safe collaborative/public ecosystem. Content may be shared; every learner’s schedule and mastery remain private. Deliver robust permissions, linked/independent copies, realtime editing, discovery, and moderation.

## 1. Database schema

Create additive migrations for:

- `deck_members` expansion to all canonical roles;
- `share_links`;
- `share_link_redemptions`;
- `deck_versions`;
- `deck_snapshots`;
- `deck_forks`;
- `source_update_offers`;
- `note_revisions` expansion;
- `suggestions`;
- `comments`;
- `comment_reactions` if allowed;
- `deck_follows`;
- `ratings`;
- `creator_profiles`;
- `search_documents`;
- `content_reports`;
- `user_blocks`;
- `moderation_cases`;
- `moderation_actions`;
- `copyright_notices`;
- `copyright_counter_notices`;
- `collab_documents`;
- `collab_snapshots`;
- `collab_update_batches`;
- collaboration access/audit rows only where necessary.

Add constraints, retention policies, indexes, RLS, and private authorization helpers.

## 2. Permission model

Implement roles:

- owner;
- manager;
- editor;
- suggester;
- viewer;
- study-only;
- host;
- assignment manager.

Implement actions:

- view;
- study;
- fork;
- comment;
- suggest;
- edit;
- manage members;
- publish;
- host;
- assign;
- restore;
- transfer ownership;
- delete.

Use centralized capability evaluation in both database and TypeScript. UI may consume the result but is not authoritative.

Test matrices for:

- public;
- unlisted;
- password link;
- invited viewer;
- editor;
- suggester;
- manager;
- owner;
- class-scoped user;
- blocked user;
- suspended content;
- child profile;
- expired/revoked link.

## 3. Visibility and share links

Implement:

- private;
- specific people;
- class;
- unlisted;
- password-protected;
- public.

Share links:

- high-entropy token;
- hash at rest;
- optional password with strong hash;
- permission;
- expiry;
- redemption limit;
- revoke;
- audit;
- safe preview;
- no token in analytics/referrer leakage where avoidable.

Unlisted pages use noindex. Public pages expose only the safe published projection. Password protection is enforced server-side, not by hiding content in the client.

## 4. Independent and linked forks

On copy:

### Independent

- new owner;
- new IDs;
- source attribution/license recorded;
- no automatic future source relationship unless license requires attribution.

### Linked

- records source deck/version;
- user edits remain in their fork;
- source updates create a previewable update offer;
- show additions/changes/deletions;
- allow selective merge;
- detect conflicts;
- never overwrite local content automatically;
- preserve attribution and lineage.

Implement source removal/takedown behavior without deleting a lawful independent user copy blindly; follow license/moderation policy and document edge cases.

## 5. Version history and restore

- create meaningful versions on explicit save/publish/bulk/import/source merge;
- do not create a permanent version for every keystroke;
- show author, time, summary, content counts;
- note-level diffs;
- deck-level summary;
- restore creates a new revision;
- content schedules are not shared or rolled back;
- if restored content semantically changes a learner’s cards, use the existing schedule-impact flow;
- immutable audit for permission/publish/restore.

## 6. Realtime collaborative editing

Use Yjs over authorized private Supabase Realtime Broadcast.

Implement:

- document ID per note/rich entity;
- binary update schema;
- private channel authorization tied to edit permission;
- Yjs awareness/presence;
- collaborator names/avatar seeds;
- debounced updates;
- offline merge;
- reconnect;
- durable snapshots;
- update compaction;
- expiry of raw updates;
- permission revocation;
- “user is editing” indicators;
- recovery from corrupt update/snapshot;
- version checkpoint on meaningful save.

Presence is for slow-changing state. Do not broadcast mouse position every frame. If cursors are shown, throttle heavily and disable first when quota is tight.

Non-rich metadata uses optimistic versioned mutations, not a CRDT everywhere.

## 7. Suggestions and comments

Suggestions:

- propose note/field changes;
- diff;
- accept/reject;
- author attribution;
- batch review;
- accepted suggestion becomes a normal revision;
- child restrictions.

Comments:

- deck/note anchored;
- edit/delete own;
- resolve;
- mention only eligible users if implemented;
- rate limits;
- report/block;
- no direct messages;
- under-13 profiles cannot post public comments;
- free-text classroom comments follow class policy and are disabled by default for child profiles.

Do not build unrestricted chat.

## 8. Creator profiles

Eligible users can create a public creator profile with:

- handle;
- display name;
- avatar;
- short biography;
- subjects/languages;
- published decks;
- followers/following counts where appropriate;
- licenses;
- verification placeholder only if a real admin process exists.

For minors:

- pseudonymous by default;
- no school/location/external links;
- under-13 profile not public;
- teen public profile rules configurable and conservative.

Creator ownership is account-level; learner schedules remain private.

## 9. Search and discovery

Implement Postgres FTS/trigram-based discovery:

- indexed public title/description/tags/terms only;
- subject;
- language;
- card type;
- card count;
- license;
- creator;
- rating;
- recency;
- verified/curated when real;
- pagination/cursor;
- typo tolerance;
- empty/no-result states.

Ranking combines:

- query relevance;
- quality/completeness;
- saves/follows;
- rating with Bayesian smoothing;
- study completion aggregate only when privacy-safe;
- recency;
- report/moderation penalty;
- diversity/new-creator opportunity.

Do not index private/unlisted/password content in public search.

## 10. Ratings, favorites, and quality

Implement:

- favorite/save;
- one rating per eligible account;
- update/delete rating;
- rating text optional only with moderation;
- anti-abuse limits;
- Bayesian aggregate;
- content quality indicators;
- creator cannot rate own deck;
- public view count with privacy-preserving aggregation and bot filtering where practical.

## 11. Moderation and safety

Build a real moderation workflow:

- report deck, note, comment, creator, nickname;
- categories;
- optional evidence;
- rate limits;
- duplicate aggregation;
- case queue;
- assign moderator;
- hide/restrict/remove/restore;
- warn/suspend account capability;
- audit reason;
- appeal state;
- user block;
- safe-name filter;
- prohibited personal information warnings;
- child publication approval queue.

Do not depend on paid AI moderation. Use local filtering and human/admin queue. Optional provider hooks can come later.

Create an admin interface protected by an application capability stored in trusted app metadata/database, never a client-editable flag.

## 12. Copyright and licensing

Implement:

- license choice on publish;
- attribution display;
- fork permission derived from license/owner setting;
- source lineage;
- notice form;
- complainant/contact data stored privately;
- counter-notice workflow;
- case status;
- takedown/hide action;
- repeat-infringer counter;
- audit;
- owner-facing policy templates marked for legal review.

Do not claim the generated template is legal advice.

## 13. Public embed

Implement read-only embeddable deck preview:

- iframe/embed route;
- allowed origin configuration;
- safe CSP/frame ancestors;
- light/dark;
- card flip;
- no private data;
- attribution;
- report link;
- sign-in/open-full-app CTA;
- no persistent cross-site tracking;
- no arbitrary parent messaging.

## 14. UI

Build:

- share dialog;
- member management;
- link management;
- publish settings;
- license choice;
- fork choice;
- source update review;
- version timeline/diff;
- collaborative presence;
- suggestion review;
- discovery;
- creator profile;
- favorites;
- ratings;
- report/block;
- moderation admin;
- copyright workflow.

All states need mobile and accessibility support.

## 15. Tests

Add:

- exhaustive permission/RLS matrix;
- token/password link security;
- revoked link;
- source fork/merge conflicts;
- version restore;
- Yjs two-user/offline/reconnect;
- permission revocation during collaboration;
- public search privacy;
- ranking determinism;
- rating abuse constraints;
- child restrictions;
- moderation actions/audit;
- copyright privacy;
- embed CSP/data exposure;
- Playwright multi-context collaboration;
- accessibility.

## Required acceptance criteria

- content can be privately shared, unlisted, password protected, or public;
- roles work at server/database boundaries;
- schedules/mastery never leak with content;
- independent and linked forks work with source updates;
- realtime editing merges and persists safely;
- version restore creates a new revision;
- public search excludes nonpublic content;
- child social/public restrictions are enforced;
- moderation and copyright workflows store real cases;
- embed is safe;
- tests and production build pass;
- documentation explains permissions, licenses, moderation, and provider quotas.

Do not implement classes/assignments here beyond permission hooks.

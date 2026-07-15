# Phase 2 — Decks, notes, generated cards, rich editor, media, and every required card type

Read all project instructions and existing migrations. Implement the complete content-authoring foundation without starting the scheduler or adaptive mastery engine.

## Objective

Deliver a polished deck library and editor with an Anki-grade distinction between notes and generated cards, safe customizable templates, media, version-aware editing, and all target card types. Public read-only deck preview must become real in this phase.

## 1. Database schema

Create additive migrations for:

- folders and nested folder items;
- decks;
- deck members/owner relation sufficient for this phase;
- tags and note tags;
- note types;
- note type fields;
- card templates;
- notes;
- note field values;
- generated cards;
- card choices;
- cloze definitions;
- image occlusions;
- diagram hotspots;
- ordering items;
- list-answer items;
- audio prompt metadata;
- drawing reference layers;
- media assets and references;
- note revisions;
- deck versions/content snapshots sufficient for safe editing;
- stars/favorites for a learner’s own content state if useful now;
- content-change impact records.

Follow the canonical meanings in the blueprint.

Constraints:

- stable card IDs when semantic generation identity remains;
- deterministic generation key;
- uniqueness constraints that prevent duplicate generated siblings;
- soft deletion/tombstones where offline sync will need them;
- extracted plain text for search;
- content hashes;
- version columns for optimistic concurrency;
- no arbitrary HTML persisted as trusted output;
- RLS for owner/editor/viewer/public projections;
- indexes for library lists, note lookup, tags, versions, and public slug.

Create a safe, versioned public projection/view that includes only published deck fields and current published card content. It must obey RLS/security-invoker requirements.

## 2. Domain types and repositories

Implement framework-independent domain models and typed repositories/services for:

- deck lifecycle;
- note type and field schema;
- note validation;
- template compilation;
- card generation/reconciliation;
- media linking;
- revision creation;
- content-change classification;
- public projection.

Every mutation validates authorization and optimistic version. Conflict responses must be typed and actionable.

## 3. Safe template system

Implement an Anki-inspired but safe template DSL supporting:

- field interpolation;
- front/back references;
- conditional display for nonempty fields;
- bounded iteration over list fields;
- approved helpers such as cloze text, type-answer field, hint, media, and language;
- front-side inclusion on the back;
- sanitized, scoped CSS;
- live preview with representative note data.

Forbidden:

- arbitrary JavaScript;
- arbitrary network requests;
- untrusted iframe;
- unsafe event handlers;
- global CSS escape;
- server template execution from user strings.

Use an AST/parser or a tightly constrained maintained templating engine. Do not render untrusted strings with `dangerouslySetInnerHTML` unless sanitized through a centralized audited path and covered by XSS tests.

## 4. System note types and card types

Ship real system note types and authoring experiences for all of these:

1. Basic front → back.
2. Basic plus reversed.
3. Optional reversed controlled by a field.
4. True bidirectional card.
5. Custom multi-field template.
6. Typed-answer card.
7. Cloze deletion with multiple and overlapping cloze groups where semantically valid.
8. Image occlusion.
9. Multiple choice.
10. Select all that apply.
11. True/false.
12. Ordering/sequencing.
13. List-answer.
14. Diagram label/hotspot.
15. Audio-prompt.
16. Pronunciation/voice-recording.
17. Drawing/handwritten-answer.

For each type:

- define schema;
- define generated-card behavior;
- define editor;
- define preview;
- define renderer contract for study phases;
- define accessible fallback;
- create fixtures and tests;
- ensure bulk import can target it later.

### Reversed and sibling behavior

A note can generate multiple cards. Each card has its own stable ID and later schedule. Sibling relationships are derivable from `note_id`. Card generation must deactivate obsolete generated cards rather than silently reassigning their IDs to different semantics.

## 5. Rich editor

Use Tiptap/ProseMirror-compatible versioned JSON. Implement:

- paragraphs/headings;
- bold/italic/underline/strike;
- lists and task-like lists only where semantically appropriate;
- blockquote;
- links with safe protocol validation;
- tables;
- code blocks with syntax highlighting;
- inline code;
- KaTeX/LaTeX blocks and inline math;
- horizontal rule;
- callout/hint;
- citations/source block;
- images with alt text;
- image crop/rotate/basic annotation;
- audio attachment;
- in-browser audio recording;
- safe external video embed from an allowlist;
- Markdown shortcuts and paste handling;
- plain-text paste;
- undo/redo;
- keyboard shortcuts;
- word/character count where useful;
- content-language metadata;
- accessible toolbar and command palette;
- mobile-friendly controls.

Persist editor JSON and derived plain text. Sanitize on ingest and render. Create schema-version migration functions for stored editor documents.

## 6. Image occlusion and diagram tools

Build a usable visual authoring tool:

- upload/select image;
- zoom and pan;
- create rectangle/ellipse/polygon masks;
- select/move/resize/delete;
- group masks into cards;
- choose “hide one, reveal others” or “hide all, reveal one” behavior;
- label and alt-text each region;
- keyboard-accessible mask list;
- accessible textual fallback;
- deterministic card generation;
- responsive study renderer contract.

Do not depend only on canvas pixels; persist vector geometry in normalized coordinates.

Diagram hotspots support labels, accepted aliases, optional prompt direction, and nonvisual text fallback.

## 7. Audio, pronunciation, and drawing

Audio:

- upload with MIME/magic-byte validation;
- record through MediaRecorder when supported;
- trim metadata if practical;
- playback speed;
- transcript field;
- local/browser TTS interface for text fields;
- no auto-upload before explicit save.

Pronunciation cards:

- reference audio or TTS;
- optional learner recording stored only with explicit action;
- self-review interface contract;
- no cloud speech upload in this phase.

Drawing cards:

- pointer/touch drawing canvas with undo/redo/clear;
- optional reference overlay;
- export a compact stroke/vector payload or local image only when user saves;
- keyboard/nonvisual alternative such as typed answer;
- do not make drawing correctness automatic yet.

## 8. Media pipeline

Implement:

- client preprocessing and compression for images;
- magic-byte verification server-side;
- hash before upload;
- content-addressed deduplication per owner;
- quota checks;
- private and published access rules;
- signed URL strategy;
- reference counting;
- delayed deletion;
- alt-text requirement/warning;
- upload progress/cancel/retry;
- no uploaded video by default;
- external video URL allowlist and privacy-enhanced embed option.

Create storage buckets and RLS policies via migration/setup scripts, not dashboard-only undocumented steps.

## 9. Deck library and editor UX

Build:

- library dashboard with folder tree/list/grid views;
- create, rename, duplicate, archive, delete/restore deck;
- nested folders with cycle prevention;
- tags;
- deck cover/theme;
- bulk card add;
- spreadsheet-like quick editor;
- rich single-note editor;
- drag/reorder where meaningful, with keyboard alternative;
- search/filter within deck;
- duplicate note warning;
- autosave with clear states;
- version conflict dialog;
- card-generation preview;
- sibling list;
- note/card browser;
- bulk tag, move, suspend-placeholder metadata only if schedule does not yet exist;
- version history with read-only diff and restore for content;
- content-change classification.

Do not reset future scheduling automatically. Store enough impact metadata for the SRS phase to ask preserve/relearn/reset.

## 10. Public deck preview

Implement:

- public/unlisted/private visibility states needed now;
- publish/unpublish;
- unique public slug or ID;
- public deck page;
- card flip/swipe preview without persistent progress;
- creator attribution;
- license display;
- card count and supported type summary;
- safe media rendering;
- sign-in CTA preserving return URL;
- no private fields/revisions/member list;
- robots/noindex for unlisted;
- embed-safe read-only projection contract.

Password sharing and advanced permissions are implemented in the sharing phase; do not fake them now.

## 11. Tests

Add:

- template parser/render XSS corpus;
- deterministic card generation;
- reverse/optional reverse/bidirectional siblings;
- multiple cloze generation;
- image geometry serialization;
- all card-type schema validation;
- rich-document schema migration;
- media authorization;
- optimistic editing conflicts;
- version restore;
- public projection privacy;
- folder cycle prevention;
- large deck list/query fixture;
- Playwright authoring flows on desktop and mobile;
- accessibility tests for editor toolbar, dialogs, occlusion list, and public card preview.

## Required acceptance criteria

- every target card type can be authored, saved, reopened, previewed, and rendered through a typed study-view contract;
- no arbitrary script can run through imported/editor/template content;
- media policies protect private files;
- public deck preview contains only published data;
- versions and restore work;
- card generation is stable and tested;
- editor has functional keyboard and mobile behavior;
- migrations and RLS tests pass;
- production build and full verification pass;
- implementation status documents any deferred study-only behavior but contains no deferred card authoring type.

Do not implement FSRS scheduling in this phase.

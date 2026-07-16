# Content authoring contract

**Owning phase:** Phase 02  
**Status:** Implemented in the Phase 02 branch; local and hosted acceptance evidence is recorded only in [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)  
**Last updated:** 2026-07-16

This document is the implementation map for decks, notes, generated cards, safe templates, rich documents, media, version-aware editing, and the read-only publication projection. Product meaning remains canonical in [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md). Database object details are in [DATA_MODEL.md](./DATA_MODEL.md), and the security posture is in [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md).

Phase 02 deliberately contains no learner schedule, review log, FSRS transition, mastery update, game score, XP, or currency state. A generated card is a durable content identity. Phase 03 owns the learner-specific schedule that will later point to it.

## Notes and generated cards

A note is the creator-authored source. Its note type defines fields and templates, while its validated `card_payload` carries the typed specialized data needed by the selected card type. A note may generate one or more sibling cards:

```text
note
  ├─ versioned fields and specialized authoring payload
  ├─ immutable revisions
  └─ generated cards
       ├─ stable card ID
       ├─ deterministic generation key
       └─ typed study-renderer contract
```

Generation is deterministic and framework-independent. The canonical key is derived from the card kind plus a semantic key, not display order or mutable text. Reconciliation therefore:

- preserves a stored card ID when its semantic generation key still exists;
- reactivates the same card when the same semantic sibling returns;
- creates a new card only for a genuinely new semantic key;
- deactivates an obsolete sibling instead of repurposing its ID; and
- rejects duplicate or mismatched stored identities instead of guessing.

The database additionally enforces uniqueness on `(note_id, template_id, generation_key)`. Sibling relationships remain derivable from `note_id`; no Phase 02 behavior shares future scheduling state among siblings.

## System card types

The database seeds one deterministic system note type for each authoring contract. `packages/domain` owns the runtime schema, deterministic generation behavior, and study-renderer contract. The web editor maps every type to its explicit fields and accessible fallback.

|   # | Code                                                    | Authored shape and generation behavior                                                                                             | Accessible/nonvisual contract                                                           |
| --: | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
|   1 | `basic`                                                 | Rich front and back; one `forward` card                                                                                            | Text rendering of both sides                                                            |
|   2 | `basic_reversed`                                        | Rich front/back; `forward` and `reverse` siblings                                                                                  | Both directions have explicit prompt and answer                                         |
|   3 | `optional_reversed`                                     | Rich front/back plus `reverseEnabled`; reverse sibling is added or deactivated deterministically                                   | Checkbox is labelled; both directions remain textual                                    |
|   4 | `bidirectional`                                         | Equal `sideA` and `sideB`; `a_to_b` and `b_to_a` siblings                                                                          | Direction is announced in the renderer contract                                         |
|   5 | `custom` (`custom_multi_field` in the seeded note type) | Named rich fields and one or more safe templates with semantic keys and optional nonempty/empty conditions                         | Compiled prompt/answer has extracted plain text and missing-field diagnostics           |
|   6 | `typed_answer`                                          | Rich prompt/answer, accepted aliases, case policy, and optional language                                                           | Renderer exposes a labelled text-answer affordance; Phase 04 owns grading               |
|   7 | `cloze`                                                 | Rich text plus independently keyed ranges and hints; multiple and overlapping semantic groups are valid when ranges are valid      | Each generated group has its own textual prompt/answer and hint                         |
|   8 | `image_occlusion`                                       | Private image asset, required image description, normalized rectangle/ellipse/polygon regions, group keys, labels, and reveal mode | Keyboard region list, labels, numeric geometry, and text fallback                       |
|   9 | `multiple_choice`                                       | Rich prompt and ordered choices with exactly one correct choice                                                                    | Semantic controls and textual feedback; no lucky answer mutates SRS                     |
|  10 | `select_all`                                            | Rich prompt and ordered choices with one or more correct choices                                                                   | Checkbox-style study contract with explicit choice labels                               |
|  11 | `true_false`                                            | Rich statement, boolean answer, optional rich explanation                                                                          | Named true/false controls and textual explanation                                       |
|  12 | `ordering`                                              | Rich prompt and stable ordered semantic items                                                                                      | Keyboard order controls and numbered text alternative                                   |
|  13 | `list_answer`                                           | Prompt, required/optional items, aliases, position, and order policy                                                               | Accepted answers are available as a textual list; Phase 04 owns grading                 |
|  14 | `diagram`                                               | Image plus normalized hotspots, labels, aliases, and prompt direction; bidirectional hotspots generate two cards                   | Hotspot list and image description do not depend on pixels alone                        |
|  15 | `audio_prompt`                                          | Verified audio asset, transcript, rich answer, and bounded playback speed                                                          | Transcript and playback controls are mandatory alternatives                             |
|  16 | `pronunciation`                                         | Text/language, optional reference audio, local TTS permission, optional typed fallback, and self-review                            | Recording is optional and explicit; typed fallback and self-review remain available     |
|  17 | `drawing`                                               | Rich prompt, optional image/vector reference layers, normalized strokes, opacity/order, typed fallback, and self-review            | Typed answer is the nonvisual alternative; automatic drawing correctness is not claimed |

The new-deck selector, single-note editor, serializer, database payload, reopen path, generated
sibling preview, and `StudyRendererContract` all use these same codes. Type-specific controls—not a
generic JSON textarea—produce validated authoring data. Reopening reconstructs those controls from
the stored payload and fields; saving edits repeats domain validation before the atomic database
boundary. Representative fixtures cover all definitions, while desktop/mobile browser coverage
walks the common authoring/publication path. The renderer contract is presentation-only: it does
not grade, schedule, or persist progress.

`bulkImportKey` is part of each domain definition so Phase 06 import adapters can target the same stable contracts without inventing a second card taxonomy.

## Rich-document schema

Rich content is versioned ProseMirror-compatible JSON, never trusted stored HTML. The current domain schema is version 2. It supports:

- paragraphs, headings, hard breaks, block quotes, bullet/ordered/task lists, and horizontal rules;
- bold, italic, underline, strike, inline code, and safe links;
- tables, code blocks with a bounded language identifier, inline math, and math blocks;
- note/caution-style callouts, hints, and citation/source blocks;
- images with an opaque asset ID, alt text, normalized crop, quarter-turn rotation, and optional annotation asset;
- audio with an opaque asset ID and transcript; and
- privacy-enhanced allowlisted external video descriptors for `youtube_nocookie` and Vimeo.

Sanitization validates every node and mark, rejects unknown dangerous shapes, enforces depth/node/text limits, permits only `http`, `https`, `mailto`, and `tel` link protocols, normalizes content, and derives searchable plain text on the trusted boundary. Version migration converts historical supported documents before validation. Renderers encode text and emit typed placeholders for media rather than trusting user HTML.

The authoring surface supplies a labelled semantic toolbar, keyboard and Markdown-style shortcuts,
undo/redo, separately handled sanitized rich paste and plain-text paste, content-language metadata,
live character/word counts, responsive/mobile controls, and a keyboard-openable block palette for
task lists, tables, code, math, callouts, hints, citations, and rules. Image occlusion/diagram geometry and
drawing data are stored separately as normalized structured data so accessibility and future study
rendering never depend only on canvas pixels.

Code blocks persist only their bounded language hint and source text. The editor derives escaped
syntax-highlight spans locally for preview and regenerates them after edits; highlighted HTML is
never accepted as trusted storage. Task-list controls persist semantic `taskList`/`taskItem` nodes
and checked state rather than decorating an ordinary bullet with visual-only checkbox characters.

## Safe template DSL

The template compiler is an AST parser, not a JavaScript or server-evaluation engine. Version 1 supports:

- escaped field interpolation: `{{Field}}` or `{{field:Field}}`;
- front-side inclusion: `{{front}}` or `{{FrontSide}}`;
- nonempty conditionals: `{{#if Field}}…{{/if}}`;
- bounded list iteration: `{{#each Items}}{{item}}{{/each}}`, capped at 100 items at render time; and
- approved helpers: `cloze`, `type_answer`/`type`, `hint`, `media`, and `language`.

The parser limits source length, node count, nesting depth, field names, and rendered output. Triple-brace/raw interpolation, unknown blocks, prototype-like field names, and `item` outside a bounded loop fail validation.

Static markup passes through a small tag/attribute allowlist: template markup may retain only
bounded `class`, `lang`, `dir`, and `aria-label` attributes, and does not accept static anchors.
Text, rich-document content, attributes, and helper output are encoded centrally. Rich-document
link marks receive safe protocols and `nofollow noreferrer noopener`. Media helpers emit opaque
asset markers, never arbitrary URLs.

Optional template CSS is separately parsed and scoped below a generated `[data-lumen-card-scope="…"]` selector. Only approved properties, selectors, and values survive. At-rules, imports, URLs, global/root selectors, IDs, event/style selectors, custom properties outside the `--lumen-*` namespace, behavior/expression bindings, and malformed nested rules are rejected. User templates cannot execute JavaScript, make network requests, create an iframe, install an event handler, or escape into global CSS.

## Editing, conflicts, revisions, and impact

Every write uses a client-generated UUID idempotency key. Mutable resources carry positive
versions. New-note upsert uses the explicit expected-version sentinel `0`; updates and lifecycle
transitions send the current positive version, and bulk commands send an equally sized vector with
no null element. Null is never a wildcard. The database locks the current resource and returns a
typed conflict when expected and actual versions differ. A new browser note without an assigned ID
uses its required idempotency UUID as the stable note ID before the upsert implementation runs, so
an exact create retry addresses the same note. Conflicts retain their structured
`version_conflict` detail under SQLSTATE `P0001`, not serialization-failure `40001`; clients fail
the stale command promptly, then the conflict surface offers an actual server reload before an
intentional retry instead of preserving stale local state or silently overwriting another session.

Receipt lookup takes a transaction-scoped advisory lock for the account/key pair before checking
the stored result. Exact concurrent retries therefore converge on one accepted effect. A replay
also rechecks current resource authorization; a former editor cannot replay an accepted mutation
after membership revocation. Reusing a key for another operation is rejected.

The browser note-write surface is `current_upsert_note_with_media()`. Field values, specialized
rows, citations/sources, tags, explicit media links, generated siblings, note revision, deck
version, and content impact commit or roll back together. Browser roles cannot execute the
standalone note-upsert/link/release components. Deleting a note or restoring a deck version also
retires/reconciles its explicit and specialized media usages in the same transaction.

Accepted note changes create an immutable `note_revisions` snapshot and reconcile generated cards in the same transaction. Deck-affecting changes increment the content version and append a `deck_versions` snapshot. Restoring an old deck version creates a new head version with `restored_from_version`; it does not delete or rewrite history.

Content-change classification is scheduling-neutral:

- formatting and presentation metadata default to preserving future schedules;
- prompt, answer, or both semantic meanings require a later learner choice;
- a generation-structure change records every affected generation key; and
- the future choices are `preserve`, `relearn`, and `reset`.

Phase 02 stores this impact in `content_change_impacts`. It never applies a schedule decision because no Phase 03 schedule exists yet.

## Media pipeline

The single `lumen-content-media` bucket is private. Its migration fixes a 10 MiB object ceiling and allowlists supported raster-image and audio MIME types. Uploaded video is not supported.

The browser preprocesses large raster images, computes SHA-256 before upload, requires image alt text or an audio transcript, displays progress, and supports cancellation/retry. A recording stays in browser memory until the creator explicitly uploads it.

The server does not trust the filename or browser MIME value. It enforces a bounded multipart request, checks supported magic bytes, requires the declared MIME to match the detected type, recomputes SHA-256, verifies image dimensions, and then uses the actor-derived registration/finalization transactions. Current limits are:

| Limit                      |                Value |
| -------------------------- | -------------------: |
| Image asset                |                5 MiB |
| Audio asset                |               10 MiB |
| Account media total        |               50 MiB |
| Image dimensions           | 1–32,768 px per axis |
| Signed private preview URL |           15 minutes |

Deduplication is content-addressed per owner by `(owner_account_id, sha256)`. The object path is
derived from the asset's separate opaque public UUID and digest, never the owner account UUID. An
existing digest is reusable only when kind, byte size, and safe status match. A ready asset must
have a matching server-detected hash/MIME and successful magic-byte verification.

Browser Storage insert/update/delete is authorized only while that exact registered asset remains
`pending`. The predicate holds a row-share lock for the duration of the write, while finalization
takes the corresponding update lock. Verification therefore cannot race a replacement that was
already authorized. After finalization, a `ready` object's bytes cannot be updated or deleted with
browser credentials; replacing content means registering and verifying a new digest.

References are authorized against an editable deck/note child. The authoritative count includes
ordinary `media_references` plus active deck covers, audio prompts, pronunciation reference audio,
and drawing reference layers. A newly verified but unreferenced asset receives a seven-day deletion
deadline. Adding any usage revives a deleting asset and clears the deadline; retiring the final
usage starts the same delay. Note deletion and version restore retire stale explicit/specialized
uses, and the migration backfill derives counts from every active source. These state changes do
not destroy bytes. The due account-deletion boundary withdraws publications, redacts owned
content/history, and makes owned media immediately eligible for deletion. In every case, an
operated cleanup worker must perform physical Storage deletion and be monitored before byte
removal is represented as automatic.

Storage RLS permits an authenticated current self context to mutate only its exact registered,
pending object path. Reads require owner/authorized-deck access or a frozen public media
publication. A public page never receives a draft asset merely because it shares a bucket.

## Publication and public preview

Publishing is an explicit manager-authorized, expected-version mutation. It requires an active generated card set and refuses unverified referenced media or a published image without alternative text. The transaction replaces a frozen publication projection containing only:

- public deck ID/slug, title, sanitized description, creator attribution, license, language/theme metadata, card count/type summary, content hash, and published version/time;
- active published card content, safe template data, field projection, specialized payload, and approved sources; and
- referenced verified media metadata.

It excludes internal owner/account/card/media IDs, draft notes, members, revisions, mutation
receipts, Storage bucket/path values, and future learner state. Published cards use deterministic
publication-only IDs; unused custom fields are removed; attached internal media IDs are replaced by
opaque media publication IDs. Anonymous list-style table/view reads expose only `public` decks.
Narrow read RPCs accept an opaque public ID or slug and may return the exact `unlisted` deck
requested; unlisted content is never part of public enumeration and its route emits `noindex`
metadata. Public media metadata never contains a Storage locator. A service-only resolver supplies
the exact locator solely so the server can mint a 15-minute signed delivery URL. Unpublishing
deletes the frozen projection and returns the draft deck to `private` visibility.

`/deck/[slug]` and `/embed/deck/[publicId]` render the same read-only projection. Card flip/keyboard preview is nonpersistent and has no SRS or mastery side effect. The sign-in action preserves the safe same-origin public return destination. Password links, discovery ranking, collaboration, comments, ratings, forks, and advanced permissions remain owned by Phase 07.

The embed route is the only framing exception: it emits a route-specific CSP with
`frame-ancestors 'self' https:` and omits `X-Frame-Options`. Every non-embed route keeps
`frame-ancestors 'none'` and `X-Frame-Options: DENY`. The embed route disables microphone; normal
same-origin application routes allow browser-permission-gated microphone access only for explicit
author recording. CSP media/image sources include the private signed/public Supabase delivery
origin, while frame sources are restricted to privacy-enhanced YouTube and Vimeo hosts.

## Accessible authoring and rendering

The rich toolbar, block palette, card-type fields, lifecycle dialogs, library view controls, and
ordering actions have semantic labels and keyboard operation. The editor keeps focusable controls
out of untrusted rich output and represents save/conflict/upload state in text rather than color or
motion alone. Mobile controls wrap instead of creating page-level horizontal overflow.

Image occlusion and diagram authoring persist normalized vector geometry, but canvas/pointer
interaction is never the only path. A keyboard-editable region list exposes shape, coordinates,
label, aliases, group, mode, and delete/move controls. Drawing stores compact normalized strokes
only on explicit save and retains a typed fallback. Audio and pronunciation expose transcript or
typed fallbacks; recording is explicit, stops all acquired tracks, and remains optional. Study
renderers announce prompt/answer direction, provide reveal controls, and do not reveal an occluded
region before the user action. Public preview keyboard/swipe shortcuts ignore nested inputs,
buttons, links, editable content, and drawing controls so the outer card cannot hijack an inner
interaction.

All motion respects operating-system reduced motion and the independent serious-mode projection.
The same safe renderer contract is used by authenticated generated-card preview and the frozen
public preview, so accessibility does not require a second trusted-HTML path.

## Application routes and boundaries

`/app` is the canonical authenticated deck library/dashboard. `/app/library` intentionally redirects to it. Authentication and onboarding flows use `/app` as the safe fallback, preserve a validated public or protected return when supplied, and reject Auth/API/onboarding lifecycle destinations that could create loops.

The protected workspace exposes:

- `/app/decks/new`;
- `/app/decks/[id]` overview;
- `/app/decks/[id]/edit` single-note authoring and generated-card preview;
- `/app/decks/[id]/cards` note/card browser and quick/bulk entry;
- `/app/decks/[id]/history` versions and restore; and
- `/app/decks/[id]/settings` lifecycle, metadata, visibility, publication, and destructive actions.

Archive is the reversible library lifecycle and can be restored by the owner. Delete is a separate
confirmed tombstone action that leaves the active library and is not exposed as restorable by the
current UI; the dialog directs creators to archive when they may need recovery. Content-version
restore is independent: it appends a new head for an active deck and never rewrites history.

Server Components read through typed server repositories. Client Components call bounded same-origin Route Handlers. Every Route Handler validates input, requires the active self learner and current authenticated device context, then calls actor-derived `current_*` RPCs. A hidden UI control is never the authorization boundary.

## Later-phase boundaries

- Phase 03 adds learner-specific scheduling, content-change decisions, sibling burying, and review logs.
- Phase 04 adds grading and adaptive study behavior; Phase 02 renderer contracts do not claim correctness decisions.
- Phase 05 adds offline content outbox/synchronization and richer conflict merging.
- Phase 06 adds import/export adapters that target the stable card contracts.
- Phase 07 adds sharing, collaboration, discovery, moderation, passwords, forks, and advanced permissions.
- Drawing and pronunciation remain self-review in Phase 02; no cloud speech or automatic drawing judgment is performed.
- Uploaded video stays disabled; only validated privacy-enhanced external-video descriptors are represented in rich documents.

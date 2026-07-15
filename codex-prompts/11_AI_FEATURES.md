# Phase 11 — Deterministic intelligence, local models, optional cloud AI, document-to-cards, semantic grading, and grounded tutor

Read the completed content/editor, grading, import/export, privacy, job, quota, collaboration, and child-profile systems. Implement AI as an optional, provider-neutral enhancement. The application’s core deck creation, studying, SRS, games, import/export, and grading must continue to work with every AI feature disabled and with no cloud credentials.

## Objective

Deliver a safe, transparent intelligence layer with four levels:

1. deterministic local algorithms that always work;
2. optional browser-local models when the device supports them;
3. optional server-side cloud providers, disabled until explicitly configured and reviewed;
4. a secondary, feature-flagged tutor grounded only in selected user material.

AI output is untrusted draft material. It must be validated, attributed to source chunks, reviewable, editable, and never silently published, graded as authoritative, or written into FSRS/mastery state.

## 1. Package and provider architecture

Create or complete `packages/ai` with no React or direct database dependency. Define versioned contracts such as:

```ts
type AiCapability =
  | 'generate_cards'
  | 'generate_distractors'
  | 'generate_hints'
  | 'explain_answer'
  | 'rewrite_card'
  | 'translate'
  | 'quality_review'
  | 'semantic_grade'
  | 'summarize_source'
  | 'tutor';

interface AiProvider {
  id: string;
  capabilities: ReadonlySet<AiCapability>;
  health(): Promise<ProviderHealth>;
  estimate(input: AiRequest): Promise<UsageEstimate>;
  execute<T>(request: ValidatedAiRequest<T>): AsyncIterable<AiProviderEvent<T>>;
}
```

Add:

- provider registry and capability negotiation;
- strict per-capability Zod input/output schemas;
- normalized usage/cost units without assuming money is charged;
- timeout, cancellation, retry, and circuit-breaker behavior;
- deterministic mock provider for tests/dev;
- local deterministic provider;
- browser-local model adapter;
- optional Cloudflare Workers AI adapter or equivalent free-tier-capable adapter behind server/worker code;
- optional generic OpenAI-compatible/BYOK adapter for eligible adult users/owners, disabled by default;
- no provider hard-coded into domain logic;
- no provider key in the browser except an explicitly designed adult BYOK flow that stores it only in a secure server-side secret mechanism; prefer not to persist BYOK at all;
- structured logging with content/redaction boundaries;
- provider terms/review metadata and launch gate.

Do not make Gemini API the default for this mixed-age product. Do not automatically enable any provider merely because an environment variable exists; require an explicit provider enable flag and document that current terms/privacy must be reviewed.

## 2. Database schema and jobs

Create additive migrations, adapting existing job infrastructure:

- `ai_provider_configs` containing non-secret metadata/status only;
- `ai_feature_policies`;
- `ai_jobs`;
- `ai_job_inputs` or secure references, avoiding unnecessary duplication of source content;
- `ai_job_events`;
- `ai_job_outputs`;
- `ai_usage_events`;
- `ai_quota_windows` or projections;
- `ai_consents`/disclosures if not covered by the existing consent model;
- `ai_drafts`;
- `ai_draft_items`;
- `ai_source_documents`;
- `ai_source_chunks`;
- `ai_source_citations`;
- `ai_feedback`;
- `local_model_preferences`;
- retention/deletion state.

Requirements:

- tenant/profile/deck ownership on every job/draft/source;
- provider/model/capability/prompt-template/schema version;
- status state machine: draft, queued, running, awaiting_review, completed, failed, cancelled, expired, deleted;
- idempotency key and deduplication;
- bounded attempts/backoff;
- input/output content hashes;
- token/neuron/compute/request usage where supplied;
- no provider secret in Postgres rows exposed through the app;
- output remains a draft until an authorized user accepts it;
- source-to-output citations at chunk/card/note granularity;
- retention and deletion cascade compatible with privacy requests;
- indexes and RLS for owner, authorized collaborator, class staff in assignment-owned contexts, and worker;
- no child data visible to a generic worker beyond the exact approved job payload;
- server/worker claims the job atomically and handles duplicate execution safely.

Use a portable worker boundary. Local development must run jobs without paid infrastructure, either inline in a safe development mode or through `apps/worker`/Supabase-compatible functions. Long jobs must not assume unlimited Vercel request duration.

## 3. AI policy engine

Implement one server-side policy decision before any model call. Inputs include:

- deployment profile;
- authenticated account and active learner profile;
- age band/child status;
- guardian/school/consent context;
- capability;
- provider/model terms-review status;
- source visibility/sensitivity label;
- deck/class permissions;
- daily/account/global quota;
- feature flag;
- owner/admin disable switch;
- geographic/launch constraints where configured.

Outputs include allow/deny, permitted providers, redaction requirements, maximum size, disclosure text/version, review requirement, retention, and reason code.

Default rules:

- deterministic local features are broadly available;
- browser-local models require explicit model-download notice and device support;
- direct cloud prompts and cloud tutor are disabled for under-13 learner profiles;
- child identifiers, age, school, location, activity history, guardian data, and private profile metadata never enter provider prompts;
- an eligible adult/teacher may initiate generation over content they are authorized to process after disclosure;
- AI-generated material may be shared with learners only after human review;
- cloud semantic grading is opt-in and never the sole basis of a consequential class grade;
- private/restricted deck content is never sent without explicit action and policy permission;
- exhausted quota returns a clear local/manual alternative;
- no model call occurs from public preview crawling or in the background without user action.

Create policy matrix tests, not only UI conditions.

## 4. Layer 1 — deterministic local intelligence

Complete and unify always-available functionality:

- Unicode normalization;
- case/punctuation/whitespace options;
- accent-sensitive/insensitive comparison;
- aliases and accepted alternatives;
- required/forbidden keywords;
- ordered/unordered list matching;
- numeric tolerance;
- unit normalization/conversion for an allowlisted unit library;
- safe math-expression equivalence for supported syntax;
- typo distance with length/language-aware thresholds;
- stemming/token overlap where appropriate;
- deck-derived distractors with sibling/duplicate/leakage protection;
- duplicate detection with canonical hashes, trigram similarity, and field weighting;
- card-quality heuristics: non-atomic prompt, ambiguous pronoun, answer leakage, overly long answer, duplicate cloze, missing source, invalid media, low-quality distractors;
- rule-based cloze candidates;
- language detection;
- source coverage metrics;
- scheduler/mastery recommendations from existing engines;
- deterministic hints using progressively revealed answer structure when the card permits it.

Expose confidence and reasons. Users can override a practice grade with an audit event. Deterministic rules remain the default grading path even when cloud AI exists.

## 5. Layer 2 — optional browser-local models

Implement a progressive adapter, using a maintained browser ML runtime only when it meets bundle/security requirements. Capabilities may include:

- text embeddings;
- semantic similarity;
- duplicate clustering;
- concept grouping;
- lightweight summarization;
- supported local translation;
- optional speech/language assistance where browser APIs/models permit it.

Requirements:

- dynamic import; no model in the ordinary app bundle;
- capability detection for WebGPU/WASM/memory/storage;
- explicit model name, source/license, approximate download/storage size, and privacy explanation before download;
- user opt-in and cancel;
- progress, retry, pause where feasible;
- Cache Storage/IndexedDB management;
- delete downloaded models;
- no silent cellular-scale download;
- model integrity/version metadata;
- local processing indicator;
- worker thread/off-main-thread execution;
- timeout/memory failure fallback;
- reduced device mode;
- no claim that local similarity alone proves correctness;
- no local model requirement for tests/CI; use deterministic fixtures/mocks.

Local semantic grading may supplement deterministic grading but must display uncertainty and preserve user override.

## 6. Source ingestion pipeline

Build a reusable, secure source-to-draft pipeline for authorized inputs:

- pasted text;
- Markdown;
- plain text;
- PDF;
- DOCX;
- PPTX;
- images through optional local/server OCR adapter;
- audio through optional transcription adapter;
- supported webpage URL fetch;
- existing deck/notes;
- imported files already owned by the user.

Implement stages:

1. validate permission, type, size, quota, and policy;
2. MIME sniff rather than trust extension;
3. malware/file-bomb defenses appropriate to available tooling;
4. extract locally/server-side with open-source parsers where feasible;
5. sanitize and normalize text;
6. preserve page/slide/section/source-location metadata;
7. detect language and obvious corruption;
8. chunk with overlap and semantic/heading boundaries;
9. compute hashes and deduplicate;
10. show extracted preview and let the user exclude sections;
11. invoke deterministic or configured AI generation;
12. validate structured output;
13. map every generated item to source chunks;
14. place results in a review workspace;
15. accept/edit/reject/merge into a chosen note type/deck transactionally.

### URL fetching security

- allow only `http`/`https`;
- block localhost, link-local, private networks, cloud metadata addresses, and unsafe redirects;
- resolve/check DNS safely and re-check redirect targets;
- enforce response size, content type, timeout, and redirect count;
- do not execute page JavaScript;
- strip scripts/styles/trackers;
- respect authorization/copyright: no authenticated scraping, paywall bypass, or third-party login automation;
- show source URL/title/retrieval timestamp;
- make robots/terms limitations clear where relevant;
- rate limit.

### File safety

- reject encrypted/unsupported files with a helpful message;
- cap archive entries/uncompressed size/depth;
- never execute macros or embedded scripts;
- sanitize hyperlinks and HTML;
- extract images/media only when explicitly chosen and within quota;
- do not log raw private file contents.

## 7. Document-to-flashcard generation

Build an AI generation workspace supporting:

- target deck/new deck;
- subject/language/reading level;
- desired number/range;
- note/card types: basic, reversed, optional reverse, cloze, typed, multiple choice, multi-select, true/false, list, ordering, diagram candidate, audio candidate;
- difficulty distribution;
- focus/exclusion instructions;
- concise/atomic preference;
- source citation requirement;
- duplicate avoidance against target deck;
- tags and suggested concepts;
- custom note-type field mapping;
- no unsupported claims beyond source;
- answer/explanation separation.

Use structured output containing stable temporary IDs, fields, card-type proposal, accepted alternatives, grading rules, distractors, explanation, difficulty, tags, confidence, source chunk IDs, and warnings.

Review UI:

- source beside draft;
- accept/reject/edit/bulk actions;
- duplicate/quality warnings;
- merge with existing note;
- change card type;
- regenerate selected item only;
- compare revisions;
- keyboard workflow;
- accessible diff;
- save as private by default;
- no automatic public publishing;
- transaction summary and undo/version history.

For public or class content, require an authorized human confirmation that the material was reviewed.

## 8. Card assistance features

Implement optional actions in the editor and study result views:

- improve wording;
- make prompt atomic;
- simplify/expand explanation;
- generate accepted aliases;
- generate manual distractors;
- generate hints;
- propose clozes;
- propose reverse direction;
- translate selected fields;
- pronunciation/phonetic suggestion;
- identify ambiguity/answer leakage;
- suggest tags/concepts;
- compare against possible duplicates;
- explain an answer from the source;
- generate practice variants.

Every action:

- shows exactly which fields/content will be processed;
- respects policy/quota;
- produces a diff/draft;
- never overwrites silently;
- allows undo;
- records provider/model/version and source links where applicable;
- marks generated text in revision metadata without visually stigmatizing the learner;
- works through deterministic alternatives when possible.

## 9. Semantic answer grading

Implement a conservative layered pipeline:

1. deterministic exact/alias/list/math/unit checks;
2. local semantic similarity if enabled;
3. optional cloud adjudication only when policy allows and ambiguity remains;
4. user or teacher override/audit.

Cloud request includes only the minimum needed:

- prompt;
- expected answer/aliases/rubric;
- learner answer;
- language;
- grading constraints;
- no learner identity, history, deck owner identity, or unrelated content.

Structured result:

- verdict: correct, partially_correct, incorrect, uncertain;
- score range/value;
- concise rationale;
- matched/missing concepts;
- confidence;
- rubric version;
- safety flag.

Rules:

- uncertain defaults to manual/user decision, not incorrect;
- model output cannot directly write canonical SRS rating;
- in Learn Mode it can advise the existing qualified-practice policy;
- assignment consequential grading requires teacher review unless a documented low-stakes policy explicitly allows otherwise;
- cache only privacy-safe normalized requests under user/deck scope;
- expose “why” and override;
- measure disagreement and false-positive fixtures;
- resist prompt injection inside learner answers/expected content by treating all content as data and enforcing structured schemas.

## 10. Explanations, hints, and source grounding

Implement source-grounded explanations:

- retrieve selected note/card/source chunks only;
- require citations to internal chunk/note/card identifiers;
- render clickable source references;
- distinguish source-supported content from optional general knowledge, with general knowledge disabled by default for private study explanations;
- say when source material is insufficient;
- never fabricate a citation;
- sanitize Markdown/HTML;
- allow report/feedback;
- keep an explanation as a draft unless intentionally saved to a note field.

Hints should be progressive and not reveal the full answer immediately unless the learner requests it. Hint use remains visible in practice history but does not shame or reduce accessible progression unfairly.

## 11. Secondary grounded tutor

Implement behind `ENABLE_AI_TUTOR=false` by default and a separate policy gate.

Tutor behavior:

- user selects a deck, tags, notes, or source documents;
- retrieval is limited to authorized selected content;
- answers cite note/card/source chunk identifiers;
- highlights supporting excerpts within copyright-safe limits;
- says “the selected material does not answer this” when appropriate;
- can ask questions, explain, compare, create an unsaved practice item, or suggest what to review;
- does not diagnose, provide high-stakes professional advice as authoritative, or invent citations;
- does not make final class grades;
- does not update FSRS/mastery from chat alone;
- a tutor-generated answer can be converted only into a reviewed card draft;
- chat history retention is configurable and deletable;
- no unrestricted cloud tutor for under-13 profiles;
- no direct tutor-to-public-post action;
- rate and size limits;
- stop/cancel/clear controls;
- injection-resistant system/developer template separated from retrieved/user content;
- tool calls, if any, are allowlisted and authorized individually.

Provide a local deterministic demo tutor for development/tests that answers from fixtures without pretending to be intelligent.

## 12. Quotas, free-tier behavior, and graceful degradation

Default to a small configurable quota such as `MAX_AI_JOBS_PER_DAY=5`, with per-capability, account, profile, provider, and global limits.

Implement:

- preflight estimate;
- quota receipt/status;
- atomic reserve/commit/release;
- concurrency cap;
- cancellation;
- retry budget;
- owner kill switch;
- provider circuit breaker;
- queue backpressure;
- file/chunk/output limits;
- model selection constrained by provider config;
- no unbounded recursive agent behavior;
- no hidden automatic spend;
- clear message when the free allowance/provider is unavailable;
- deterministic/manual/local fallback links;
- studying/reviewing/exporting remains available;
- usage dashboard for the owner without exposing private content.

Never advertise an external free tier as permanent. Setup documentation must show how to disable the provider and what remains functional.

## 13. Privacy, safety, copyright, and moderation

Implement and document:

- data-flow inventory per provider/capability;
- disclosure/consent version;
- minimal payload preview;
- provider/model/region metadata where known;
- retention/deletion behavior;
- no secret/content in ordinary logs;
- no training-use claim unless provider terms explicitly support it and are reviewed;
- child cloud restrictions;
- source ownership/authorization confirmation;
- generated-content report flow;
- unsafe-output detection adapter and manual fallback;
- public/class publishing review step;
- copyright/source attribution preservation;
- no scraping of private accounts/paywalls;
- no biometric identification/emotion inference;
- no targeted advertising/profile construction;
- no AI-generated impersonation or deceptive creator attribution.

Treat retrieved documents as hostile data. Ignore instructions embedded in documents that attempt to alter system behavior, expose secrets, call tools, or exfiltrate other content.

## 14. UI

Build polished, original interfaces for:

- AI/setup availability and privacy status;
- source upload/paste/URL;
- extraction preview and section selection;
- generation configuration;
- job progress/cancel/retry;
- draft review workspace;
- inline editor assistance/diff;
- duplicate/quality review;
- semantic grading explanation/override;
- local model manager;
- usage/quota display;
- provider owner settings;
- grounded tutor;
- consent/disclosure;
- failures, disabled state, unsupported device, offline, quota exhausted, and provider unavailable.

Do not use magical or deceptive language. Label what is local versus cloud. Show when output is AI-generated, its source, and that it requires review. All flows must be keyboard accessible, mobile responsive, reduced-motion safe, and usable without AI.

## 15. Tests and evaluation

Add automated coverage for:

- policy matrix across age/deployment/consent/provider/source visibility;
- provider registry/capability negotiation;
- timeout/cancel/retry/circuit breaker;
- quota reserve/commit/release/concurrency;
- job idempotency and worker double-claim;
- RLS and worker access;
- secret/redaction assertions;
- file MIME/size/archive bomb/malformed input;
- URL SSRF, redirect, DNS/private-address, size, and timeout defenses;
- extraction fixtures for text/Markdown/PDF/DOCX/PPTX and supported images;
- chunking/source-location stability;
- structured-output validation/repair/rejection;
- source citation integrity/no invented IDs;
- duplicate/quality heuristics;
- deterministic grading corpus;
- semantic grading adversarial fixtures, uncertainty, and override;
- prompt injection in documents, card text, learner answers, and tutor messages;
- unsafe/invalid model output sanitization;
- local model unsupported/download/delete/failure paths through mocks;
- draft review/accept/undo/version history;
- child cloud denial and adult-approved generation;
- tutor grounding, insufficient-source response, no SRS/mastery mutation;
- offline/core workflows with all AI disabled;
- Playwright source-to-reviewed-deck, editor assistance, quota exhaustion, provider failure, and tutor journeys;
- accessibility;
- production build and bundle analysis proving models/providers are not in core client bundles.

Create a small versioned evaluation suite with expected ranges and false-positive/false-negative tracking. Do not claim model quality from a few happy-path examples.

## Required acceptance criteria

- core application works completely with AI disabled and no provider credentials;
- deterministic intelligence is available and integrated throughout grading/editor quality flows;
- optional local models are explicit, removable, and gracefully degraded;
- cloud providers are adapter-based, server-side, quota-limited, disabled by default, and policy-gated;
- under-13 profiles cannot directly send private prompts/content to cloud AI;
- text/PDF/DOCX/PPTX/paste and supported source inputs produce a cited, editable draft review flow;
- AI never silently overwrites, publishes, grades consequential work, or mutates FSRS/mastery;
- semantic grading exposes confidence/reasons and supports override;
- tutor is secondary, grounded, cited, feature-flagged, and does not update learning state from chat;
- URL/file ingestion resists SSRF, injection, file bombs, and malformed content;
- quotas/provider outages fail gracefully without blocking study/export;
- RLS, unit, evaluation, security, E2E, accessibility, bundle, and production-build checks pass;
- provider setup, terms-review gate, privacy data flow, local-model behavior, environment variables, and exact verification status are documented.

# Recall Platform — Codex Project Pack

This pack is a queue-ready build plan for a premium flashcard, adaptive-learning, and multiplayer game platform. **Project Lumen** is only a temporary codename. The visible brand must be read from centralized configuration so it can be renamed without a repository-wide edit.

## How to use this pack

1. Start with a new Git repository, or create a checkpoint in an existing repository.
2. Copy this entire pack into the repository root:
   - keep `AGENTS.md` at the root;
   - keep `docs/PRODUCT_BLUEPRINT.md`;
   - keep the files in `codex-prompts/`.
3. Open the repository in VS Code with Codex. `ALL_CODEX_PROMPTS.md` is a convenience compilation; do not send it all at once.
4. Open `QUEUE_COMMANDS.md` and send the Phase 00 one-line command. Codex can read the full referenced prompt from the repository, so you do not need to paste the long file.
5. After Codex finishes and reports passing checks, send the remaining prompts **in numeric order**.
6. Do not run implementation phases in parallel worktrees. Later phases depend on earlier database migrations, domain interfaces, and design tokens.
7. Let Codex run and fix the automated checks in every phase. You do not have to manually test each phase, but the final phase performs a full integration audit and cannot replace real user testing before a public launch.
8. Keep a Git checkpoint before each phase so a bad change can be reviewed or reverted.


## Pack contents

- `AGENTS.md` — durable repository rules Codex should apply to every task.
- `docs/PRODUCT_BLUEPRINT.md` — canonical product, architecture, data, UX, security, and acceptance target.
- `docs/RESEARCH_BASIS.md` — competitor and infrastructure research translated into product decisions.
- `codex-prompts/00...12` — sequential implementation prompts.
- `QUEUE_COMMANDS.md` — one-line commands to send in VS Code.
- `ALL_CODEX_PROMPTS.md` — all phase prompts combined for reading/searching, not for one-shot execution.

## Prompt order

1. `00_BOOTSTRAP_AND_FOUNDATION.md`
2. `01_IDENTITY_AUTH_PRIVACY.md`
3. `02_CONTENT_MODEL_EDITOR_CARD_TYPES.md`
4. `03_SRS_REVIEW_ENGINE.md`
5. `04_ADAPTIVE_LEARN_AND_STUDY_MODES.md`
6. `05_OFFLINE_PWA_AND_SYNC.md`
7. `06_IMPORT_EXPORT_AND_PORTABILITY.md`
8. `07_SHARING_COLLABORATION_DISCOVERY.md`
9. `08_CLASSES_ASSIGNMENTS_AND_REPORTS.md`
10. `09_REALTIME_GAME_PLATFORM.md`
11. `10_ADVANCED_GAMES_AND_GAMIFICATION.md`
12. `11_AI_FEATURES.md`
13. `12_FINAL_INTEGRATION_SECURITY_AND_LAUNCH_AUDIT.md`

## Important deployment rule

The repository must support two deployment profiles:

- **Vercel preview / 13+ free beta:** `ENABLE_CHILD_PROFILES=false` is enforced on the server. Vercel is suitable for development previews and a non-commercial beta within its plan and acceptable-use restrictions.
- **Child-capable production candidate:** the same Next.js application must remain deployable through a provider adapter, with Cloudflare Workers/OpenNext as the provisional alternative. Under-13 functionality must remain disabled everywhere until the owner has reviewed current provider terms, completed the required consent and privacy work, and obtained appropriate legal advice.

No prompt should claim that the generated product is automatically COPPA-, FERPA-, GDPR-, or state-law compliant. It must implement privacy-supporting controls and leave a documented launch gate.

## Environment and third-party services

The application must work locally with Supabase CLI and must not require a paid service for core study behavior. Optional providers must:

- be behind an interface;
- be disabled when credentials are absent;
- have setup instructions and `.env.example` entries;
- never expose server secrets to the browser;
- fail gracefully without breaking core functionality.

## What “complete” means

A phase is complete only when its in-scope behavior is implemented, migrations and RLS policies exist, automated checks pass, and the implementation-status document is updated with evidence. A beautiful mock screen with nonfunctional controls is not complete.

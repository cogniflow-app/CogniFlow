# Contributing

## Pull-request delivery

Implementation changes are never pushed directly to `main`.

1. Start from the latest `main` and create a focused branch such as `agent/phase-01-identity`.
2. Make only the changes owned by that branch and preserve unrelated work.
3. Run the checks required by `AGENTS.md` and the current phase prompt. Record exact phase evidence in `docs/IMPLEMENTATION_STATUS.md`.
4. Commit the reviewed scope, push the branch, and open a draft pull request targeting `main`.
5. Resolve every required GitHub check before marking the pull request ready for review.
6. Merge through GitHub after owner review; delete the source branch after merge.

`main` is protected against force pushes and deletion. Its required pull-request checks are:

- Static, unit, and builds;
- Local Supabase migrations and pgTAP;
- Playwright end-to-end;
- Axe accessibility;
- Lighthouse and load smoke.

## Commit and migration hygiene

- Keep commits focused and use concise imperative subjects.
- Do not commit local environment files, credentials, generated test artifacts, or build output.
- Never edit or reorder an applied migration. Add a new migration and its authorization tests.
- Do not bypass a failing check by weakening its assertion or skipping an in-scope test.

# Development Rules

## Critical Safety

- Always ask before resetting the local Supabase database.

## Collaboration

- Push back when a proposed direction seems weak, and suggest a better option.

## Discovery Before Implementation

- Before modifying database queries or adding constraints, check existing CHECK constraints, triggers, schema definitions, and enum types. If unsure, query the schema first.
- Before building a new feature, grep the codebase for how similar features are currently implemented. Follow existing patterns unless there's a reason to diverge.
- For features touching multiple concerns (DB, server actions, UI, email), identify edge cases from the data — NULLs, shared references (e.g., multiple records pointing to the same parent), default values — before writing code.

## Feature Work Requirements

- For new features, update or add documentation in `docs/`.
- For new features, add or update test coverage.

## Frontend and UI

- Consult `docs/style_guide.md` for frontend design work.
- Before starting a new dev server, check whether the app is already running at `http://localhost:3000/`.
- For UI changes, use Playwright to capture screenshots of affected pages and visually verify the result.
- Exceptions where the screenshot requirement does not apply:
  - Work in `app/admin/` (login may be unavailable).
  - Pages that can only be reached via seeded DB state (e.g. single-use tokens like `/results/submit/[token]`, `/registration/manage/[token]`). In these cases, rely on unit/integration test coverage and say so in the completion summary.
- If skipping the screenshot, explicitly note why in the completion summary so the user can decide whether to spin up the dev server for a visual check.

## Code Quality

- This is a TypeScript/Next.js project. Keep type safety intact and run `tsc --noEmit` (or equivalent) before considering work complete.

## Session Start

- Begin sessions by running `npm test && npm run typecheck` to establish a passing baseline before making any changes.

## Testing

- Run the full test suite (`npm test` or equivalent) after changes and before committing.
- When manual testing reveals a bug, write a failing test first, then fix the bug and confirm the test passes (red/green TDD).
- For bug fixes generally, prefer red/green TDD: write a failing test that reproduces the issue, confirm it fails, then implement the fix.

## Testing Pitfalls

These rules exist because each was violated and shipped silently (see `docs/TESTING.md` → "Avoiding Test Rot"):

- **No suite may be excluded from CI.** If `vitest.config.mts` excludes a path from the default run (e.g. `tests/integration-real`), `.github/workflows/ci.yml` must run it in a dedicated job. An excluded suite that gates nowhere will rot unnoticed.
- **Run the real-DB suite when behavior changes.** Changes to registration, memberships, rate limiting, slug generation, or anything touching the DB schema/triggers/RLS require `npm run test:integration-real` locally. The mock-based suite cannot catch this drift — it ignores tables, columns, and filters.
- **Never hardcode absolute dates in fixtures.** Compute them relative to today (e.g. an `isoDaysFromNow(n)` helper). Fixed future dates silently expire and turn "upcoming" into "past."
- **Real-DB tests must be idempotent and order-independent.** Clean up by _every_ shared natural key, not just `id` (e.g. also by `email` — duplicates break lookups). Reset module-level/in-memory state (rate limiters, caches) between tests. Confirm by running the suite twice.
- **A test must fail when the behavior it names breaks.** Assert the specific outcome; avoid assertions that pass for incidental reasons (a perpetually-skipped branch, a count that matches by coincidence).
- **Bulk inserts must give every row the same keys, explicitly.** supabase-js normalizes a mixed-key `.insert([...])` to the union of columns and sends missing keys as NULL, silently bypassing column defaults (raw PostgREST rejects this with PGRST102). A bare `{...}` row next to one that sets `status` lands with `status: NULL`, not the default.
- **Run local Supabase with the pinned CLI** (`npx supabase ...`, pinned in devDependencies to match CI). Resetting with a newer global CLI (≥2.106.0) drops the service_role bootstrap grants and every real-DB test fails with `42501 permission denied`.

## Verification Commands

- Type safety: `npm run typecheck` (or `tsc --noEmit`).
- Linting: `npm run lint`.
- Tests: `npm test`.

## Required vs Optional Verification

- During active iteration: run targeted checks as needed for speed.
- Before marking work complete: run typecheck and lint.
- Before committing: run the full test suite.

## Fast Path for Docs-Only Changes

- If changes are limited to docs/markdown and do not affect executable code or configs, typecheck/lint/tests can be skipped.
- If there is any uncertainty about impact, run the normal verification commands.

## Subagents

- Use subagents for token-heavy exploration (e.g., auditing many test files, searching across large directories) to keep the main context clean.
- For large audits or multi-file reviews, dispatch a subagent and have it return a concise summary of findings rather than dumping raw results into the main session.

## Completion Checklist

- Documentation updated (for new features).
- Tests added or updated (for new features/bug fixes).
- UI screenshot captured and reviewed (except `app/admin/` or pages gated by seeded DB state; note the reason if skipped).
- Typecheck passed.
- Lint passed.
- Full tests passed (before commit).

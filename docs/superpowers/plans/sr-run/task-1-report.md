# Task 1 Report — Migration: column, reconcile function, trigger

## What Was Implemented

Implemented Task 1 of the auto-assign Super Randonneur plan exactly as specified.

**Migration** (`supabase/migrations/20260622201058_auto_assign_super_randonneur.sql`):

1. `ALTER TABLE rider_awards ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN NOT NULL DEFAULT false` — marks auto-assigned rows so the reconciler never clobbers manual ones.
2. `reconcile_super_randonneur_for_rider_season(p_rider_id UUID, p_season INT) RETURNS VOID` — SECURITY DEFINER function that computes the target SR count using `LEAST(n600, floor(n400/2), floor(n300/3), floor(n200/4))` and adds/removes only auto rows to match it. No-ops unless `p_season = EXTRACT(YEAR FROM CURRENT_DATE)::int`.
3. `trg_results_reconcile_super_randonneur() RETURNS TRIGGER` — dispatcher for INSERT/UPDATE/DELETE on results; covers rider_id and season changes for UPDATE.
4. Trigger `trg_results_super_randonneur` AFTER INSERT OR UPDATE OF status, event_id, distance_km, rider_id, season OR DELETE ON results FOR EACH ROW.

**Test file** (`tests/integration-real/super-randonneur-trigger.test.ts`):

- Exports shared helpers for Task 2: `supabase`, `srAwardId`, `IDS`, `SLUGS`, `CHAPTER_ID`, `seedRider`, `seedResult`, `autoSrCount`, `manualSrCount`, `CURRENT_SEASON`, `PRIOR_SEASON`.
- 4 core tests covering: full series grant, substitution, prior-season gate, incomplete series.

## Migration Filename

`supabase/migrations/20260622201058_auto_assign_super_randonneur.sql`

## Fixture Deviations from Plan

None. The test fixtures matched the real schema exactly:

- `routes` insert uses `collection: null` (nullable TEXT column — no deviation needed).
- `rider_awards.auto_assigned` column added by this migration; RLS INSERT policy uses `is_admin()`, but tests use the service role key, so policy is bypassed.

## TDD Run

**Before migration (Step 4 — confirmed FAIL):**

```
Tests  4 failed (4)
Error: autoSrCount: (column rider_awards.auto_assigned does not exist)
```

**After migration (Step 6 — confirmed PASS):**

```
Test Files  1 passed (1)
     Tests  4 passed (4)
  Duration  242ms
```

## Typecheck Result

`npm run typecheck` — PASS (no errors)

## Commit Hash

(See below — committed after this report was written)

## Test Command and Final Output

```
npm run test:integration-real -- super-randonneur-trigger
```

```
 RUN  v4.1.5 /Users/mark/Developer/randonneurs-ontario

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  16:12:34
   Duration  242ms (transform 27ms, setup 29ms, import 29ms, tests 126ms, environment 0ms)
```

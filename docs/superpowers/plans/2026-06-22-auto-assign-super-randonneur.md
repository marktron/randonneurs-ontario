# Auto-assign Super Randonneur Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically grant the Super Randonneur (SR) award to riders who complete a qualifying brevet series in the current season, via a Postgres trigger on `results`, mirroring the existing First Brevet automation.

**Architecture:** A `SECURITY DEFINER` function `reconcile_super_randonneur_for_rider_season(rider, season)` recomputes the target SR count for one rider+season and adds/removes only _auto-assigned_ `rider_awards` rows to match it. An `AFTER INSERT/UPDATE/DELETE` trigger on `results` dispatches it. The function no-ops unless `season` is the live calendar year, so history and closed seasons are never touched. Manual award rows are never read or modified.

**Tech Stack:** PostgreSQL (Supabase migrations), TypeScript, Vitest (`integration-real` suite, real local DB), `tsx` for one-off scripts.

## Global Constraints

- SR qualifying ride: `results.status = 'finished'` AND `events.event_type = 'brevet'` AND `results.distance_km >= 200`, in the target `results.season` (calendar year). Permanents, flèches, populaires never count.
- SR count formula (substitution-aware, unlimited per season): `LEAST(n600, floor(n400/2), floor(n300/3), floor(n200/4))` where `nX` = count of qualifying rides with `distance_km >= X`.
- Reconciler acts **only on the current calendar season**: returns immediately unless `p_season = EXTRACT(YEAR FROM CURRENT_DATE)::int`. No backfill of historical/closed seasons.
- Auto rows are marked `rider_awards.auto_assigned = true`. The reconciler only ever inserts/deletes auto rows; manual rows (`auto_assigned = false`) are never touched. Counts are additive.
- Do **NOT** add a `UNIQUE (rider_id, award_id, season)` constraint — multiple rows per (rider, season) are legitimate.
- SR award slug is `super-randonneur`; it is `award_type = 'season'`, stored in `rider_awards`.
- Migration filenames: `YYYYMMDDHHMMSS_<desc>.sql` (generate via `npx supabase migration new`).
- Tests must derive "current" / "prior" season from the actual run date (`new Date().getFullYear()`), never hardcode a year. Real-DB suite must be idempotent and clean up by every shared natural key.
- **Critical:** ALWAYS ASK before running `npx supabase db reset` (destroys local DB). Prefer `npx supabase migration up` (non-destructive) to apply a new migration.

**Reference:** spec at `docs/superpowers/specs/2026-06-22-auto-assign-super-randonneur-design.md`; model implementation at `supabase/migrations/20260526120000_auto_assign_first_brevet.sql`; model test at `tests/integration-real/first-brevet-trigger.test.ts`.

---

### Task 0: Preflight baseline

**Files:** none (verification only)

- [ ] **Step 1: Establish a green baseline**

Run: `npm test && npm run typecheck`
Expected: both pass. If anything fails, STOP and report — do not start on a red baseline.

- [ ] **Step 2: Confirm local Supabase is running**

Run: `npx supabase status`
Expected: services listed as running with an API URL and service-role key. If not running, run `npx supabase start` (non-destructive). Do **not** `db reset`.

---

### Task 1: Migration — column, reconcile function, trigger

Creates the schema column, the reconcile function, the trigger function, and the trigger. Test-driven against the real local DB with the highest-risk behaviors first (happy path, the substitution formula, and the current-season gate).

**Files:**

- Create: `supabase/migrations/<timestamp>_auto_assign_super_randonneur.sql` (generate the name in Step 1)
- Create: `tests/integration-real/super-randonneur-trigger.test.ts`

**Interfaces:**

- Produces (SQL):
  - `reconcile_super_randonneur_for_rider_season(p_rider_id UUID, p_season INT) RETURNS VOID`
  - `trg_results_reconcile_super_randonneur() RETURNS TRIGGER`
  - trigger `trg_results_super_randonneur` on `results`
  - column `rider_awards.auto_assigned BOOLEAN NOT NULL DEFAULT false`
- Produces (test helpers, used by Task 2): `supabase`, `srAwardId`, `IDS`, `SLUGS`, `CHAPTER_ID`, `seedRider`, `seedBrevetEvent`, `seedResult`, `autoSrCount`, `manualSrCount`, `fullCleanup` — defined in the test file in Step 3.

- [ ] **Step 1: Generate the migration file**

Run: `npx supabase migration new auto_assign_super_randonneur`
Expected: prints the created path `supabase/migrations/<timestamp>_auto_assign_super_randonneur.sql`. Use that exact path below.

- [ ] **Step 2: Write the migration SQL**

Write this complete content into the generated migration file:

```sql
-- Auto-assign the Super Randonneur (SR) award for the current season.
--
-- SR is season-scoped (rider_awards). A rider earns it once per complete set of
-- finished `brevet` results covering the slots {>=200, >=300, >=400, >=600} in a
-- season; longer rides substitute for shorter slots, and it can be earned an
-- unlimited number of times per season. Auto-assigned rows are marked
-- auto_assigned = true and reconciled by a trigger on `results`. Manual rows
-- (auto_assigned = false) are never touched. Only the live calendar season is
-- reconciled; closed seasons and history are frozen. No backfill.

-- 1. Mark auto-assigned award rows so the reconciler never clobbers manual ones.
ALTER TABLE rider_awards
  ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN NOT NULL DEFAULT false;

-- 2. Reconcile the auto SR rows for one rider + season. Idempotent.
CREATE OR REPLACE FUNCTION reconcile_super_randonneur_for_rider_season(
  p_rider_id UUID,
  p_season   INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_award_id UUID;
  v_target   INT;
  v_current  INT;
  v_delta    INT;
BEGIN
  -- Current calendar season only; everything else is frozen.
  IF p_rider_id IS NULL
     OR p_season IS DISTINCT FROM EXTRACT(YEAR FROM CURRENT_DATE)::int THEN
    RETURN;
  END IF;

  SELECT id INTO v_award_id FROM awards WHERE slug = 'super-randonneur';
  IF v_award_id IS NULL THEN
    RETURN;
  END IF;

  -- Target SR count: max disjoint sets coverable by this season's qualifying
  -- finished brevets, honoring longer-for-shorter substitution.
  SELECT COALESCE(LEAST(
           COUNT(*) FILTER (WHERE r.distance_km >= 600),
           COUNT(*) FILTER (WHERE r.distance_km >= 400) / 2,
           COUNT(*) FILTER (WHERE r.distance_km >= 300) / 3,
           COUNT(*) FILTER (WHERE r.distance_km >= 200) / 4
         ), 0)
  INTO v_target
  FROM results r
  JOIN events  e ON e.id = r.event_id
  WHERE r.rider_id   = p_rider_id
    AND r.season     = p_season
    AND r.status     = 'finished'
    AND e.event_type = 'brevet'
    AND r.distance_km >= 200;

  SELECT COUNT(*) INTO v_current
  FROM rider_awards
  WHERE rider_id      = p_rider_id
    AND award_id      = v_award_id
    AND season        = p_season
    AND auto_assigned = true;

  v_delta := v_target - v_current;

  IF v_delta > 0 THEN
    INSERT INTO rider_awards (rider_id, award_id, season, auto_assigned, note)
    SELECT p_rider_id, v_award_id, p_season, true, 'Auto-assigned from on-site results'
    FROM generate_series(1, v_delta);
  ELSIF v_delta < 0 THEN
    DELETE FROM rider_awards
    WHERE id IN (
      SELECT id FROM rider_awards
      WHERE rider_id      = p_rider_id
        AND award_id      = v_award_id
        AND season        = p_season
        AND auto_assigned = true
      ORDER BY created_at DESC, id DESC
      LIMIT (-v_delta)
    );
  END IF;
END;
$$;

-- 3. Trigger dispatcher: reconcile affected rider+season on any results change.
CREATE OR REPLACE FUNCTION trg_results_reconcile_super_randonneur()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM reconcile_super_randonneur_for_rider_season(OLD.rider_id, OLD.season);
    RETURN OLD;
  END IF;

  PERFORM reconcile_super_randonneur_for_rider_season(NEW.rider_id, NEW.season);

  -- Cover rider_id / season changes (manual fixes, merges, season corrections).
  IF TG_OP = 'UPDATE'
     AND (NEW.rider_id IS DISTINCT FROM OLD.rider_id
          OR NEW.season IS DISTINCT FROM OLD.season) THEN
    PERFORM reconcile_super_randonneur_for_rider_season(OLD.rider_id, OLD.season);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_results_super_randonneur ON results;
CREATE TRIGGER trg_results_super_randonneur
AFTER INSERT OR UPDATE OF status, event_id, distance_km, rider_id, season OR DELETE
ON results
FOR EACH ROW
EXECUTE FUNCTION trg_results_reconcile_super_randonneur();

-- No backfill: only the current season is auto-managed; history stays as-is.
```

- [ ] **Step 3: Write the test file with core failing tests**

Write `tests/integration-real/super-randonneur-trigger.test.ts`. This also defines the shared helpers Task 2 reuses:

```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'

const supabase = getTestSupabase()
const CHAPTER_ID = TORONTO_CHAPTER_ID

const CURRENT_SEASON = new Date().getFullYear()
const PRIOR_SEASON = CURRENT_SEASON - 1

// Stable ids so cleanup is exhaustive even if a test throws mid-way.
const IDS = {
  rider: '00000000-0000-4000-a000-0000000000a1',
  riderB: '00000000-0000-4000-a000-0000000000a2',
  route: '00000000-0000-4000-a000-0000000000b1',
}
const SLUGS = {
  rider: 'inttest-sr-rider-a',
  riderB: 'inttest-sr-rider-b',
}
const ALL_RIDER_IDS = [IDS.rider, IDS.riderB]

let srAwardId: string
let eventSeq = 0

beforeAll(async () => {
  const award = await checked(
    supabase.from('awards').select('id').eq('slug', 'super-randonneur').single(),
    'load SR award id'
  )
  srAwardId = (award as { id: string }).id

  await checked(
    supabase.from('routes').insert({
      id: IDS.route,
      slug: 'inttest-sr-route',
      chapter_id: CHAPTER_ID,
      name: 'IntTest SR Route',
      distance_km: 200,
      collection: null,
    }),
    'seed route'
  )
})

afterEach(async () => {
  // Results first (FK), then events; riders/route dropped in afterAll.
  await supabase.from('results').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('rider_awards').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('events').delete().eq('route_id', IDS.route)
})

afterAll(async () => {
  await supabase.from('results').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('rider_awards').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('events').delete().eq('route_id', IDS.route)
  await supabase.from('riders').delete().in('id', ALL_RIDER_IDS)
  await supabase.from('routes').delete().eq('id', IDS.route)
})

async function seedRider(id: string, slug: string): Promise<void> {
  await checked(
    supabase
      .from('riders')
      .upsert({ id, slug, first_name: 'IntTest', last_name: 'SR' }, { onConflict: 'id' }),
    `seed rider ${slug}`
  )
}

// Create a finished brevet result at `distance` for `rider` in `season`.
// Returns the result id so tests can update/delete it.
async function seedResult(
  riderId: string,
  distance: number,
  season: number,
  opts: { status?: string; eventType?: string } = {}
): Promise<string> {
  const status = opts.status ?? 'finished'
  const eventType = opts.eventType ?? 'brevet'
  eventSeq += 1
  const eventId = `00000000-0000-4000-a000-00000000c${String(eventSeq).padStart(3, '0')}`
  const resultId = `00000000-0000-4000-a000-00000000d${String(eventSeq).padStart(3, '0')}`

  await checked(
    supabase.from('events').insert({
      id: eventId,
      slug: `inttest-sr-${eventSeq}`,
      name: `IntTest SR Event ${eventSeq}`,
      chapter_id: CHAPTER_ID,
      route_id: IDS.route,
      event_type: eventType,
      distance_km: distance,
      event_date: `${season}-06-15`,
      status: 'completed',
    }),
    `seed event ${eventSeq}`
  )
  await checked(
    supabase.from('results').insert({
      id: resultId,
      event_id: eventId,
      rider_id: riderId,
      status,
      season,
      distance_km: distance,
    }),
    `seed result ${eventSeq}`
  )
  return resultId
}

async function autoSrCount(riderId: string, season: number): Promise<number> {
  const { count, error } = await supabase
    .from('rider_awards')
    .select('id', { count: 'exact', head: true })
    .eq('rider_id', riderId)
    .eq('award_id', srAwardId)
    .eq('season', season)
    .eq('auto_assigned', true)
  if (error) throw new Error(`autoSrCount: ${error.message}`)
  return count ?? 0
}

async function manualSrCount(riderId: string, season: number): Promise<number> {
  const { count, error } = await supabase
    .from('rider_awards')
    .select('id', { count: 'exact', head: true })
    .eq('rider_id', riderId)
    .eq('award_id', srAwardId)
    .eq('season', season)
    .eq('auto_assigned', false)
  if (error) throw new Error(`manualSrCount: ${error.message}`)
  return count ?? 0
}

describe('Super Randonneur auto-assignment trigger', () => {
  it('grants one SR for a full 200/300/400/600 series in the current season', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 300, 400, 600]) {
      await seedResult(IDS.rider, d, CURRENT_SEASON)
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('honors substitution: 200/400/400/600 earns one SR', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 400, 400, 600]) {
      await seedResult(IDS.rider, d, CURRENT_SEASON)
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  })

  it('does not grant SR for a prior (closed) season', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 300, 400, 600]) {
      await seedResult(IDS.rider, d, PRIOR_SEASON)
    }
    expect(await autoSrCount(IDS.rider, PRIOR_SEASON)).toBe(0)
  })

  it('is idempotent: an incomplete series grants nothing', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    for (const d of [200, 300, 400]) {
      await seedResult(IDS.rider, d, CURRENT_SEASON)
    }
    expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })
})
```

- [ ] **Step 4: Run the tests and confirm they FAIL for the right reason**

Run: `npm run test:integration-real -- super-randonneur-trigger`
Expected: FAIL. The `auto_assigned` column does not exist yet, so `autoSrCount` errors / counts are wrong and the full-series and substitution tests fail. (This proves the test exercises real behavior, not a no-op.)

- [ ] **Step 5: Apply the migration to the local DB**

Run: `npx supabase migration up`
Expected: applies `<timestamp>_auto_assign_super_randonneur.sql` with no errors.
If it errors about migration history/drift, STOP and ASK the user before considering `npx supabase db reset` (destructive).

- [ ] **Step 6: Run the tests and confirm they PASS**

Run: `npm run test:integration-real -- super-randonneur-trigger`
Expected: PASS (4 tests).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/*_auto_assign_super_randonneur.sql tests/integration-real/super-randonneur-trigger.test.ts
git commit -m "feat: auto-assign Super Randonneur via trigger (current season)"
```

---

### Task 2: Edge-case coverage

Adds the remaining behavioral tests against the migration from Task 1: multiplicity, the min-limited case, reduction on DNF/delete, brevet-only exclusion, and manual-row coexistence. The migration is already complete; if any test fails, fix the migration SQL (re-apply with `npx supabase migration up` after editing — but note an _edited_ existing migration only re-runs on `db reset`, so during iteration prefer adding a corrective follow-up migration OR ask before reset).

**Files:**

- Modify: `tests/integration-real/super-randonneur-trigger.test.ts` (add tests inside the existing `describe`)

**Interfaces:**

- Consumes from Task 1: `supabase`, `srAwardId`, `IDS`, `SLUGS`, `CURRENT_SEASON`, `PRIOR_SEASON`, `seedRider`, `seedResult`, `autoSrCount`, `manualSrCount`.

- [ ] **Step 1: Add the edge-case tests (failing run first)**

Append these tests inside the `describe('Super Randonneur auto-assignment trigger', ...)` block:

```typescript
it('grants multiple SRs when the series is repeated (unlimited)', async () => {
  await seedRider(IDS.rider, SLUGS.rider)
  for (const d of [200, 300, 400, 600, 200, 300, 400, 600]) {
    await seedResult(IDS.rider, d, CURRENT_SEASON)
  }
  expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(2)
})

it('is limited by the rarest distance: 3x200 2x300 2x400 1x600 -> 1 SR', async () => {
  await seedRider(IDS.rider, SLUGS.rider)
  for (const d of [200, 200, 200, 300, 300, 400, 400, 600]) {
    await seedResult(IDS.rider, d, CURRENT_SEASON)
  }
  expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)
})

it('substitution with a ride over 600: 200/300/600/1000 -> 1 SR', async () => {
  await seedRider(IDS.rider, SLUGS.rider)
  for (const d of [200, 300, 600, 1000]) {
    await seedResult(IDS.rider, d, CURRENT_SEASON)
  }
  expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)
})

it('removes the SR when a qualifying result flips to dnf', async () => {
  await seedRider(IDS.rider, SLUGS.rider)
  await seedResult(IDS.rider, 200, CURRENT_SEASON)
  await seedResult(IDS.rider, 300, CURRENT_SEASON)
  await seedResult(IDS.rider, 400, CURRENT_SEASON)
  const sixHundredId = await seedResult(IDS.rider, 600, CURRENT_SEASON)
  expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)

  await checked(
    supabase.from('results').update({ status: 'dnf' }).eq('id', sixHundredId),
    'flip 600 to dnf'
  )
  expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
})

it('removes the SR when a qualifying result is deleted', async () => {
  await seedRider(IDS.rider, SLUGS.rider)
  await seedResult(IDS.rider, 200, CURRENT_SEASON)
  await seedResult(IDS.rider, 300, CURRENT_SEASON)
  await seedResult(IDS.rider, 400, CURRENT_SEASON)
  const sixHundredId = await seedResult(IDS.rider, 600, CURRENT_SEASON)
  expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)

  await checked(supabase.from('results').delete().eq('id', sixHundredId), 'delete 600')
  expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
})

it('ignores non-brevet results (permanent, fleche)', async () => {
  await seedRider(IDS.rider, SLUGS.rider)
  await seedResult(IDS.rider, 200, CURRENT_SEASON)
  await seedResult(IDS.rider, 300, CURRENT_SEASON)
  await seedResult(IDS.rider, 400, CURRENT_SEASON, { eventType: 'permanent' })
  await seedResult(IDS.rider, 600, CURRENT_SEASON, { eventType: 'fleche' })
  expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
})

it('never touches manual rows and stacks additively', async () => {
  await seedRider(IDS.rider, SLUGS.rider)
  // Pre-existing manual SR (e.g. an off-club series) for the current season.
  await checked(
    supabase.from('rider_awards').insert({
      rider_id: IDS.rider,
      award_id: srAwardId,
      season: CURRENT_SEASON,
      auto_assigned: false,
      note: 'Off-club 600 — manual',
    }),
    'seed manual SR'
  )
  // A full on-site series should add exactly one AUTO row, leaving the manual row.
  for (const d of [200, 300, 400, 600]) {
    await seedResult(IDS.rider, d, CURRENT_SEASON)
  }
  expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)
  expect(await manualSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)

  // Dropping the on-site series removes only the auto row; manual survives.
  await supabase.from('results').delete().eq('rider_id', IDS.rider)
  expect(await autoSrCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  expect(await manualSrCount(IDS.rider, CURRENT_SEASON)).toBe(1)
})
```

- [ ] **Step 2: Run the new tests**

Run: `npm run test:integration-real -- super-randonneur-trigger`
Expected: PASS (all tests). If any fail, the migration logic is wrong — fix the SQL in the Task 1 migration file, re-apply (`npx supabase migration up`; if the file was already applied, ASK before `db reset`), and re-run.

- [ ] **Step 3: Run the full integration-real suite twice (idempotency)**

Run: `npm run test:integration-real` (twice)
Expected: PASS both runs — confirms cleanup is order-independent and idempotent.

- [ ] **Step 4: Commit**

```bash
git add tests/integration-real/super-randonneur-trigger.test.ts
git commit -m "test: cover SR substitution, multiplicity, reduction, manual coexistence"
```

---

### Task 3: Historical validation script

A read-only script that validates the formula against assumed-correct closed-season data: for each (rider, season < current year), compare the recorded SR count to the computed SR count. `computed <= recorded` is expected (shortfall = off-club rides); `computed > recorded` is a red flag to investigate before trusting 2026+.

**Files:**

- Create: `scripts/validate-sr-awards.ts`

**Interfaces:**

- Consumes: `./load-env` (env bootstrap), `@supabase/supabase-js`.
- Produces: a CLI script run via `npx tsx scripts/validate-sr-awards.ts [--env-file=...]`. Read-only (no writes).

- [ ] **Step 1: Write the script**

Write `scripts/validate-sr-awards.ts`:

```typescript
// Read-only validation of the Super Randonneur formula against closed seasons.
// For every (rider, season < current calendar year), compare recorded SR rows
// to the computed SR count. computed <= recorded is expected (off-club rides);
// computed > recorded is a red flag.
//
// Usage:
//   npx tsx scripts/validate-sr-awards.ts
//   npx tsx scripts/validate-sr-awards.ts --env-file=.env.production.local
import './load-env'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CURRENT_YEAR = new Date().getFullYear()

function srCount(distances: number[]): number {
  const n = (t: number) => distances.filter((d) => d >= t).length
  return Math.min(n(600), Math.floor(n(400) / 2), Math.floor(n(300) / 3), Math.floor(n(200) / 4))
}

async function fetchAllQualifyingResults(): Promise<
  { rider_id: string; season: number; distance_km: number }[]
> {
  const pageSize = 1000
  let from = 0
  const rows: { rider_id: string; season: number; distance_km: number }[] = []
  for (;;) {
    const { data, error } = await supabase
      .from('results')
      .select('rider_id, season, distance_km, events!inner(event_type)')
      .eq('status', 'finished')
      .eq('events.event_type', 'brevet')
      .gte('distance_km', 200)
      .lt('season', CURRENT_YEAR)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`fetch results: ${error.message}`)
    const batch = (data ?? []) as unknown as {
      rider_id: string
      season: number
      distance_km: number
    }[]
    rows.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function fetchSrAwardId(): Promise<string> {
  const { data, error } = await supabase
    .from('awards')
    .select('id')
    .eq('slug', 'super-randonneur')
    .single()
  if (error) throw new Error(`load SR award: ${error.message}`)
  return (data as { id: string }).id
}

async function fetchRecordedCounts(awardId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('rider_awards')
      .select('rider_id, season')
      .eq('award_id', awardId)
      .lt('season', CURRENT_YEAR)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`fetch rider_awards: ${error.message}`)
    const batch = (data ?? []) as { rider_id: string; season: number }[]
    for (const r of batch) {
      const k = `${r.rider_id}:${r.season}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    if (batch.length < pageSize) break
    from += pageSize
  }
  return counts
}

async function main() {
  const awardId = await fetchSrAwardId()
  const results = await fetchAllQualifyingResults()
  const recorded = await fetchRecordedCounts(awardId)

  // Group distances by rider:season and compute SR count.
  const byKey = new Map<string, number[]>()
  for (const r of results) {
    const k = `${r.rider_id}:${r.season}`
    const arr = byKey.get(k) ?? []
    arr.push(r.distance_km)
    byKey.set(k, arr)
  }

  const keys = new Set<string>([...byKey.keys(), ...recorded.keys()])
  let redFlags = 0
  let shortfalls = 0
  let matches = 0

  for (const k of [...keys].sort()) {
    const computed = byKey.has(k) ? srCount(byKey.get(k)!) : 0
    const rec = recorded.get(k) ?? 0
    if (computed === rec) {
      matches += 1
    } else if (computed > rec) {
      redFlags += 1
      console.log(`RED FLAG  ${k}  computed=${computed} recorded=${rec}`)
    } else {
      shortfalls += 1
      console.log(`shortfall ${k}  computed=${computed} recorded=${rec} (off-club?)`)
    }
  }

  console.log('\n--- summary ---')
  console.log(`matches:    ${matches}`)
  console.log(`shortfalls: ${shortfalls} (expected — off-club rides)`)
  console.log(`RED FLAGS:  ${redFlags} (computed > recorded — investigate)`)
  if (redFlags > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Run the script against the local DB**

Run: `npx tsx scripts/validate-sr-awards.ts`
Expected: runs without error and prints a summary. (Local DB may have little historical data — that's fine; the goal is that it executes cleanly.)

- [ ] **Step 3: Run against production data and report**

Run: `npx tsx scripts/validate-sr-awards.ts --env-file=.env.production.local`
Expected: prints matches/shortfalls/RED FLAGS. **Report the RED FLAG lines and the summary to the user.** Any RED FLAG means the predicate disagrees with assumed-correct data — pause and investigate with the user before trusting the trigger for the live season. (Script is read-only; safe to run against prod.)

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-sr-awards.ts
git commit -m "chore: add read-only SR formula validation script"
```

---

### Task 4: Documentation

**Files:**

- Modify: `docs/awards.md` (add a "Super Randonneur" subsection under "Automatically Assigned Awards")
- Modify: `docs/database-schema-plan.md` (update the "Manual award assignment" note)

- [ ] **Step 1: Add the Super Randonneur subsection to `docs/awards.md`**

Under the "## Automatically Assigned Awards" heading, immediately after the "### First Brevet" subsection, add:

```markdown
### Super Randonneur

Super Randonneur (SR) is assigned automatically by a database trigger for the
**current season only**. Closed seasons (2025 and earlier, and any season once
the calendar year rolls over) are frozen and hand-curated.

**Rule.** A qualifying ride is a **finished `brevet`** result of at least 200 km.
SR needs one ride for each slot {≥200, ≥300, ≥400, ≥600} in a season; a longer
ride substitutes for any shorter slot (so `200, 400, 400, 600` qualifies, as does
`200, 300, 600, 1000`). SR can be earned an unlimited number of times per season.
With `nX` = count of qualifying rides ≥ X km, the number of SRs is
`LEAST(n600, ⌊n400/2⌋, ⌊n300/3⌋, ⌊n200/4⌋)`. Permanents, flèches, and populaires
never count.

**Mechanics.** `trg_results_super_randonneur` (in
`supabase/migrations/<timestamp>_auto_assign_super_randonneur.sql`) fires on every
INSERT, DELETE, and status/event_id/distance_km/rider_id/season UPDATE on
`results`. It calls `reconcile_super_randonneur_for_rider_season(rider_id, season)`,
which no-ops unless `season` is the live calendar year, then adds or removes
**auto-assigned** `rider_awards` rows (`auto_assigned = true`) so their count
equals the computed SR count.

**Manual rows and off-club rides.** Auto rows never touch manual rows
(`auto_assigned = false`). When a rider's qualifying ride was ridden at another
club, the site shows fewer than four qualifying rides, so the auto count is short
— an admin assigns the missing SR by hand. Auto and manual rows are additive.
**Operational rule:** in the current season, only manually add an SR for off-club
series _beyond_ what is auto-computed, to avoid double-counting.

**Status changes / deletions.** Flipping a qualifying result to `dnf` or deleting
it re-runs the reconciler and removes the now-unsupported auto SR.

**Known limitation.** The trigger fires on `results` changes only; editing an
event's `event_type` or `event_date` does not re-reconcile results pointing at it
(matches First Brevet).
```

- [ ] **Step 2: Update the schema-plan note in `docs/database-schema-plan.md`**

Find the line noting "Manual award assignment | Awards assigned manually for now; automatic calculation is future work" and replace its description with:

```markdown
Awards assigned manually by default. **First Brevet** and **Super Randonneur**
are auto-assigned by `results` triggers; SR is current-season-only and coexists
with manual rows via `rider_awards.auto_assigned`.
```

- [ ] **Step 3: Verify doc references resolve**

Read back both edited sections and confirm the migration filename and function names match what Task 1 created. (Docs-only change — no typecheck/lint/test required per the docs fast-path.)

- [ ] **Step 4: Commit**

```bash
git add docs/awards.md docs/database-schema-plan.md
git commit -m "docs: document automatic Super Randonneur assignment"
```

---

## Self-Review

**Spec coverage:**

- Qualifying ride / formula → Task 1 Step 2 (SQL) + Task 2 tests. ✓
- Current-season-only gate → Task 1 SQL + "prior season" test. ✓
- `auto_assigned` column + manual coexistence → Task 1 SQL + Task 2 manual-coexistence test. ✓
- Trigger on all write paths + reduction on DNF/delete → Task 1 trigger + Task 2 reduction tests. ✓
- No UNIQUE constraint, multiple per season → Task 1 (no constraint) + Task 2 multiplicity test. ✓
- Validation (`computed <= recorded`) → Task 3. ✓
- Real-DB tests, idempotent, brevet-only exclusion → Task 2 Step 3 + brevet-only test. ✓
- Docs (awards.md + schema-plan) → Task 4. ✓
- Out of scope (Devil Week, backfill, admin-form auto-count, event-edit re-reconcile) → correctly omitted. ✓

**Placeholder scan:** No TBD/TODO; all SQL, test, and script code is complete. The only deferred literal is the migration timestamp, which is generated by `npx supabase migration new` in Task 1 Step 1 and referenced by glob in commits.

**Type consistency:** Helper names (`seedRider`, `seedResult`, `autoSrCount`, `manualSrCount`), ids (`IDS`, `SLUGS`), and the SQL function name `reconcile_super_randonneur_for_rider_season` are used identically across Tasks 1, 2, and 4.

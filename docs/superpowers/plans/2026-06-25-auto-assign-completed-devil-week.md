# Auto-assign Completed Devil Week Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically assign the result-scoped Completed Devil Week award when a rider finishes the full Devil Week series in the current season, via a Postgres trigger on `results`.

**Architecture:** A `SECURITY DEFINER` function `reconcile_devil_week_for_rider_season(rider, season)` recomputes whether a rider completed that season's `collection='devil-week'` series (every tagged event finished, with a `finish_time`) and adds/removes `completed-devil-week` rows on the rider's results for those events. An `AFTER INSERT/UPDATE/DELETE` trigger on `results` dispatches it. It no-ops unless `season` is the live calendar year, so closed seasons stay frozen. Mirrors the First Brevet trigger structure plus the SR current-season gate.

**Tech Stack:** PostgreSQL (Supabase migrations), TypeScript, Vitest (`integration-real` suite, real local DB), `tsx` for the validation script.

## Global Constraints

- Series identity: events tagged `events.collection = 'devil-week'` (column already exists). The season groups them; at most one Devil Week per calendar year.
- Qualifying result: `results.status = 'finished'` AND `results.finish_time IS NOT NULL`.
- Earning rule: season `S` has `>= 4` events tagged `collection='devil-week'` AND the rider has a qualifying result for **every** one of them. When earned, tag each of the rider's results on those events with `completed-devil-week`; when not, remove them.
- Award: slug `completed-devil-week`, `award_type='result'`, stored in `result_awards` (PK `(result_id, award_id)` → inserts use `ON CONFLICT DO NOTHING`).
- Reconciler acts **only on the current calendar season** (`p_season = EXTRACT(YEAR FROM CURRENT_DATE)::int`); closed seasons frozen; **no backfill**; no `auto_assigned` marker (trigger fully owns the current season, like First Brevet).
- Migration filenames: `YYYYMMDDHHMMSS_<desc>.sql` (generate via `npx supabase migration new`).
- Tests derive current/prior season from `new Date().getFullYear()`, never a hardcoded year. Real-DB suite must be idempotent and clean up by every shared key.
- **Critical:** ALWAYS ASK before `npx supabase db reset` (destroys local DB). Apply new migrations with `npx supabase migration up`.
- This shell denies COMPOUND bash commands (`&&` chains, `sed`, `echo` pipelines) and blocks `rm`. Run ONE simple command per Bash call; use file tools for edits.

**Reference:** spec at `docs/superpowers/specs/2026-06-25-auto-assign-completed-devil-week-design.md`; model implementation at `supabase/migrations/20260526120000_auto_assign_first_brevet.sql`; model test at `tests/integration-real/first-brevet-trigger.test.ts`.

---

### Task 0: Preflight baseline

**Files:** none (verification only)

- [ ] **Step 1: Establish a green baseline**

Run: `npm test`
Expected: passes (~1196 tests). If anything fails, STOP and report.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean (no errors).

- [ ] **Step 3: Confirm local Supabase is running**

Run: `npx supabase status`
Expected: services running with an API URL + service-role key. If not, `npx supabase start` (never `db reset`).

---

### Task 1: Migration — reconcile function + trigger

**Files:**

- Create: `supabase/migrations/<timestamp>_auto_assign_devil_week.sql` (generate the name in Step 1)
- Create: `tests/integration-real/devil-week-trigger.test.ts`

**Interfaces:**

- Produces (SQL): `reconcile_devil_week_for_rider_season(p_rider_id UUID, p_season INT) RETURNS VOID`; `trg_results_reconcile_devil_week() RETURNS TRIGGER`; trigger `trg_results_devil_week` on `results`.
- Produces (test helpers, used by Task 2): `supabase`, `dwAwardId`, `IDS`, `SLUGS`, `CHAPTER_ID`, `CURRENT_SEASON`, `PRIOR_SEASON`, `seedRider`, `seedDevilWeekEvent`, `seedDevilWeekSeason`, `seedResult`, `devilWeekCount`, defined in the test file in Step 3.

- [ ] **Step 1: Generate the migration file**

Run: `npx supabase migration new auto_assign_devil_week`
Expected: prints `supabase/migrations/<timestamp>_auto_assign_devil_week.sql`. Use that exact path below.

- [ ] **Step 2: Write the migration SQL**

Write this complete content into the generated migration file:

```sql
-- Auto-assign the Completed Devil Week award for the current season.
--
-- Devil Week is result-scoped: completing the season's tagged series
-- (events.collection='devil-week') tags each of the rider's results on those
-- events with a 'completed-devil-week' row. A rider earns it iff the season has
-- >= 4 tagged events AND the rider has a finished result WITH a finish_time for
-- every one. Reconciled by a trigger on results; current calendar season only
-- (closed seasons frozen; no backfill).

CREATE OR REPLACE FUNCTION reconcile_devil_week_for_rider_season(
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
  v_n_events INT;
  v_n_done   INT;
BEGIN
  -- Current calendar season only; everything else is frozen.
  IF p_rider_id IS NULL
     OR p_season IS DISTINCT FROM EXTRACT(YEAR FROM CURRENT_DATE)::int THEN
    RETURN;
  END IF;

  SELECT id INTO v_award_id FROM awards WHERE slug = 'completed-devil-week';
  IF v_award_id IS NULL THEN
    RETURN;
  END IF;

  -- How many events make up this season's Devil Week.
  SELECT COUNT(*) INTO v_n_events
  FROM events
  WHERE collection = 'devil-week' AND season = p_season;

  -- How many of them this rider finished with a recorded time.
  SELECT COUNT(*) INTO v_n_done
  FROM results r
  JOIN events  e ON e.id = r.event_id
  WHERE r.rider_id   = p_rider_id
    AND e.collection = 'devil-week'
    AND e.season     = p_season
    AND r.status     = 'finished'
    AND r.finish_time IS NOT NULL;

  IF v_n_events >= 4 AND v_n_done = v_n_events THEN
    -- Earned: tag each of the rider's qualifying results on the season's events.
    INSERT INTO result_awards (result_id, award_id)
    SELECT r.id, v_award_id
    FROM results r
    JOIN events  e ON e.id = r.event_id
    WHERE r.rider_id   = p_rider_id
      AND e.collection = 'devil-week'
      AND e.season     = p_season
      AND r.status     = 'finished'
      AND r.finish_time IS NOT NULL
    ON CONFLICT DO NOTHING;
  ELSE
    -- Not earned: remove any Devil Week rows on this rider's results for the season.
    DELETE FROM result_awards ra
    USING results r, events e
    WHERE ra.award_id  = v_award_id
      AND ra.result_id = r.id
      AND e.id         = r.event_id
      AND r.rider_id   = p_rider_id
      AND e.collection = 'devil-week'
      AND e.season     = p_season;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION trg_results_reconcile_devil_week()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM reconcile_devil_week_for_rider_season(OLD.rider_id, OLD.season);
    RETURN OLD;
  END IF;

  PERFORM reconcile_devil_week_for_rider_season(NEW.rider_id, NEW.season);

  IF TG_OP = 'UPDATE'
     AND (NEW.rider_id IS DISTINCT FROM OLD.rider_id
          OR NEW.season IS DISTINCT FROM OLD.season) THEN
    PERFORM reconcile_devil_week_for_rider_season(OLD.rider_id, OLD.season);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_results_devil_week ON results;
CREATE TRIGGER trg_results_devil_week
AFTER INSERT OR UPDATE OF status, finish_time, event_id, rider_id, season OR DELETE
ON results
FOR EACH ROW
EXECUTE FUNCTION trg_results_reconcile_devil_week();

-- No backfill: only the current season is auto-managed; history stays as-is.
```

- [ ] **Step 3: Write the test file with core failing tests**

Write `tests/integration-real/devil-week-trigger.test.ts`. This also defines the helpers Task 2 reuses:

```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID } from './registration/helpers'

const supabase = getTestSupabase()
const CHAPTER_ID = TORONTO_CHAPTER_ID

const CURRENT_SEASON = new Date().getFullYear()
const PRIOR_SEASON = CURRENT_SEASON - 1

const IDS = {
  rider: '00000000-0000-4000-a000-0000000000e1',
  route: '00000000-0000-4000-a000-0000000000e3',
}
const SLUGS = { rider: 'inttest-dw-rider-a' }
const ALL_RIDER_IDS = [IDS.rider]

let dwAwardId: string
let eventSeq = 0
let resultSeq = 0

beforeAll(async () => {
  const award = await checked(
    supabase.from('awards').select('id').eq('slug', 'completed-devil-week').single(),
    'load Devil Week award id'
  )
  dwAwardId = (award as { id: string }).id

  await checked(
    supabase.from('routes').insert({
      id: IDS.route,
      slug: 'inttest-dw-route',
      chapter_id: CHAPTER_ID,
      name: 'IntTest DW Route',
      distance_km: 200,
      collection: null,
    }),
    'seed route'
  )
})

afterEach(async () => {
  // Deleting results cascades their result_awards rows (FK ON DELETE CASCADE).
  await supabase.from('results').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('events').delete().eq('route_id', IDS.route)
})

afterAll(async () => {
  await supabase.from('results').delete().in('rider_id', ALL_RIDER_IDS)
  await supabase.from('events').delete().eq('route_id', IDS.route)
  await supabase.from('riders').delete().in('id', ALL_RIDER_IDS)
  await supabase.from('routes').delete().eq('id', IDS.route)
})

async function seedRider(id: string, slug: string): Promise<void> {
  await checked(
    supabase
      .from('riders')
      .upsert({ id, slug, first_name: 'IntTest', last_name: 'DevilWeek' }, { onConflict: 'id' }),
    `seed rider ${slug}`
  )
}

// One tagged Devil Week event in `season` at `distance`. events.season is a
// GENERATED column from event_date, so we set event_date (not season).
async function seedDevilWeekEvent(season: number, distance: number): Promise<string> {
  eventSeq += 1
  const eventId = `00000000-0000-4000-a000-0000000e1${String(eventSeq).padStart(3, '0')}`
  await checked(
    supabase.from('events').insert({
      id: eventId,
      slug: `inttest-dw-${eventSeq}`,
      name: `IntTest Devil Week ${eventSeq}`,
      chapter_id: CHAPTER_ID,
      route_id: IDS.route,
      event_type: 'brevet',
      distance_km: distance,
      event_date: `${season}-06-15`,
      status: 'completed',
      collection: 'devil-week',
    }),
    `seed dw event ${eventSeq}`
  )
  return eventId
}

// The full four-event series for a season; returns event ids in 200/300/400/600 order.
async function seedDevilWeekSeason(
  season: number,
  distances: number[] = [200, 300, 400, 600]
): Promise<string[]> {
  const ids: string[] = []
  for (const d of distances) ids.push(await seedDevilWeekEvent(season, d))
  return ids
}

// A result for (rider, event). Pass finishTime: null to test the finish_time rule.
async function seedResult(
  riderId: string,
  eventId: string,
  distance: number,
  season: number,
  opts: { status?: string; finishTime?: string | null } = {}
): Promise<string> {
  const status = opts.status ?? 'finished'
  const finishTime = opts.finishTime !== undefined ? opts.finishTime : '13:30:00'
  resultSeq += 1
  const resultId = `00000000-0000-4000-a000-0000000e2${String(resultSeq).padStart(3, '0')}`
  await checked(
    supabase.from('results').insert({
      id: resultId,
      event_id: eventId,
      rider_id: riderId,
      status,
      finish_time: finishTime,
      season,
      distance_km: distance,
    }),
    `seed result ${resultSeq}`
  )
  return resultId
}

// Count of completed-devil-week award rows on this rider's results in `season`.
async function devilWeekCount(riderId: string, season: number): Promise<number> {
  const { data, error } = await supabase
    .from('result_awards')
    .select('result_id, results!inner(rider_id, season)')
    .eq('award_id', dwAwardId)
    .eq('results.rider_id', riderId)
    .eq('results.season', season)
  if (error) throw new Error(`devilWeekCount: ${error.message}`)
  return (data ?? []).length
}

describe('Completed Devil Week auto-assignment trigger', () => {
  it('tags all four results when the full series is finished (current season)', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const [e200, e300, e400, e600] = await seedDevilWeekSeason(CURRENT_SEASON)
    await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
    await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
    await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
    await seedResult(IDS.rider, e600, 600, CURRENT_SEASON)
    expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(4)
  })

  it('does not award for a prior (closed) season', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const [e200, e300, e400, e600] = await seedDevilWeekSeason(PRIOR_SEASON)
    await seedResult(IDS.rider, e200, 200, PRIOR_SEASON)
    await seedResult(IDS.rider, e300, 300, PRIOR_SEASON)
    await seedResult(IDS.rider, e400, 400, PRIOR_SEASON)
    await seedResult(IDS.rider, e600, 600, PRIOR_SEASON)
    expect(await devilWeekCount(IDS.rider, PRIOR_SEASON)).toBe(0)
  })

  it('does not award when only three of four are finished', async () => {
    await seedRider(IDS.rider, SLUGS.rider)
    const [e200, e300, e400, e600] = await seedDevilWeekSeason(CURRENT_SEASON)
    await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
    await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
    await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
    await seedResult(IDS.rider, e600, 600, CURRENT_SEASON, { status: 'dnf' })
    expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(0)
  })
})
```

- [ ] **Step 4: Run the tests and confirm they FAIL for the right reason**

Run: `npm run test:integration-real -- devil-week-trigger`
Expected: FAIL. Without the trigger, no `completed-devil-week` rows are created, so the full-series test expects 4 and gets 0.

- [ ] **Step 5: Apply the migration to the local DB**

Run: `npx supabase migration up`
Expected: applies the new migration with no errors. If it errors on history/drift, STOP and ASK before considering `db reset`.

- [ ] **Step 6: Run the tests and confirm they PASS**

Run: `npm run test:integration-real -- devil-week-trigger`
Expected: PASS (3 tests).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/*_auto_assign_devil_week.sql tests/integration-real/devil-week-trigger.test.ts
git commit -m "feat: auto-assign Completed Devil Week via trigger (current season)"
```

---

### Task 2: Edge-case coverage

Adds the remaining behavioral tests against the Task 1 migration: the finish_time requirement, removal on DNF/delete, the `>= 4` guard, and untagged-event exclusion. The migration is already complete; if a test fails, fix the migration SQL (re-apply with `npx supabase migration up`, or ASK before `db reset` if an already-applied migration was edited).

**Files:**

- Modify: `tests/integration-real/devil-week-trigger.test.ts` (add tests inside the existing `describe`)

**Interfaces:**

- Consumes from Task 1: `supabase`, `IDS`, `SLUGS`, `CURRENT_SEASON`, `seedRider`, `seedDevilWeekEvent`, `seedDevilWeekSeason`, `seedResult`, `devilWeekCount`, `checked`.

- [ ] **Step 1: Add the edge-case tests**

Append these tests inside the `describe('Completed Devil Week auto-assignment trigger', ...)` block:

```typescript
it('does not award when a finished ride has no finish_time', async () => {
  await seedRider(IDS.rider, SLUGS.rider)
  const [e200, e300, e400, e600] = await seedDevilWeekSeason(CURRENT_SEASON)
  await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
  await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
  await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
  await seedResult(IDS.rider, e600, 600, CURRENT_SEASON, { finishTime: null })
  expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(0)
})

it('removes the award when a qualifying result flips to dnf', async () => {
  await seedRider(IDS.rider, SLUGS.rider)
  const [e200, e300, e400, e600] = await seedDevilWeekSeason(CURRENT_SEASON)
  await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
  await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
  await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
  const last = await seedResult(IDS.rider, e600, 600, CURRENT_SEASON)
  expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(4)

  await checked(
    supabase.from('results').update({ status: 'dnf' }).eq('id', last),
    'flip 600 to dnf'
  )
  expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(0)
})

it('removes the award when a qualifying result is deleted', async () => {
  await seedRider(IDS.rider, SLUGS.rider)
  const [e200, e300, e400, e600] = await seedDevilWeekSeason(CURRENT_SEASON)
  await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
  await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
  await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
  const last = await seedResult(IDS.rider, e600, 600, CURRENT_SEASON)
  expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(4)

  await checked(supabase.from('results').delete().eq('id', last), 'delete 600')
  expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(0)
})

it('does not award when the season has fewer than four tagged events', async () => {
  await seedRider(IDS.rider, SLUGS.rider)
  const [e200, e300, e400] = await seedDevilWeekSeason(CURRENT_SEASON, [200, 300, 400])
  await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
  await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
  await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)
  expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(0)
})

it('ignores a finished brevet that is not tagged devil-week', async () => {
  await seedRider(IDS.rider, SLUGS.rider)
  // Only three tagged events; the fourth finished brevet is untagged, so the
  // series is incomplete and must not earn the award.
  const [e200, e300, e400] = await seedDevilWeekSeason(CURRENT_SEASON, [200, 300, 400])
  await seedResult(IDS.rider, e200, 200, CURRENT_SEASON)
  await seedResult(IDS.rider, e300, 300, CURRENT_SEASON)
  await seedResult(IDS.rider, e400, 400, CURRENT_SEASON)

  const untaggedId = '00000000-0000-4000-a000-0000000e1900'
  await checked(
    supabase.from('events').insert({
      id: untaggedId,
      slug: 'inttest-dw-untagged',
      name: 'IntTest Untagged 600',
      chapter_id: CHAPTER_ID,
      route_id: IDS.route,
      event_type: 'brevet',
      distance_km: 600,
      event_date: `${CURRENT_SEASON}-06-15`,
      status: 'completed',
      collection: null,
    }),
    'seed untagged event'
  )
  await seedResult(IDS.rider, untaggedId, 600, CURRENT_SEASON)

  expect(await devilWeekCount(IDS.rider, CURRENT_SEASON)).toBe(0)
})
```

- [ ] **Step 2: Run the new tests**

Run: `npm run test:integration-real -- devil-week-trigger`
Expected: PASS (all 8 tests). If any fail, fix the migration SQL, re-apply (`npx supabase migration up`; ASK before `db reset` if the file was already applied), and re-run.

- [ ] **Step 3: Run the full integration-real suite twice (idempotency)**

Run: `npm run test:integration-real` (twice)
Expected: PASS both runs — confirms cleanup is order-independent.

- [ ] **Step 4: Commit**

```bash
git add tests/integration-real/devil-week-trigger.test.ts
git commit -m "test: cover Devil Week finish_time rule, removal, >=4 guard, untagged exclusion"
```

---

### Task 3: Historical validation script

A read-only script that confirms the earning logic reproduces the known-correct historical Devil Week awards. For each (rider, season) it compares **computed** (finished, with `finish_time`, all `>= 4` tagged events) vs **recorded** (has any `completed-devil-week` row that season), across ALL seasons, and reports mismatches.

**Files:**

- Create: `scripts/validate-devil-week-awards.ts`

**Interfaces:**

- Consumes: `./load-env`, `@supabase/supabase-js`.
- Produces: a CLI run via `npx tsx scripts/validate-devil-week-awards.ts [--env-file=...]`. Read-only (no writes).

- [ ] **Step 1: Write the script**

Write `scripts/validate-devil-week-awards.ts`:

```typescript
// Read-only validation of the Completed Devil Week earning logic against all
// seasons. computed = rider finished (with finish_time) every one of the
// season's >= 4 tagged 'devil-week' events. recorded = rider has a
// completed-devil-week award row on a result that season. Reports mismatches:
//   MISSING : computed && !recorded
//   EXTRA   : recorded && !computed (award without a complete qualifying series)
//
// Usage:
//   npx tsx scripts/validate-devil-week-awards.ts
//   npx tsx scripts/validate-devil-week-awards.ts --env-file=.env.production.local
import './load-env'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import type { WebSocketLikeConstructor } from '@supabase/realtime-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  // Node 20 has no global WebSocket; realtime-js requires one even REST-only.
  realtime: { transport: ws as unknown as WebSocketLikeConstructor },
})

async function page<T>(
  build: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const pageSize = 1000
  let from = 0
  const rows: T[] = []
  for (;;) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function fetchDwAwardId(): Promise<string> {
  const { data, error } = await supabase
    .from('awards')
    .select('id')
    .eq('slug', 'completed-devil-week')
    .single()
  if (error) throw new Error(`load award: ${error.message}`)
  return (data as { id: string }).id
}

async function main() {
  const awardId = await fetchDwAwardId()

  // Tagged events per season -> n_events.
  const events = await page<{ season: number }>((f, t) =>
    supabase.from('events').select('season').eq('collection', 'devil-week').range(f, t)
  )
  const nEvents = new Map<number, number>()
  for (const e of events) nEvents.set(e.season, (nEvents.get(e.season) ?? 0) + 1)

  // Rider qualifying results on tagged events -> n_done per (rider, season).
  const done = await page<{ rider_id: string; season: number }>((f, t) =>
    supabase
      .from('results')
      .select('rider_id, season, events!inner(collection)')
      .eq('status', 'finished')
      .not('finish_time', 'is', null)
      .eq('events.collection', 'devil-week')
      .range(f, t)
  )
  const nDone = new Map<string, number>()
  for (const r of done) {
    const k = `${r.rider_id}:${r.season}`
    nDone.set(k, (nDone.get(k) ?? 0) + 1)
  }

  // Recorded awards -> set of (rider, season).
  const awarded = await page<{ results: { rider_id: string; season: number } }>((f, t) =>
    supabase
      .from('result_awards')
      .select('results!inner(rider_id, season)')
      .eq('award_id', awardId)
      .range(f, t)
  )
  const recorded = new Set<string>()
  for (const a of awarded) recorded.add(`${a.results.rider_id}:${a.results.season}`)

  // computed set: every (rider, season) with n_done == n_events and n_events >= 4.
  const computed = new Set<string>()
  for (const [k, d] of nDone) {
    const season = Number(k.split(':')[1])
    const ne = nEvents.get(season) ?? 0
    if (ne >= 4 && d === ne) computed.add(k)
  }

  const keys = new Set<string>([...computed, ...recorded])
  let missing = 0
  let extra = 0
  let matches = 0
  for (const k of [...keys].sort()) {
    const c = computed.has(k)
    const r = recorded.has(k)
    if (c && r) matches += 1
    else if (c && !r) {
      missing += 1
      console.log(`MISSING ${k}  (completed series, no award)`)
    } else {
      extra += 1
      console.log(`EXTRA   ${k}  (award without complete series)`)
    }
  }

  console.log('\n--- summary ---')
  console.log(`matches: ${matches}`)
  console.log(`MISSING: ${missing} (completed but unawarded)`)
  console.log(`EXTRA:   ${extra} (awarded but not computed-complete)`)
  if (missing > 0 || extra > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Run against the local DB**

Run: `npx tsx scripts/validate-devil-week-awards.ts`
Expected: runs without error and prints a summary (local data may be sparse — fine).

- [ ] **Step 3: Run against production and report**

Run: `npx tsx scripts/validate-devil-week-awards.ts --env-file=.env.production.local`
Expected: prints matches/MISSING/EXTRA. **Report the summary and any MISSING/EXTRA lines to the user.** The user expects this clean; any mismatch means the logic disagrees with the known-correct history — pause and surface it before trusting the trigger. (Script is read-only; safe against prod.)

- [ ] **Step 4: Commit**

```bash
git add scripts/validate-devil-week-awards.ts
git commit -m "chore: add read-only Devil Week validation script"
```

---

### Task 4: Documentation

**Files:**

- Modify: `docs/awards.md` (add a "Completed Devil Week" subsection under "Automatically Assigned Awards")

- [ ] **Step 1: Add the Completed Devil Week subsection to `docs/awards.md`**

Under "## Automatically Assigned Awards", after the existing "### First Brevet" subsection, add (replace `<timestamp>` with the actual migration filename from Task 1):

```markdown
### Completed Devil Week

Completed Devil Week is assigned automatically by a database trigger for the
**current season only**. Closed seasons are frozen and hand-curated.

**Rule.** The four (or more) events of a season's Devil Week are tagged
`events.collection = 'devil-week'`. A rider earns the award for a season when
that season has **at least four** tagged events and the rider has a
`status='finished'` result **with a `finish_time`** for **every** one of them. A
finished result with no recorded time does not count.

**Mechanics.** `trg_results_devil_week` (in
`supabase/migrations/<timestamp>_auto_assign_devil_week.sql`) fires on every
INSERT, DELETE, and status/finish_time/event_id/rider_id/season UPDATE on
`results`. It calls `reconcile_devil_week_for_rider_season(rider_id, season)`,
which no-ops unless `season` is the live calendar year, then either tags **each**
of the rider's results on that season's tagged events with a
`completed-devil-week` row (when the series is complete) or removes them (when it
is not). The award is result-scoped, so the series shows on all of its rides.

**Tagging new seasons.** Each season, set `events.collection = 'devil-week'` on
that year's Devil Week events; the trigger handles the rest as results arrive.

**Status changes / deletions.** Flipping a qualifying result to `dnf`, clearing
its `finish_time`, or deleting it re-runs the reconciler and removes the
now-unearned award from the whole series.

**Known limitation.** The trigger fires on `results` changes only; editing an
event's `collection` or date does not re-reconcile results pointing at it
(matches First Brevet).
```

- [ ] **Step 2: Verify the cited names**

Read the migration from Task 1 and confirm `trg_results_devil_week`, `reconcile_devil_week_for_rider_season`, and the filename match what you wrote. (Docs-only change — no typecheck/lint/test required per the docs fast-path.)

- [ ] **Step 3: Commit**

```bash
git add docs/awards.md
git commit -m "docs: document automatic Completed Devil Week assignment"
```

---

## Self-Review

**Spec coverage:**

- Series identity via `collection='devil-week'` → Task 1 SQL + test fixtures. ✓
- Qualifying result (finished + finish_time) → Task 1 SQL + Task 2 finish_time test. ✓
- Earning rule (≥4 tagged + all finished) → Task 1 SQL + Task 2 `>=4` guard test. ✓
- Tag all results when earned / remove when not → Task 1 INSERT/DELETE + Task 2 DNF/delete tests. ✓
- Current-season-only gate, no backfill → Task 1 SQL + prior-season test. ✓
- Result-scoped, PK idempotency, no auto_assigned → Task 1 (`ON CONFLICT DO NOTHING`). ✓
- Validation (computed vs recorded, read-only) → Task 3. ✓
- Trigger fires on the right events incl. finish_time + DELETE → Task 1 trigger. ✓
- Docs → Task 4. ✓
- Out of scope (prod→dev sync, backfill, collection UI, SR, event-edit re-reconcile) → omitted. ✓

**Placeholder scan:** No TBD/TODO; all SQL, test, and script code is complete. The only deferred literal is the migration timestamp (generated in Task 1 Step 1, referenced by glob in commits and filled into docs in Task 4).

**Type consistency:** Helper names (`seedRider`, `seedDevilWeekEvent`, `seedDevilWeekSeason`, `seedResult`, `devilWeekCount`), ids (`IDS`, `SLUGS`), and the SQL names (`reconcile_devil_week_for_rider_season`, `trg_results_devil_week`) are used identically across Tasks 1, 2, and 4.

# Auto-assign the Completed Devil Week award

**Status:** Approved
**Date:** 2026-06-25
**Author:** Mark + Claude

## Goal

Automatically assign the result-scoped **Completed Devil Week** award when a
rider finishes the full Devil Week series in a season, so admins no longer
assign it by hand. Model the mechanism on the existing **First Brevet**
auto-assignment (`supabase/migrations/20260526120000_auto_assign_first_brevet.sql`):
a `SECURITY DEFINER` reconcile function dispatched by an `AFTER` trigger on
`results`. Borrow the **current-season-only gate** from the (parked) SR work so
closed seasons are never touched.

This spec covers Completed Devil Week only.

## Domain definition

### The award

- Slug `completed-devil-week`, `award_type = 'result'`, stored in
  `result_awards` (PK `(result_id, award_id)`, so duplicate inserts on a result
  are naturally prevented). Completing the series tags **each** of the series'
  results with one `completed-devil-week` row.
- The records view counts it via `get_rider_devil_week_counts` (counts distinct
  award years per rider) — unchanged by this work, since it just counts existing
  rows.

### Identifying the series

Devil Week events are tagged `events.collection = 'devil-week'` (the column
already exists, added in `20260107164627`; `granite-anvil` is the only other
collection). The four events of a season's Devil Week share that tag and that
`season`. The events are already tagged on prod and dev. There is at most one
Devil Week per calendar year.

### Qualifying result and the earning rule

A result counts toward Devil Week only when **both**:

- `results.status = 'finished'`, and
- `results.finish_time IS NOT NULL`.

(The `finish_time` requirement is stricter than First Brevet / SR — a `finished`
result with no recorded time does **not** count.)

A rider earns Completed Devil Week for season `S` iff:

- season `S` has **at least 4** events tagged `collection = 'devil-week'`, and
- the rider has a qualifying result (above) for **every** one of those tagged
  events.

The `>= 4` floor guards against a partially-tagged season awarding prematurely.

When earned, **every** one of the rider's results on that season's tagged events
gets a `completed-devil-week` row. When not earned, those rows are removed.

## Scope: current season only

The reconcile function acts **only on the live calendar-year season**: it
returns immediately unless `p_season = EXTRACT(YEAR FROM CURRENT_DATE)::int`.

- **History is never touched.** Every closed season is frozen; the trigger
  no-ops for it. This matches the requirement that the (correct) historical
  Devil Week awards be left exactly as they are. **No backfill.**
- **Each season freezes when it closes.** While a season is current, awards
  track results continuously; once the year rolls over the season is frozen and
  hand-curated.

Rationale for current-season-only (rather than First Brevet's all-season
reconcile): an all-season trigger would re-reconcile whatever season a result
change touches, so editing an old result whose underlying results are even
slightly incomplete in the DB could silently delete a _correct_ historical
award. The gate makes that impossible. (Devil Week has no legitimate off-club
path — the four events are specific club events — so a current-season rider who
is missing a ride genuinely did not complete the series, and the trigger is
authoritative for that season.)

**Inherent tradeoff:** a result entered for a season _after_ it has rolled over
will not auto-assign; an admin handles that by hand (rare).

## Coexistence with manual awards

No `auto_assigned` marker is needed (unlike SR). For the current season the
trigger fully owns the award (computed from results), exactly like First Brevet
owns its award. Closed-season rows are frozen by the gate, so existing manual
historical awards are untouched. The `result_awards` PK prevents duplicate rows
on a result, so the reconciler's inserts are idempotent.

## Mechanism

### Migration objects

1. `reconcile_devil_week_for_rider_season(p_rider_id uuid, p_season int)` —
   `SECURITY DEFINER`, `search_path = public`, idempotent:
   - return if `p_rider_id IS NULL` or
     `p_season <> EXTRACT(YEAR FROM CURRENT_DATE)::int` (current season only).
   - look up the award id by `slug = 'completed-devil-week'`; return if absent.
   - collect the season's tagged event ids:
     ```sql
     SELECT id FROM events
     WHERE collection = 'devil-week' AND season = p_season;
     ```
     Let `n_events` = their count.
   - collect the rider's result ids on those events (any status):
     `r.rider_id = p_rider_id AND r.event_id IN (<tagged events>)`.
   - count the rider's **qualifying** results among them
     (`status = 'finished' AND finish_time IS NOT NULL`) = `n_done`.
   - **earned** iff `n_events >= 4 AND n_done = n_events`.
   - if earned: `INSERT INTO result_awards (result_id, award_id)` one row per the
     rider's result on those events, `ON CONFLICT DO NOTHING`.
   - if not earned: `DELETE FROM result_awards` for that award on the rider's
     results on those events.

2. `trg_results_reconcile_devil_week()` trigger function:
   - `DELETE` → reconcile `(OLD.rider_id, OLD.season)`.
   - `INSERT`/`UPDATE` → reconcile `(NEW.rider_id, NEW.season)`; on `UPDATE`, if
     rider or season changed, also reconcile the OLD pair.

3. Trigger:
   ```sql
   CREATE TRIGGER trg_results_devil_week
   AFTER INSERT OR UPDATE OF status, finish_time, event_id, rider_id, season OR DELETE
   ON results FOR EACH ROW
   EXECUTE FUNCTION trg_results_reconcile_devil_week();
   ```

No duplicate-guard trigger is needed (the PK handles per-result uniqueness; the
award legitimately spans four distinct results, and multiple seasons produce
distinct result rows). No backfill block.

### Known limitation (inherited from First Brevet)

The trigger fires on `results` changes only. Editing an **event** (e.g. setting
or clearing its `collection`, or moving its date/season) does not re-reconcile
results pointing at it. Acceptable; matches First Brevet. In practice events are
tagged once, before results arrive.

## Validation

**No historical validation (decided 2026-06-25).** Unlike SR, only the **current
(2026)** Devil Week events are `collection='devil-week'`-tagged; historical Devil
Weeks were identified by name (`ILIKE '%devil%week%'`) and are not tagged. With
no historical tags there is nothing to compute historical completion from, so a
historical computed-vs-recorded check (like SR's) cannot run and is skipped. The
existing historical awards are assumed correct and stay frozen by the
current-season gate.

Confidence comes instead from the real-DB integration tests (below). Because the
trigger only ever writes the current season, its first real-world effect is
visible directly in prod after deploy — the 2026 series — which can be spot-checked
there. If broader assurance is ever wanted, tagging the historical Devil Week
events (`collection='devil-week'`) would re-enable an SR-style validation pass as
a follow-up.

## Testing

Trigger + behavior changes require the **real-DB** suite
(`npm run test:integration-real`). New tests seed synthetic riders, a route, and
four `collection='devil-week'` brevet events in the **current** calendar season,
plus results, and assert `completed-devil-week` rows:

- all four finished with `finish_time` → all four results tagged;
- only three of four finished → no rows;
- all four `finished` but one has `finish_time IS NULL` → no rows (the
  finish_time requirement);
- a fourth result flipping to `dnf`, or being deleted, removes the rows from all
  four;
- a season with only 3 tagged events, all finished → no rows (the `>= 4` guard);
- the same full series in the **prior** calendar year → no rows (current-season
  gate);
- a finished, timed brevet **not** tagged `devil-week` neither earns nor blocks
  the award;
- idempotency (suite passes twice; cleanup by every shared key).

Tests derive "current"/"prior" season from the run date
(`new Date().getFullYear()`), never a hardcoded year.

## Docs

- `docs/awards.md`: add a "Completed Devil Week" subsection under "Automatically
  Assigned Awards", documenting the `collection='devil-week'` identifier, the
  finished + `finish_time` requirement, the `>= 4` rule, current-season-only,
  result-scoped tagging of all four, and the tagging convention for new seasons.

## Out of scope

- prod→dev data sync (a separate, sanitized dev-convenience task; deferred).
- Backfilling / recomputing historical Devil Week data (history is correct and
  frozen).
- Admin UI for setting `events.collection` (events are tagged already; future
  seasons tagged the same way).
- The parked SR work (`feat/auto-sr-award`) — independent branch.
- Re-reconciling on event edits (matches First Brevet's existing limitation).

# Auto-assign the Super Randonneur award

**Status:** Approved
**Date:** 2026-06-22
**Author:** Mark + Claude

## Goal

Automatically grant the Super Randonneur (SR) award to riders who complete a
qualifying brevet series within a season, so admins no longer have to compute
and assign it by hand. Model the mechanism on the existing **First Brevet**
auto-assignment (`supabase/migrations/20260526120000_auto_assign_first_brevet.sql`):
a `SECURITY DEFINER` reconcile function dispatched by an `AFTER` trigger on
`results`.

This spec covers SR only. Devil Week is a separate follow-up.

## Domain definition

### Qualifying ride

A result counts toward SR when **all** of:

- `results.status = 'finished'`
- `events.event_type = 'brevet'` (permanents, flèches, populaires never count)
- `results.distance_km` is exactly one of 200, 300, 400, 600
- it falls in the target season (`results.season`, a calendar year)

`results.distance_km` is the canonical distance field (it is also what the
records/devil-week functions bucket on). `results.season` is the calendar year
(`EXTRACT(YEAR FROM event_date)`).

### No substitution: the exact set

SR requires the **exact set** 200 + 300 + 400 + 600 within one season. A longer
ride never substitutes for a shorter one, in either direction of the earlier
confusion: `200, 300, 600, 600` does not qualify (the second 600 does not fill
the 400 slot), and neither does `200, 300, 400, 1000` (the 1000 does not fill the
600 slot). Rides at any other distance — 1000, 1200, 1300 — contribute nothing.

SR is earned an **unlimited** number of times per season. Since each of the four
slots can only be filled by a ride at its own distance, the number of complete
sets is simply the count of the scarcest of the four distances. With `nX` = count
of qualifying rides at exactly X km:

```
SR_count = LEAST( n200, n300, n400, n600 )
```

Worked examples:

| Rides                      | n200 | n300 | n400 | n600 | SR_count           |
| -------------------------- | ---- | ---- | ---- | ---- | ------------------ |
| 200, 300, 400, 600         | 1    | 1    | 1    | 1    | `min(1,1,1,1)=1`   |
| 200, 400, 400, 600         | 1    | 0    | 2    | 1    | `min(1,0,2,1)=0`   |
| 200, 300, 600, 1000        | 1    | 1    | 0    | 1    | `min(1,1,0,1)=0`   |
| 200, 300, 400, 600 + 1000  | 1    | 1    | 1    | 1    | `min(1,1,1,1)=1`   |
| 2× each 200/300/400/600    | 2    | 2    | 2    | 2    | `min(2,2,2,2)=2`   |
| 3×200, 2×300, 2×400, 1×600 | 3    | 2    | 2    | 1    | `min(3,2,2,1)=1`   |

**History.** An earlier version of this spec allowed a longer ride to substitute
for a shorter slot, giving `LEAST(n600, ⌊n400/2⌋, ⌊n300/3⌋, ⌊n200/4⌋)`. That was
wrong — the club rule requires the full set — and it was corrected on 2026-08-20.

## Scope: current season only

The reconcile function acts **only on the live calendar-year season**: it
returns immediately unless `p_season = EXTRACT(YEAR FROM CURRENT_DATE)::int`.
This gives two properties:

- **History is never touched.** Every closed season (2025 and earlier, and any
  season once it rolls over) is assumed correct and frozen — the trigger no-ops
  for it.
- **Each season freezes when it closes.** While a season is current, auto rows
  track results continuously; once the year rolls over the season becomes
  hand-curated like the historical data.

The gate is DB-native (`CURRENT_DATE`) rather than the `NEXT_PUBLIC_CURRENT_SEASON`
env var, because a trigger has no app caller to pass the env value in, and there
is no DB-side current-season source. "Current" therefore means the actual
calendar year. The only divergence from the env var is if ops leaves
`NEXT_PUBLIC_CURRENT_SEASON` lagging the calendar (e.g. still `2026` in Jan
2027); that window is covered by the manual season-close pass below.

**Inherent tradeoff:** a result entered for a season _after_ that season has
rolled over will not auto-assign. Admins handle these in the same end-of-season
manual pass they already do for off-chapter rides (below).

The trigger itself never backfills. Pre-existing historical gaps are corrected
once by a separate script (see "One-time historical backfill" below); closed
seasons are otherwise left exactly as they are.

## Coexistence with manual awards

Manual assignment stays available and is still required for the **out-of-club**
case: a rider whose qualifying ride (often the 600) was ridden at another club,
so the site shows fewer than four qualifying rides yet the rider legitimately
earned SR. In historical data these appear as SR rows with no complete on-site
series; in the current season admins assign them by hand.

To let auto and manual rows coexist without the auto-reconciler ever clobbering
hand-curated data:

- Add `rider_awards.auto_assigned BOOLEAN NOT NULL DEFAULT false`.
  Existing rows become `false` (manual). The `assignSeasonAward` server action
  needs no change — its inserts default to `false`.
- The reconcile function only ever inserts or deletes **auto** rows
  (`auto_assigned = true`) to make the auto-row count for a (rider, season)
  equal `SR_count`.
- Manual rows are never read, counted against the target, or deleted. Auto and
  manual counts are independent and **additive** — a rider can have 1 auto SR
  (full on-site series) plus 1 manual SR (off-chapter series) = 2 total.

No `UNIQUE (rider_id, award_id, season)` constraint — multiple rows per
(rider, season) are legitimate (see memory `sr-awards-multiple-per-season`).
The records-counting RPCs already count rows, so auto rows are picked up with no
change.

**Operational rule (documented):** in the current season, admins should manually
add an SR only for off-chapter series _beyond_ what is auto-computed, to avoid
double-counting. Optional UI enhancement (not required for v1): show the current
auto SR count for the selected rider/season in the admin award form.

## Mechanism

### Migration objects

1. `ALTER TABLE rider_awards ADD COLUMN auto_assigned BOOLEAN NOT NULL DEFAULT false`.

2. `reconcile_super_randonneur_for_rider_season(p_rider_id uuid, p_season int)`
   — `SECURITY DEFINER`, `search_path = public`, idempotent:
   - return if `p_rider_id IS NULL` or
     `p_season <> EXTRACT(YEAR FROM CURRENT_DATE)::int` (current season only).
   - look up SR award id by `slug = 'super-randonneur'`; return if absent.
   - compute `target_k`:
     ```sql
     WITH q AS (
       SELECT r.distance_km AS d
       FROM results r
       JOIN events e ON e.id = r.event_id
       WHERE r.rider_id = p_rider_id
         AND r.season   = p_season
         AND r.status   = 'finished'
         AND e.event_type = 'brevet'
         AND r.distance_km >= 200
     )
     SELECT LEAST(
       COUNT(*) FILTER (WHERE d = 200),
       COUNT(*) FILTER (WHERE d = 300),
       COUNT(*) FILTER (WHERE d = 400),
       COUNT(*) FILTER (WHERE d = 600)
     ) FROM q;
     ```
     (Empty set → `target_k = 0`.)
   - count current auto rows `cur` for (rider, SR award, season,
     `auto_assigned = true`).
   - if `target_k > cur`: insert `target_k - cur` rows
     (`auto_assigned = true`, `note = 'Auto-assigned from on-site results'`)
     via `generate_series`.
   - if `target_k < cur`: delete `cur - target_k` auto rows for that
     (rider, season) by id (`LIMIT` the surplus).

3. `trg_results_reconcile_super_randonneur()` trigger function:
   - `DELETE` → reconcile `(OLD.rider_id, OLD.season)`.
   - `INSERT`/`UPDATE` → reconcile `(NEW.rider_id, NEW.season)`; on `UPDATE`,
     if rider or season changed, also reconcile the OLD pair.

4. Trigger:
   ```sql
   CREATE TRIGGER trg_results_super_randonneur
   AFTER INSERT OR UPDATE OF status, event_id, distance_km, rider_id, season OR DELETE
   ON results FOR EACH ROW
   EXECUTE FUNCTION trg_results_reconcile_super_randonneur();
   ```

No backfill block (current-season only).

### Known limitation (inherited from First Brevet)

The trigger fires on `results` changes only. Editing an **event** (its
`event_type` or `event_date`) does not re-reconcile results that point at it.
This matches First Brevet's existing behavior; out of scope to fix here.

## Validation against historical data

Before trusting the logic for the live season, validate the formula against the
assumed-correct historical (closed-season) data with a committed dev script
`scripts/validate-sr-awards.ts` (uses the existing admin client + `load-env`):

For each (rider, season < current year), compare **recorded** SR count
(`rider_awards` rows) vs **computed** `SR_count`:

- `computed < recorded` is expected for a few riders — the shortfall is
  explained by off-chapter rides not shown on the site (3 such cases).
- `computed > recorded` flags a divergence to investigate.

**Outcome (2026-06, superseded).** The first run — against the old
substitution formula — surfaced 34 `computed > recorded` cases and they were read
as missing awards. That reading depended on the substitution rule, which was
wrong. Under the exact-set rule those 34 cases disappear, and the direction
reverses: closed seasons curated under the substitution understanding now show up
as `computed < recorded` shortfalls, indistinguishable from genuine off-club
rides. No historical write was ever justified.

The script is run manually against prod data; its output is reported back, not
asserted in CI (CI has no historical data).

## Closed seasons stay frozen

There is **no** historical backfill. Closed seasons are hand-curated and remain
as recorded — the trigger is forward-only and touches the live season alone.

`scripts/backfill-sr-2026-correction.ts`, which would have inserted the 34 rows
above, is retired and deleted. In its place,
`scripts/audit-sr-substitution-rows.ts` is **read-only**: it reports (1) any rows
carrying the retired backfill's `note`, which are unambiguously invalid because
each was granted specifically for >600 km substitution, and (2) closed-season SR
rows the site's own results cannot account for — a review signal only, since a
genuine off-club ride looks identical. Acting on either is an admin decision.

## Testing

Trigger + schema changes require the **real-DB** suite
(`npm run test:integration-real`). New tests seed synthetic riders, brevet
events at the relevant distances, and finished results, then assert auto SR
rows:

- formula scenarios from the table above (incl. the near-miss sets that would
  have qualified under substitution, and the scarcest-distance case);
- repeated series → multiple auto SRs (unlimited);
- a result flipping to `dnf` / being deleted reduces the auto count;
- a manual row (`auto_assigned = false`) is never deleted and does not change
  the auto target; auto + manual stack additively;
- results in the **prior** calendar year produce **no** auto rows (current-season
  gate); results in the **current** calendar year do;
- permanent / flèche results at qualifying distances are ignored.

Tests derive "current" and "prior" season from the actual run date
(`EXTRACT(YEAR FROM CURRENT_DATE)` and that minus one), matching the trigger's
gate and satisfying the "no hardcoded dates" rule.

## Docs

- `docs/awards.md`: move SR under "Automatically Assigned Awards", document the
  exact-set rule, the count formula, brevet-only, current-season-only, and
  the off-chapter manual exception.
- `docs/database-schema-plan.md`: update the "Manual award assignment" note to
  reflect that First Brevet and SR are now auto-assigned.

## Out of scope

- Completed Devil Week automation (separate follow-up).
- Any write to closed-season SR data. The trigger stays forward-only and no
  script writes history; the audit script is read-only.
- The optional admin-form "current auto SR count" display.
- Re-reconciling on event edits (matches First Brevet's existing limitation).

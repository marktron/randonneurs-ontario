-- Auto-assign the Ontario Rover award for the current season.
--
-- Ontario Rover is season-scoped (rider_awards) but accumulates across seasons:
-- a rider earns it by finishing 1200 km of permanents, over any period, with at
-- least two of those permanents being 300 km or more. It can be earned an
-- unlimited number of times. The award was created in 2025 and only permanents
-- ridden from the 2025 season onward count toward it; earlier permanents are
-- ignored entirely.
--
-- "Over any period" is implemented as greedy windows, which is how the award
-- was given by hand: walk the rider's finished `permanent` results in date
-- order, accumulating km and the count of 300+ km rides. The moment both
-- thresholds are met the award is earned, dated to the season of the ride that
-- closed the window, and a fresh window starts from the next ride. Nothing
-- carries over between windows, so a rider with 2400 km whose only two 300s
-- fall in the first window holds one Rover, not two.
--
-- Auto-assigned rows are marked auto_assigned = true and reconciled by a trigger
-- on `results`, like Super Randonneur, Ontario Explorer and O-5000. Manual rows
-- (auto_assigned = false) are never touched. Only windows that close in an
-- open season (see is_open_season: the current year, plus the previous year
-- through January 31) are written; windows that closed in earlier seasons are
-- replayed (they determine where the current window starts) but never written,
-- so history stays frozen and hand-curated. The current season's
-- already-submitted results are picked up once by the sibling migration
-- 20260921140100_ontario_rover_current_season_backfill.sql.

-- 1. Reconcile the auto Ontario Rover rows for one rider in every open season.
--    Replays the rider's permanent history from 2025 on, so it must be called
--    on any change to any of their permanent results, including prior-season
--    ones. Idempotent.
CREATE OR REPLACE FUNCTION reconcile_ontario_rover_for_rider(p_rider_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year     INT := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_season   INT;
  v_award_id UUID;
  v_km       INT := 0;
  v_long     INT := 0;
  v_closed_this INT := 0;   -- windows closed in v_year
  v_closed_prev INT := 0;   -- windows closed in v_year - 1
  v_target   INT;
  v_current  INT;
  v_delta    INT;
  rec        RECORD;
BEGIN
  IF p_rider_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_award_id FROM awards WHERE slug = 'ontario-rover';
  IF v_award_id IS NULL THEN
    RETURN;
  END IF;

  -- Greedy replay. Ties on event_date break by results.id for determinism.
  FOR rec IN
    SELECT r.distance_km, r.season
    FROM results r
    JOIN events  e ON e.id = r.event_id
    WHERE r.rider_id   = p_rider_id
      AND r.status     = 'finished'
      AND r.season     >= 2025          -- award created in 2025; earlier rides never count
      AND e.event_type = 'permanent'
    ORDER BY e.event_date, r.id
  LOOP
    v_km := v_km + COALESCE(rec.distance_km, 0);
    IF rec.distance_km >= 300 THEN
      v_long := v_long + 1;
    END IF;

    IF v_km >= 1200 AND v_long >= 2 THEN
      IF rec.season = v_year THEN
        v_closed_this := v_closed_this + 1;
      ELSIF rec.season = v_year - 1 THEN
        v_closed_prev := v_closed_prev + 1;
      END IF;
      v_km   := 0;
      v_long := 0;
    END IF;
  END LOOP;

  -- Reconcile each open season (the previous year only through January 31).
  FOREACH v_season IN ARRAY ARRAY[v_year - 1, v_year] LOOP
    CONTINUE WHEN NOT is_open_season(v_season);
    v_target := CASE WHEN v_season = v_year THEN v_closed_this ELSE v_closed_prev END;

    SELECT COUNT(*) INTO v_current
    FROM rider_awards
    WHERE rider_id      = p_rider_id
      AND award_id      = v_award_id
      AND season        = v_season
      AND auto_assigned = true;

    v_delta := v_target - v_current;

    IF v_delta > 0 THEN
      INSERT INTO rider_awards (rider_id, award_id, season, auto_assigned, note)
      SELECT p_rider_id, v_award_id, v_season, true, 'Auto-assigned from on-site results'
      FROM generate_series(1, v_delta);
    ELSIF v_delta < 0 THEN
      DELETE FROM rider_awards
      WHERE id IN (
        SELECT id FROM rider_awards
        WHERE rider_id      = p_rider_id
          AND award_id      = v_award_id
          AND season        = v_season
          AND auto_assigned = true
        ORDER BY created_at DESC, id DESC
        LIMIT (-v_delta)
      );
    END IF;
  END LOOP;
END;
$$;

-- 2. Trigger dispatcher. Fires for every results row (not just permanents):
--    the reconciler re-reads only permanent results, so a brevet change is a
--    cheap no-op, and filtering by event type here would need a join.
CREATE OR REPLACE FUNCTION trg_results_reconcile_ontario_rover()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM reconcile_ontario_rover_for_rider(OLD.rider_id);
    RETURN OLD;
  END IF;

  PERFORM reconcile_ontario_rover_for_rider(NEW.rider_id);

  -- Cover rider_id changes (manual fixes, merges).
  IF TG_OP = 'UPDATE' AND NEW.rider_id IS DISTINCT FROM OLD.rider_id THEN
    PERFORM reconcile_ontario_rover_for_rider(OLD.rider_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_results_ontario_rover ON results;
CREATE TRIGGER trg_results_ontario_rover
AFTER INSERT OR UPDATE OF status, event_id, distance_km, rider_id, season OR DELETE
ON results
FOR EACH ROW
EXECUTE FUNCTION trg_results_reconcile_ontario_rover();

-- No historical backfill: only windows closing in the current season are
-- auto-managed; history stays as-is. See the sibling current-season reconcile
-- migration.

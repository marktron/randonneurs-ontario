-- Auto-assign the Super Randonneur (SR) award for the current season.
--
-- SR is season-scoped (rider_awards). A rider earns it once per complete set of
-- finished `brevet` results at 200, 300, 400, and 600 km in a season. The set
-- must be exact: a longer ride never substitutes for a shorter one (a 1000 km
-- brevet fills neither the 600 slot nor any other). SR can be earned an
-- unlimited number of times per season. Auto-assigned rows are marked
-- auto_assigned = true and reconciled by a trigger on `results`. Manual rows
-- (auto_assigned = false) are never touched. Only the live calendar season is
-- reconciled; closed seasons and history are frozen and never backfilled. The
-- current season's already-submitted results are picked up once by the sibling
-- migration 20260820120100_super_randonneur_current_season_backfill.sql.

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

  -- Target SR count: how many complete 200/300/400/600 sets this season's
  -- qualifying finished brevets cover, i.e. the count of the scarcest of the
  -- four distances. No substitution, so each distance is matched exactly.
  SELECT COALESCE(LEAST(
           COUNT(*) FILTER (WHERE r.distance_km = 200),
           COUNT(*) FILTER (WHERE r.distance_km = 300),
           COUNT(*) FILTER (WHERE r.distance_km = 400),
           COUNT(*) FILTER (WHERE r.distance_km = 600)
         ), 0)
  INTO v_target
  FROM results r
  JOIN events  e ON e.id = r.event_id
  WHERE r.rider_id   = p_rider_id
    AND r.season     = p_season
    AND r.status     = 'finished'
    AND e.event_type = 'brevet'
    AND r.distance_km IN (200, 300, 400, 600);

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

-- No historical backfill: only the current season is auto-managed; history
-- stays as-is. See the sibling current-season reconcile migration.

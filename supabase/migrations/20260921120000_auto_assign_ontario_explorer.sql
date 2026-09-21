-- Auto-assign the Ontario Explorer award for the current season.
--
-- Ontario Explorer is season-scoped (rider_awards). A rider earns it once per
-- season by finishing at least one `brevet` of 200 km or more in EACH of the
-- four active chapters: Toronto, Huron, Ottawa and Simcoe. Populaires, flèches
-- and permanents never count, and neither do events filed under the inactive
-- Niagara chapter or the catch-all Other / Permanent chapters. The award is
-- earned at most once per season (the site's "can be earned multiple times"
-- refers to separate years).
--
-- Auto-assigned rows are marked auto_assigned = true and reconciled by a trigger
-- on `results`, exactly like Super Randonneur
-- (20260820120000_auto_assign_super_randonneur.sql). Manual rows
-- (auto_assigned = false) are never touched. Only the live calendar season is
-- reconciled; closed seasons are frozen and never backfilled. The current
-- season's already-submitted results are picked up once by the sibling
-- migration 20260921120100_ontario_explorer_current_season_backfill.sql.

-- 1. Reconcile the auto Ontario Explorer row for one rider + season. Idempotent.
CREATE OR REPLACE FUNCTION reconcile_ontario_explorer_for_rider_season(
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
BEGIN
  -- Current calendar season only; everything else is frozen.
  IF p_rider_id IS NULL
     OR p_season IS DISTINCT FROM EXTRACT(YEAR FROM CURRENT_DATE)::int THEN
    RETURN;
  END IF;

  SELECT id INTO v_award_id FROM awards WHERE slug = 'ontario-explorer';
  IF v_award_id IS NULL THEN
    RETURN;
  END IF;

  -- Target: 1 when the rider has a finished 200+ km brevet in all four
  -- chapters this season, else 0. The 200 km floor guards against an event
  -- mistyped as a brevet (see GitHub issue #134).
  SELECT CASE WHEN COUNT(DISTINCT c.slug) = 4 THEN 1 ELSE 0 END
  INTO v_target
  FROM results  r
  JOIN events   e ON e.id = r.event_id
  JOIN chapters c ON c.id = e.chapter_id
  WHERE r.rider_id    = p_rider_id
    AND r.season      = p_season
    AND r.status      = 'finished'
    AND e.event_type  = 'brevet'
    AND r.distance_km >= 200
    AND c.slug IN ('toronto', 'huron', 'ottawa', 'simcoe');

  SELECT COUNT(*) INTO v_current
  FROM rider_awards
  WHERE rider_id      = p_rider_id
    AND award_id      = v_award_id
    AND season        = p_season
    AND auto_assigned = true;

  IF v_target > v_current THEN
    INSERT INTO rider_awards (rider_id, award_id, season, auto_assigned, note)
    VALUES (p_rider_id, v_award_id, p_season, true, 'Auto-assigned from on-site results');
  ELSIF v_target < v_current THEN
    -- Normally 1 -> 0; also collapses any accidental duplicate auto rows.
    DELETE FROM rider_awards
    WHERE id IN (
      SELECT id FROM rider_awards
      WHERE rider_id      = p_rider_id
        AND award_id      = v_award_id
        AND season        = p_season
        AND auto_assigned = true
      ORDER BY created_at DESC, id DESC
      LIMIT (v_current - v_target)
    );
  END IF;
END;
$$;

-- 2. Trigger dispatcher: reconcile affected rider+season on any results change.
CREATE OR REPLACE FUNCTION trg_results_reconcile_ontario_explorer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM reconcile_ontario_explorer_for_rider_season(OLD.rider_id, OLD.season);
    RETURN OLD;
  END IF;

  PERFORM reconcile_ontario_explorer_for_rider_season(NEW.rider_id, NEW.season);

  -- Cover rider_id / season changes (manual fixes, merges, season corrections).
  IF TG_OP = 'UPDATE'
     AND (NEW.rider_id IS DISTINCT FROM OLD.rider_id
          OR NEW.season IS DISTINCT FROM OLD.season) THEN
    PERFORM reconcile_ontario_explorer_for_rider_season(OLD.rider_id, OLD.season);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_results_ontario_explorer ON results;
CREATE TRIGGER trg_results_ontario_explorer
AFTER INSERT OR UPDATE OF status, event_id, distance_km, rider_id, season OR DELETE
ON results
FOR EACH ROW
EXECUTE FUNCTION trg_results_reconcile_ontario_explorer();

-- No historical backfill: only the current season is auto-managed; history
-- stays as-is. See the sibling current-season reconcile migration.

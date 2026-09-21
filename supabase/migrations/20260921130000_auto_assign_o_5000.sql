-- Auto-assign the O-5000 award for the current season.
--
-- O-5000 is season-scoped (rider_awards). A rider earns it once per season by
-- finishing at least 5000 km of sanctioned events ridden in Ontario: brevets,
-- populaires, permanents and flèches all count. Distance is the per-rider
-- results.distance_km (so flèche team distances are handled), summed over the
-- season's finished results.
--
-- "In Ontario" is expressed through the chapter. The `other` chapter holds two
-- kinds of event: the annual club Flèche (ridden in Ontario, counts) and
-- Paris-Brest-Paris (ridden abroad, does not). So a result is excluded only
-- when its event is under `other` AND is not a flèche. Every other chapter,
-- including the inactive Niagara chapter and the Permanent chapter, counts.
--
-- The award is earned at most once per season (the site's "can be earned
-- multiple times" refers to separate years).
--
-- Auto-assigned rows are marked auto_assigned = true and reconciled by a trigger
-- on `results`, exactly like Super Randonneur and Ontario Explorer. Manual rows
-- (auto_assigned = false) are never touched. Only the live calendar season is
-- reconciled; closed seasons are frozen and never backfilled. The current
-- season's already-submitted results are picked up once by the sibling
-- migration 20260921130200_o_5000_current_season_backfill.sql.

-- 1. Shared season-distance helper. The awards page distance column
--    (get_award_recipients_with_distance) is switched to this in
--    20260921130100 so the number shown always matches the qualifying total.
CREATE OR REPLACE FUNCTION ontario_season_distance_km(
  p_rider_id UUID,
  p_season   INT
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(r.distance_km), 0)::BIGINT
  FROM results  r
  JOIN events   e ON e.id = r.event_id
  JOIN chapters c ON c.id = e.chapter_id
  WHERE r.rider_id = p_rider_id
    AND r.season   = p_season
    AND r.status   = 'finished'
    AND NOT (c.slug = 'other' AND e.event_type <> 'fleche');
$$;

-- 2. Reconcile the auto O-5000 row for one rider + season. Idempotent.
CREATE OR REPLACE FUNCTION reconcile_o_5000_for_rider_season(
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

  SELECT id INTO v_award_id FROM awards WHERE slug = 'o-5000';
  IF v_award_id IS NULL THEN
    RETURN;
  END IF;

  v_target := CASE
    WHEN ontario_season_distance_km(p_rider_id, p_season) >= 5000 THEN 1
    ELSE 0
  END;

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

-- 3. Trigger dispatcher: reconcile affected rider+season on any results change.
CREATE OR REPLACE FUNCTION trg_results_reconcile_o_5000()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM reconcile_o_5000_for_rider_season(OLD.rider_id, OLD.season);
    RETURN OLD;
  END IF;

  PERFORM reconcile_o_5000_for_rider_season(NEW.rider_id, NEW.season);

  -- Cover rider_id / season changes (manual fixes, merges, season corrections).
  IF TG_OP = 'UPDATE'
     AND (NEW.rider_id IS DISTINCT FROM OLD.rider_id
          OR NEW.season IS DISTINCT FROM OLD.season) THEN
    PERFORM reconcile_o_5000_for_rider_season(OLD.rider_id, OLD.season);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_results_o_5000 ON results;
CREATE TRIGGER trg_results_o_5000
AFTER INSERT OR UPDATE OF status, event_id, distance_km, rider_id, season OR DELETE
ON results
FOR EACH ROW
EXECUTE FUNCTION trg_results_reconcile_o_5000();

-- No historical backfill: only the current season is auto-managed; history
-- stays as-is. See the sibling current-season reconcile migration.

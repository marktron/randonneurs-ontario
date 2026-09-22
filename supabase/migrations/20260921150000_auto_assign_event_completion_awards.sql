-- Auto-assign the two event-completion awards, Paris-Brest-Paris and Granite
-- Anvil, for the current season.
--
-- Both are result-scoped (result_awards): finishing the event earns the badge on
-- that result. Events are identified by events.collection, not by name:
--   * 'paris-brest-paris' -> Paris-Brest-Paris (any finished result)
--   * 'granite-anvil'     -> Granite Anvil, on the 1200 km (or longer) edition
--                           only. The 1000 km edition shares the tag but has
--                           never earned the award; the 200 km companion ride
--                           is untagged.
-- Granite Anvil events were tagged by 20260107164627_add_granite_anvil_collection.
-- This migration tags the existing PBP events the same way. New editions of
-- either event must be created with the tag, exactly as Devil Week requires.
--
-- Reconciliation is per result and open seasons only (see is_open_season): a finished result on a
-- tagged event gets the row, and a result on a tagged event that is no longer
-- finished loses it. Rows on untagged events (hand-assigned, off-collection)
-- are never touched, so a manual badge survives. Prior seasons are frozen.

-- 1. Tag existing Paris-Brest-Paris events.
UPDATE events
SET collection = 'paris-brest-paris'
WHERE name = 'Paris-Brest-Paris'
  AND event_type = 'brevet'
  AND collection IS NULL;

-- 2. Reconcile the event-completion awards for one result. Idempotent.
CREATE OR REPLACE FUNCTION reconcile_event_completion_awards_for_result(p_result_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status      TEXT;
  v_season      INT;
  v_collection  TEXT;
  v_event_km    INT;
  v_pbp_id      UUID;
  v_ga_id       UUID;
BEGIN
  IF p_result_id IS NULL THEN
    RETURN;
  END IF;

  SELECT r.status, r.season, e.collection, e.distance_km
  INTO v_status, v_season, v_collection, v_event_km
  FROM results r
  JOIN events  e ON e.id = r.event_id
  WHERE r.id = p_result_id;

  -- Deleted result (row cascades away), untagged event, or a closed season.
  IF NOT FOUND
     OR v_collection IS NULL
     OR v_collection NOT IN ('paris-brest-paris', 'granite-anvil')
     OR NOT is_open_season(v_season) THEN
    RETURN;
  END IF;

  SELECT id INTO v_pbp_id FROM awards WHERE slug = 'paris-brest-paris';
  SELECT id INTO v_ga_id  FROM awards WHERE slug = 'granite-anvil';

  IF v_collection = 'paris-brest-paris' AND v_pbp_id IS NOT NULL THEN
    IF v_status = 'finished' THEN
      INSERT INTO result_awards (result_id, award_id)
      VALUES (p_result_id, v_pbp_id)
      ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM result_awards WHERE result_id = p_result_id AND award_id = v_pbp_id;
    END IF;
  END IF;

  IF v_collection = 'granite-anvil' AND v_ga_id IS NOT NULL THEN
    IF v_status = 'finished' AND v_event_km >= 1200 THEN
      INSERT INTO result_awards (result_id, award_id)
      VALUES (p_result_id, v_ga_id)
      ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM result_awards WHERE result_id = p_result_id AND award_id = v_ga_id;
    END IF;
  END IF;
END;
$$;

-- 3. Trigger: reconcile the changed result. DELETE needs nothing since
--    result_awards cascades from results.
CREATE OR REPLACE FUNCTION trg_results_reconcile_event_completion_awards()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM reconcile_event_completion_awards_for_result(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_results_event_completion_awards ON results;
CREATE TRIGGER trg_results_event_completion_awards
AFTER INSERT OR UPDATE OF status, event_id, season
ON results
FOR EACH ROW
EXECUTE FUNCTION trg_results_reconcile_event_completion_awards();

-- 4. Current-season reconcile of already-submitted results. A no-op in a year
--    when neither event ran; covers a mid-season deploy in a year when one did.
--    Safe to re-apply.
DO $$
DECLARE
  r_id UUID;
BEGIN
  FOR r_id IN
    SELECT r.id
    FROM results r
    JOIN events  e ON e.id = r.event_id
    WHERE r.season = EXTRACT(YEAR FROM CURRENT_DATE)::int
      AND e.collection IN ('paris-brest-paris', 'granite-anvil')
  LOOP
    PERFORM reconcile_event_completion_awards_for_result(r_id);
  END LOOP;
END $$;

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

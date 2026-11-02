-- Propagate event distance corrections to results.
--
-- results.distance_km is copied from events.distance_km when a result is
-- created and is what every distance-based award (O-5000, Ontario Rover, the
-- awards-page totals) sums. Until now, correcting an event's distance after
-- results were in left every result at the old figure, silently. Seen on
-- 2026-04-12: Jumbo's 2-Port Romp was corrected from 75 to 80 km after all 15
-- results were submitted; a rider later finished the season at 4997 km with no
-- O-5000 because her result still said 75.
--
-- Rule: when events.distance_km changes, results on that event whose
-- distance_km equals the OLD event distance move to the NEW one. Results with
-- any other value are per-rider overrides (shortened course, etc.) and are left
-- alone. Flèche events are skipped entirely: there the result distance is the
-- team's distance and the event figure is nominal.
--
-- The UPDATE on results fires the existing results-side award reconcilers
-- (O-5000, Ontario Rover, ...) row by row, so awards follow the correction.

CREATE OR REPLACE FUNCTION trg_events_propagate_distance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.distance_km IS NOT DISTINCT FROM OLD.distance_km THEN
    RETURN NEW;
  END IF;
  IF NEW.event_type = 'fleche' THEN
    RETURN NEW;
  END IF;

  UPDATE results
  SET distance_km = NEW.distance_km
  WHERE event_id = NEW.id
    AND distance_km IS NOT DISTINCT FROM OLD.distance_km;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_propagate_distance ON events;
CREATE TRIGGER trg_events_propagate_distance
AFTER UPDATE OF distance_km
ON events
FOR EACH ROW
EXECUTE FUNCTION trg_events_propagate_distance();

-- No backfill: the one known divergence (Jumbo's 2-Port Romp 2026) is repaired
-- by hand in production; see docs/awards.md "Event distance corrections".

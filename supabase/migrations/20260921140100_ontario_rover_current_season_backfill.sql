-- One-time reconcile: apply Ontario Rover to the current season's
-- ALREADY-SUBMITTED results.
--
-- The trigger (20260921140000_auto_assign_ontario_rover.sql) only fires on
-- result INSERT/UPDATE/DELETE, so results entered BEFORE it existed are not yet
-- awarded. A Rover window can only close in the current season on a
-- current-season ride, so reconciling every rider who holds a finished
-- current-season permanent covers everyone who could be owed one.
--
-- Safe to re-apply: reconcile_ontario_rover_for_rider replays the rider's full
-- permanent history and only adds or removes AUTO rows in the current season,
-- so re-running converges on the same state. Manual rows (auto_assigned =
-- false) are never read or touched. Windows that closed in earlier seasons are
-- replayed but never written, so history is untouched.
--
-- Run scripts/preview-ontario-rover.ts against production before deploying to
-- confirm the expected recipients and spot any manual current-season row that
-- would double up with an auto one.
DO $$
DECLARE
  v_season INT := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  r_id     UUID;
BEGIN
  FOR r_id IN
    SELECT DISTINCT res.rider_id
    FROM results res
    JOIN events  e ON e.id = res.event_id
    WHERE res.season   = v_season
      AND res.status   = 'finished'
      AND e.event_type = 'permanent'
  LOOP
    PERFORM reconcile_ontario_rover_for_rider(r_id);
  END LOOP;
END $$;

-- One-time reconcile: apply O-5000 to the current season's ALREADY-SUBMITTED
-- results.
--
-- The trigger (20260921130000_auto_assign_o_5000.sql) only fires on result
-- INSERT/UPDATE/DELETE, so results entered BEFORE it existed are not yet
-- awarded. This reconciles every rider holding a current-season finished
-- result, which assigns the award to those already past 5000 km and is a no-op
-- for everyone else.
--
-- Safe to re-apply: reconcile_o_5000_for_rider_season recomputes the target
-- from live results and only adds or removes AUTO rows, so re-running converges
-- on the same state. Manual rows (auto_assigned = false) are never read or
-- touched. The function is current-season-gated, so closed seasons and history
-- can never be reached from here.
--
-- Run scripts/preview-o-5000.ts against production before deploying to confirm
-- the expected recipients and spot any manual current-season row that would
-- double up with an auto one.
DO $$
DECLARE
  v_season INT := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  r_id     UUID;
BEGIN
  FOR r_id IN
    SELECT DISTINCT res.rider_id
    FROM results res
    WHERE res.season = v_season
      AND res.status = 'finished'
  LOOP
    PERFORM reconcile_o_5000_for_rider_season(r_id, v_season);
  END LOOP;
END $$;

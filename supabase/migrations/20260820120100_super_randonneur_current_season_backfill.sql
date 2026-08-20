-- One-time reconcile: apply Super Randonneur to the current season's
-- ALREADY-SUBMITTED results.
--
-- The trigger (20260820120000_auto_assign_super_randonneur.sql) only fires on
-- result INSERT/UPDATE/DELETE, so results entered BEFORE it existed are not yet
-- awarded. Deploying mid-season would otherwise leave riders who already
-- completed a 200/300/400/600 series waiting for an unrelated edit to touch one
-- of their results. This reconciles every rider holding a current-season brevet
-- result at an SR distance, which assigns the award to those who completed the
-- series and is a no-op for everyone else.
--
-- Safe to re-apply: reconcile_super_randonneur_for_rider_season recomputes the
-- target from live results and only adds or removes AUTO rows, so re-running
-- converges on the same count. Manual rows (auto_assigned = false) are never
-- read or touched. The function is current-season-gated, so closed seasons and
-- history can never be reached from here.
DO $$
DECLARE
  v_season INT := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  r_id     UUID;
BEGIN
  FOR r_id IN
    SELECT DISTINCT res.rider_id
    FROM results res
    JOIN events  e ON e.id = res.event_id
    WHERE res.season      = v_season
      AND res.status      = 'finished'
      AND e.event_type    = 'brevet'
      AND res.distance_km IN (200, 300, 400, 600)
  LOOP
    PERFORM reconcile_super_randonneur_for_rider_season(r_id, v_season);
  END LOOP;
END $$;

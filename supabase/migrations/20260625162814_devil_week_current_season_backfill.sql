-- One-time backfill: apply Completed Devil Week to the current season's
-- ALREADY-SUBMITTED results.
--
-- The trigger (20260625150136_auto_assign_devil_week.sql) only fires on result
-- INSERT/UPDATE/DELETE, so results entered BEFORE it existed — e.g. the
-- just-finished 2026 Devil Week — are not yet awarded. This reconciles every
-- rider holding a result on a current-season `devil-week` event, which assigns
-- the award to those who completed the series and is a no-op for everyone else.
--
-- Safe to re-apply: reconcile_devil_week_for_rider_season is idempotent
-- (ON CONFLICT DO NOTHING) and current-season-gated, so only the live season is
-- ever touched. On a fresh DB with no current-season `devil-week` events (CI,
-- seed) the loop simply finds no riders and does nothing.
DO $$
DECLARE
  v_season INT := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  r_id     UUID;
BEGIN
  FOR r_id IN
    SELECT DISTINCT res.rider_id
    FROM results res
    JOIN events  e ON e.id = res.event_id
    WHERE e.collection = 'devil-week'
      AND e.season     = v_season
  LOOP
    PERFORM reconcile_devil_week_for_rider_season(r_id, v_season);
  END LOOP;
END $$;

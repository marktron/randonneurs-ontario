-- Shared definition of which seasons the award reconcilers may write to.
--
-- Every auto-assigned award is reconciled for the "live" season only; older
-- seasons are frozen and hand-curated. Until now "live" meant the current
-- calendar year, which left a gap at the year rollover: a permanent ridden on
-- December 28 and entered on January 3 belongs to the old season, the trigger
-- saw the new year and did nothing, and nothing ever picked it up.
--
-- is_open_season() closes that gap: the current calendar year is always open,
-- and the previous year stays open through January 31 so late December results
-- still reconcile. It takes the reference date as a parameter so the rule can be
-- unit-tested without moving the clock.
--
-- The reconcilers created on this branch (Ontario Explorer, O-5000, Ontario
-- Rover, event-completion badges) use it directly. The two deployed
-- season-gated reconcilers (Super Randonneur, Completed Devil Week) are
-- re-created below with the same gate; their bodies are otherwise unchanged
-- from 20260820120000 and 20260625150136 respectively.

CREATE OR REPLACE FUNCTION is_open_season(p_season INT, p_today DATE DEFAULT CURRENT_DATE)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_season IS NOT NULL
     AND (
       p_season = EXTRACT(YEAR FROM p_today)::int
       OR (p_season = EXTRACT(YEAR FROM p_today)::int - 1
           AND EXTRACT(MONTH FROM p_today)::int = 1)
     );
$$;

-- Super Randonneur: gate swapped, body otherwise identical to 20260820120000.
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
  IF p_rider_id IS NULL OR NOT is_open_season(p_season) THEN
    RETURN;
  END IF;

  SELECT id INTO v_award_id FROM awards WHERE slug = 'super-randonneur';
  IF v_award_id IS NULL THEN
    RETURN;
  END IF;

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

-- Completed Devil Week: gate swapped, body otherwise identical to 20260625150136.
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
  -- p_season is the trigger row's results.season (a plain user-supplied INT); the
  -- counts/INSERT/DELETE below key on events.season (generated from event_date).
  -- They coincide normally; this gate intentionally uses the result's season.
  IF p_rider_id IS NULL OR NOT is_open_season(p_season) THEN
    RETURN;
  END IF;

  SELECT id INTO v_award_id FROM awards WHERE slug = 'completed-devil-week';
  IF v_award_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_n_events
  FROM events
  WHERE collection = 'devil-week' AND season = p_season;

  SELECT COUNT(*) INTO v_n_done
  FROM results r
  JOIN events  e ON e.id = r.event_id
  WHERE r.rider_id   = p_rider_id
    AND e.collection = 'devil-week'
    AND e.season     = p_season
    AND r.status     = 'finished'
    AND r.finish_time IS NOT NULL;

  IF v_n_events >= 4 AND v_n_done = v_n_events THEN
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

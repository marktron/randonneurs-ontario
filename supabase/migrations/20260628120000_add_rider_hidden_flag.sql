-- Hide specific riders from all public-facing surfaces.
--
-- A "hidden" rider must NEVER have their name or slug appear publicly (riders
-- directory, results, awards, records/leaderboards, registered-rider lists),
-- but must remain fully visible in the admin app and must still be able to see
-- their own upcoming rides on the home page (the My Rides email lookup).
--
-- Security boundary = RLS on the `riders` table. The public site reads riders
-- through the `anon` role: directly via PostgREST, via the security_invoker
-- views `public_riders` / `public_results`, and via PostgREST embeds on
-- `public_registrations`. Restricting the SELECT policy to non-hidden rows
-- therefore suppresses a hidden rider everywhere `anon` can reach -- including
-- the base table and the sitemap -- with NO need to grant `anon` access to the
-- new column (so the flag itself never leaks).
--
-- Admin tooling and the My Rides lookup use the service-role client, which
-- bypasses RLS, so both keep seeing hidden riders.
--
-- The record/award helper functions are SECURITY DEFINER (owned by a BYPASSRLS
-- role), so they do NOT respect the RLS policy. Each one that returns a rider
-- name/slug is patched below with an explicit `AND ... hidden IS NOT TRUE`.
-- Functions that only return nameless aggregates (route popularity, per-event
-- participant counts) are intentionally left unchanged: a hidden rider still
-- contributes to those totals.

-- ============================================================================
-- 1. Column
-- ============================================================================

ALTER TABLE riders ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN riders.hidden IS
  'When true, rider is suppressed from all public-facing name/slug surfaces '
  '(enforced by the riders_select_public RLS policy and the record/award RPCs). '
  'Still visible to admins (service role) and in the rider''s own My Rides view.';

-- ============================================================================
-- 2. RLS: hide rows from anon / authenticated non-admins
-- ============================================================================
-- Admin tooling uses the service role (bypasses RLS); is_admin() keeps any
-- future authenticated-admin reads working.

DROP POLICY IF EXISTS "riders_select_public" ON riders;

CREATE POLICY "riders_select_public" ON riders
  FOR SELECT USING (hidden IS NOT TRUE OR is_admin());

-- ============================================================================
-- 3. Registered-riders list: force-anonymize hidden riders (keep + count them)
-- ============================================================================
-- This RPC is SECURITY DEFINER, so it still sees hidden riders. We keep the row
-- (so the rider stays counted) but null the name and force the share flag off,
-- so lib/data/events.ts renders the rider as "Anonymous".

CREATE OR REPLACE FUNCTION get_registered_riders(p_event_id UUID)
RETURNS TABLE (
  first_name TEXT,
  last_name TEXT,
  share_registration BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN r.hidden THEN NULL ELSE r.first_name END,
    CASE WHEN r.hidden THEN NULL ELSE r.last_name END,
    (reg.share_registration AND NOT r.hidden) AS share_registration
  FROM registrations reg
  JOIN riders r ON reg.rider_id = r.id
  WHERE reg.event_id = p_event_id
    AND reg.status = 'registered'
  ORDER BY reg.registered_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 4. Award recipient functions
-- ============================================================================

CREATE OR REPLACE FUNCTION get_award_recipients(p_award_slug TEXT)
RETURNS TABLE (
  rider_slug TEXT,
  rider_name TEXT,
  award_year INTEGER
) AS $$
BEGIN
  RETURN QUERY
  -- Season-scoped awards (from rider_awards)
  SELECT
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    ra.season AS award_year
  FROM rider_awards ra
  JOIN awards a ON ra.award_id = a.id
  JOIN riders r ON ra.rider_id = r.id
  WHERE a.slug = p_award_slug
    AND a.award_type = 'season'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name, ra.season

  UNION ALL

  -- Result-scoped awards (from result_awards)
  SELECT
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    res.season AS award_year
  FROM result_awards rsa
  JOIN awards a ON rsa.award_id = a.id
  JOIN results res ON rsa.result_id = res.id
  JOIN riders r ON res.rider_id = r.id
  WHERE a.slug = p_award_slug
    AND a.award_type = 'result'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name, res.season

  ORDER BY award_year DESC, rider_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_award_recipients_with_distance(p_award_slug TEXT)
RETURNS TABLE (
  rider_slug TEXT,
  rider_name TEXT,
  award_year INTEGER,
  season_distance BIGINT
) AS $$
BEGIN
  RETURN QUERY
  -- Season-scoped awards (from rider_awards)
  SELECT
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    ra.season AS award_year,
    COALESCE(season_totals.total_km, 0)::BIGINT AS season_distance
  FROM rider_awards ra
  JOIN awards a ON ra.award_id = a.id
  JOIN riders r ON ra.rider_id = r.id
  LEFT JOIN LATERAL (
    SELECT SUM(res.distance_km) AS total_km
    FROM results res
    WHERE res.rider_id = r.id
      AND res.season = ra.season
      AND res.status = 'finished'
  ) season_totals ON TRUE
  WHERE a.slug = p_award_slug
    AND a.award_type = 'season'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name, ra.season, season_totals.total_km

  UNION ALL

  -- Result-scoped awards (from result_awards)
  SELECT
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    res.season AS award_year,
    COALESCE(season_totals.total_km, 0)::BIGINT AS season_distance
  FROM result_awards rsa
  JOIN awards a ON rsa.award_id = a.id
  JOIN results res ON rsa.result_id = res.id
  JOIN riders r ON res.rider_id = r.id
  LEFT JOIN LATERAL (
    SELECT SUM(r2.distance_km) AS total_km
    FROM results r2
    WHERE r2.rider_id = r.id
      AND r2.season = res.season
      AND r2.status = 'finished'
  ) season_totals ON TRUE
  WHERE a.slug = p_award_slug
    AND a.award_type = 'result'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name, res.season, season_totals.total_km

  ORDER BY award_year DESC, rider_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 5. Lifetime record functions
-- ============================================================================

CREATE OR REPLACE FUNCTION get_rider_completion_counts(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    COUNT(*) AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  WHERE res.status = 'finished'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_rider_distance_totals(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY SUM(res.distance_km) DESC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    SUM(res.distance_km)::BIGINT AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  WHERE res.status = 'finished'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY SUM(res.distance_km) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_rider_active_seasons(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT res.season) DESC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    COUNT(DISTINCT res.season) AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  WHERE res.status = 'finished'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(DISTINCT res.season) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_rider_permanent_counts(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    COUNT(*) AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND e.event_type = 'permanent'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  HAVING COUNT(*) > 0
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_rider_devil_week_counts(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY COUNT(DISTINCT EXTRACT(YEAR FROM e.event_date)) DESC, r.last_name ASC, r.first_name ASC
    )::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    COUNT(DISTINCT EXTRACT(YEAR FROM e.event_date)) AS value
  FROM result_awards rsa
  JOIN awards a ON rsa.award_id = a.id
  JOIN results res ON rsa.result_id = res.id
  JOIN events e ON res.event_id = e.id
  JOIN riders r ON res.rider_id = r.id
  WHERE a.slug = 'completed-devil-week'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(DISTINCT EXTRACT(YEAR FROM e.event_date)) DESC, r.last_name ASC, r.first_name ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_rider_award_counts(p_award_slug TEXT, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH award_info AS (
    SELECT id, award_type FROM awards WHERE slug = p_award_slug
  ),
  season_counts AS (
    -- Season-scoped: count award rows from rider_awards
    SELECT
      r.id AS rider_id,
      r.slug,
      r.first_name,
      r.last_name,
      COUNT(*) AS cnt
    FROM rider_awards ra
    JOIN award_info ai ON ra.award_id = ai.id
    JOIN riders r ON ra.rider_id = r.id
    WHERE ai.award_type = 'season'
      AND r.hidden IS NOT TRUE
    GROUP BY r.id, r.slug, r.first_name, r.last_name
  ),
  result_counts AS (
    -- Result-scoped: count award rows from result_awards
    SELECT
      r.id AS rider_id,
      r.slug,
      r.first_name,
      r.last_name,
      COUNT(*) AS cnt
    FROM result_awards rsa
    JOIN award_info ai ON rsa.award_id = ai.id
    JOIN results res ON rsa.result_id = res.id
    JOIN riders r ON res.rider_id = r.id
    WHERE ai.award_type = 'result'
      AND r.hidden IS NOT TRUE
    GROUP BY r.id, r.slug, r.first_name, r.last_name
  ),
  combined AS (
    SELECT * FROM season_counts
    UNION ALL
    SELECT * FROM result_counts
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY cnt DESC, combined.last_name ASC, combined.first_name ASC)::INTEGER AS rank,
    combined.slug AS rider_slug,
    TRIM(CONCAT(combined.first_name, ' ', combined.last_name)) AS rider_name,
    cnt AS value
  FROM combined
  WHERE cnt > 0
  ORDER BY cnt DESC, combined.last_name ASC, combined.first_name ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 6. Streak functions (LANGUAGE sql)
-- ============================================================================

DROP FUNCTION IF EXISTS get_rider_longest_streaks(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_rider_longest_streaks(
  p_current_season INTEGER,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  streak_length INTEGER,
  streak_start_season INTEGER,
  streak_end_season INTEGER
) AS $$
WITH rider_seasons AS (
  SELECT DISTINCT
    r.id AS rider_id,
    r.slug,
    r.first_name,
    r.last_name,
    res.season,
    TRUE AS qualifying
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  WHERE res.status = 'finished'
    AND res.season IS NOT NULL
    AND r.hidden IS NOT TRUE
),
riders_with_seasons AS (
  SELECT DISTINCT rider_id, slug, first_name, last_name FROM rider_seasons
),
riders_qualified_in_2020 AS (
  SELECT rider_id FROM rider_seasons WHERE season = 2020
),
synthetic_2020 AS (
  SELECT
    rw.rider_id,
    rw.slug,
    rw.first_name,
    rw.last_name,
    2020 AS season,
    FALSE AS qualifying
  FROM riders_with_seasons rw
  WHERE rw.rider_id NOT IN (SELECT rider_id FROM riders_qualified_in_2020)
),
all_seasons AS (
  SELECT * FROM rider_seasons
  UNION ALL
  SELECT * FROM synthetic_2020
),
season_groups AS (
  SELECT
    rider_id,
    slug,
    first_name,
    last_name,
    season,
    qualifying,
    season - ROW_NUMBER() OVER (PARTITION BY rider_id ORDER BY season)::INTEGER AS streak_group
  FROM all_seasons
),
streaks AS (
  SELECT
    rider_id,
    slug,
    first_name,
    last_name,
    MIN(season) FILTER (WHERE qualifying) AS streak_start,
    MAX(season) FILTER (WHERE qualifying) AS streak_end,
    COUNT(*) FILTER (WHERE qualifying)::INTEGER AS streak_len
  FROM season_groups
  GROUP BY rider_id, slug, first_name, last_name, streak_group
  HAVING COUNT(*) FILTER (WHERE qualifying) > 0
),
active_streaks AS (
  SELECT *
  FROM streaks
  WHERE streak_end >= p_current_season - 1
),
best_streaks AS (
  SELECT DISTINCT ON (rider_id)
    slug,
    first_name,
    last_name,
    streak_len,
    streak_start,
    streak_end
  FROM active_streaks
  ORDER BY rider_id, streak_len DESC, streak_end DESC
)
SELECT
  ROW_NUMBER() OVER (ORDER BY streak_len DESC, streak_end DESC)::INTEGER AS rank,
  slug AS rider_slug,
  TRIM(CONCAT(first_name, ' ', last_name)) AS rider_name,
  streak_len AS streak_length,
  streak_start AS streak_start_season,
  streak_end AS streak_end_season
FROM best_streaks
ORDER BY streak_len DESC, streak_end DESC
LIMIT limit_count;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

DROP FUNCTION IF EXISTS get_rider_sr_streaks(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_rider_sr_streaks(
  p_current_season INTEGER,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  streak_length INTEGER,
  streak_start_season INTEGER,
  streak_end_season INTEGER
) AS $$
WITH rider_sr_seasons AS (
  SELECT DISTINCT
    r.id AS rider_id,
    r.slug,
    r.first_name,
    r.last_name,
    ra.season,
    TRUE AS qualifying
  FROM rider_awards ra
  JOIN awards a ON ra.award_id = a.id
  JOIN riders r ON ra.rider_id = r.id
  WHERE a.slug = 'super-randonneur'
    AND r.hidden IS NOT TRUE
),
riders_with_sr AS (
  SELECT DISTINCT rider_id, slug, first_name, last_name FROM rider_sr_seasons
),
riders_sr_in_2020 AS (
  SELECT rider_id FROM rider_sr_seasons WHERE season = 2020
),
synthetic_2020 AS (
  SELECT
    rw.rider_id,
    rw.slug,
    rw.first_name,
    rw.last_name,
    2020 AS season,
    FALSE AS qualifying
  FROM riders_with_sr rw
  WHERE rw.rider_id NOT IN (SELECT rider_id FROM riders_sr_in_2020)
),
all_seasons AS (
  SELECT * FROM rider_sr_seasons
  UNION ALL
  SELECT * FROM synthetic_2020
),
season_groups AS (
  SELECT
    rider_id,
    slug,
    first_name,
    last_name,
    season,
    qualifying,
    season - ROW_NUMBER() OVER (PARTITION BY rider_id ORDER BY season)::INTEGER AS streak_group
  FROM all_seasons
),
streaks AS (
  SELECT
    rider_id,
    slug,
    first_name,
    last_name,
    MIN(season) FILTER (WHERE qualifying) AS streak_start,
    MAX(season) FILTER (WHERE qualifying) AS streak_end,
    COUNT(*) FILTER (WHERE qualifying)::INTEGER AS streak_len
  FROM season_groups
  GROUP BY rider_id, slug, first_name, last_name, streak_group
  HAVING COUNT(*) FILTER (WHERE qualifying) > 0
),
best_streaks AS (
  SELECT DISTINCT ON (rider_id)
    slug,
    first_name,
    last_name,
    streak_len,
    streak_start,
    streak_end
  FROM streaks
  ORDER BY rider_id, streak_len DESC, streak_end DESC
)
SELECT
  ROW_NUMBER() OVER (ORDER BY streak_len DESC, streak_end DESC)::INTEGER AS rank,
  slug AS rider_slug,
  TRIM(CONCAT(first_name, ' ', last_name)) AS rider_name,
  streak_len AS streak_length,
  streak_start AS streak_start_season,
  streak_end AS streak_end_season
FROM best_streaks
ORDER BY streak_len DESC, streak_end DESC
LIMIT limit_count;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 7. Season record functions
-- ============================================================================

CREATE OR REPLACE FUNCTION get_best_season_event_counts(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  season INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::INTEGER AS rank,
    res.season AS season,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    COUNT(*) AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  WHERE res.status = 'finished'
    AND res.season IS NOT NULL
    AND r.hidden IS NOT TRUE
  GROUP BY res.season, r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_best_season_distances(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  season INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY SUM(res.distance_km) DESC)::INTEGER AS rank,
    res.season AS season,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    SUM(res.distance_km)::BIGINT AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  WHERE res.status = 'finished'
    AND res.season IS NOT NULL
    AND r.hidden IS NOT TRUE
  GROUP BY res.season, r.id, r.slug, r.first_name, r.last_name
  ORDER BY SUM(res.distance_km) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_current_season_event_counts(p_season INTEGER, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    COUNT(*) AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  WHERE res.status = 'finished'
    AND res.season = p_season
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_current_season_distances(p_season INTEGER, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY SUM(res.distance_km) DESC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    SUM(res.distance_km)::BIGINT AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  WHERE res.status = 'finished'
    AND res.season = p_season
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY SUM(res.distance_km) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 8. PBP & Granite Anvil functions
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pbp_completion_counts(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    COUNT(*) AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND e.name = 'Paris-Brest-Paris'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_pbp_fastest_times(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  finish_time TEXT,
  event_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY res.finish_time ASC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    res.finish_time::TEXT AS finish_time,
    e.event_date AS event_date
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND e.name = 'Paris-Brest-Paris'
    AND res.finish_time IS NOT NULL
    AND r.hidden IS NOT TRUE
  ORDER BY res.finish_time ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_granite_anvil_completion_counts(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    COUNT(*) AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND e.collection = 'granite-anvil'
    AND r.hidden IS NOT TRUE
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_granite_anvil_fastest_times(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  finish_time TEXT,
  event_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY res.finish_time ASC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    res.finish_time::TEXT AS finish_time,
    e.event_date AS event_date
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND e.collection = 'granite-anvil'
    AND res.finish_time IS NOT NULL
    AND r.hidden IS NOT TRUE
  ORDER BY res.finish_time ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Treat 2020 as a bridge year in streak calculations.
-- Due to the reduced 2020 calendar (COVID-19), a rider who didn't qualify in
-- 2020 should not have their streak broken by that single year. 2020 counts
-- toward a streak only if the rider actually qualified that year.
--
-- Implementation: for any rider who has qualifying seasons but no 2020 row,
-- inject a synthetic 2020 row flagged qualifying = FALSE. The gap-and-island
-- grouping then bridges across 2020 naturally, and streak length / end are
-- computed from qualifying rows only. Groups containing only a synthetic
-- 2020 row are dropped.

-- ============================================
-- get_rider_longest_streaks
-- ============================================
CREATE OR REPLACE FUNCTION get_rider_longest_streaks(
  p_current_season INTEGER,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  streak_length INTEGER,
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
    streak_end
  FROM active_streaks
  ORDER BY rider_id, streak_len DESC, streak_end DESC
)
SELECT
  ROW_NUMBER() OVER (ORDER BY streak_len DESC, streak_end DESC)::INTEGER AS rank,
  slug AS rider_slug,
  TRIM(CONCAT(first_name, ' ', last_name)) AS rider_name,
  streak_len AS streak_length,
  streak_end AS streak_end_season
FROM best_streaks
ORDER BY streak_len DESC, streak_end DESC
LIMIT limit_count;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ============================================
-- get_rider_sr_streaks
-- ============================================
CREATE OR REPLACE FUNCTION get_rider_sr_streaks(
  p_current_season INTEGER,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  streak_length INTEGER,
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
    streak_end
  FROM streaks
  ORDER BY rider_id, streak_len DESC, streak_end DESC
)
SELECT
  ROW_NUMBER() OVER (ORDER BY streak_len DESC, streak_end DESC)::INTEGER AS rank,
  slug AS rider_slug,
  TRIM(CONCAT(first_name, ' ', last_name)) AS rider_name,
  streak_len AS streak_length,
  streak_end AS streak_end_season
FROM best_streaks
ORDER BY streak_len DESC, streak_end DESC
LIMIT limit_count;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

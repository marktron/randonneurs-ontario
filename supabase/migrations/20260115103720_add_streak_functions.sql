-- Add streak record functions
-- These functions calculate consecutive season streaks for riders

-- Get longest active streaks (consecutive seasons with at least one finished event)
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
  -- Get distinct seasons per rider where they finished at least one event
  SELECT DISTINCT
    r.id AS rider_id,
    r.slug,
    r.first_name,
    r.last_name,
    res.season
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  WHERE res.status = 'finished'
    AND res.season IS NOT NULL
),
season_groups AS (
  -- Identify streak groups using the gap technique
  -- Consecutive seasons will have the same streak_group value
  SELECT
    rider_id,
    slug,
    first_name,
    last_name,
    season,
    season - ROW_NUMBER() OVER (PARTITION BY rider_id ORDER BY season)::INTEGER AS streak_group
  FROM rider_seasons
),
streaks AS (
  -- Calculate streak lengths and boundaries
  SELECT
    rider_id,
    slug,
    first_name,
    last_name,
    MIN(season) AS streak_start,
    MAX(season) AS streak_end,
    COUNT(*)::INTEGER AS streak_len
  FROM season_groups
  GROUP BY rider_id, slug, first_name, last_name, streak_group
),
best_streaks AS (
  -- Get best streak per rider (prefer ongoing/recent streaks in ties)
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
$$ LANGUAGE sql SECURITY DEFINER;


-- Get longest Super Randonneur streaks (consecutive seasons earning SR award)
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
  -- Get distinct seasons per rider where they earned Super Randonneur
  -- Awards are linked through result_awards → results → riders
  SELECT DISTINCT
    r.id AS rider_id,
    r.slug,
    r.first_name,
    r.last_name,
    res.season
  FROM result_awards ra
  JOIN awards a ON ra.award_id = a.id
  JOIN results res ON ra.result_id = res.id
  JOIN riders r ON res.rider_id = r.id
  WHERE a.slug = 'super-randonneur'
    AND res.season IS NOT NULL
),
season_groups AS (
  -- Identify streak groups using the gap technique
  SELECT
    rider_id,
    slug,
    first_name,
    last_name,
    season,
    season - ROW_NUMBER() OVER (PARTITION BY rider_id ORDER BY season)::INTEGER AS streak_group
  FROM rider_sr_seasons
),
streaks AS (
  -- Calculate streak lengths and boundaries
  SELECT
    rider_id,
    slug,
    first_name,
    last_name,
    MIN(season) AS streak_start,
    MAX(season) AS streak_end,
    COUNT(*)::INTEGER AS streak_len
  FROM season_groups
  GROUP BY rider_id, slug, first_name, last_name, streak_group
),
best_streaks AS (
  -- Get best streak per rider (prefer ongoing/recent streaks in ties)
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
$$ LANGUAGE sql SECURITY DEFINER;

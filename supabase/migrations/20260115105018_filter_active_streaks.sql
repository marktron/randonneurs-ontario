-- Update longest streaks function to only include "active" streaks
-- An active streak must end in the current season or the previous season

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
active_streaks AS (
  -- Only include streaks that are still "active" (ended in current or previous season)
  SELECT *
  FROM streaks
  WHERE streak_end >= p_current_season - 1
),
best_streaks AS (
  -- Get best active streak per rider (prefer ongoing streaks in ties)
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
$$ LANGUAGE sql SECURITY DEFINER;

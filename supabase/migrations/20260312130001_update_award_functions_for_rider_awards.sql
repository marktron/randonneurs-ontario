-- Update award functions to use rider_awards for season-scoped awards
-- and result_awards for result-scoped awards, branching on awards.award_type.

-- ============================================
-- get_award_recipients: UNION query for both sources
-- ============================================
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
  GROUP BY r.id, r.slug, r.first_name, r.last_name, res.season

  ORDER BY award_year DESC, rider_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- get_rider_award_counts: dual-source counting
-- ============================================
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
    -- Season-scoped: count distinct seasons from rider_awards
    SELECT
      r.id AS rider_id,
      r.slug,
      r.first_name,
      r.last_name,
      COUNT(DISTINCT ra.season) AS cnt
    FROM rider_awards ra
    JOIN award_info ai ON ra.award_id = ai.id
    JOIN riders r ON ra.rider_id = r.id
    WHERE ai.award_type = 'season'
    GROUP BY r.id, r.slug, r.first_name, r.last_name
  ),
  result_counts AS (
    -- Result-scoped: count distinct seasons from result_awards
    SELECT
      r.id AS rider_id,
      r.slug,
      r.first_name,
      r.last_name,
      COUNT(DISTINCT res.season) AS cnt
    FROM result_awards rsa
    JOIN award_info ai ON rsa.award_id = ai.id
    JOIN results res ON rsa.result_id = res.id
    JOIN riders r ON res.rider_id = r.id
    WHERE ai.award_type = 'result'
    GROUP BY r.id, r.slug, r.first_name, r.last_name
  ),
  combined AS (
    SELECT * FROM season_counts
    UNION ALL
    SELECT * FROM result_counts
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY cnt DESC)::INTEGER AS rank,
    combined.slug AS rider_slug,
    TRIM(CONCAT(combined.first_name, ' ', combined.last_name)) AS rider_name,
    cnt AS value
  FROM combined
  WHERE cnt > 0
  ORDER BY cnt DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- get_rider_sr_streaks: rewrite to use rider_awards
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
  -- Get distinct seasons per rider where they earned Super Randonneur
  -- Now sourced from rider_awards instead of result_awards
  SELECT DISTINCT
    r.id AS rider_id,
    r.slug,
    r.first_name,
    r.last_name,
    ra.season
  FROM rider_awards ra
  JOIN awards a ON ra.award_id = a.id
  JOIN riders r ON ra.rider_id = r.id
  WHERE a.slug = 'super-randonneur'
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

-- Fix get_rider_award_counts to count award rows rather than distinct seasons.
--
-- A rider can earn the same award multiple times in a single season (e.g. completing
-- the 200/300/400/600 brevet series more than once in a year earns multiple
-- Super Randonneur awards). The previous version used COUNT(DISTINCT season),
-- which under-counted these riders and dropped them off the records leaderboard.

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

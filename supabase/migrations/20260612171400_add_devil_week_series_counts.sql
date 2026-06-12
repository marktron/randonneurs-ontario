-- "Most Completed Devil Weeks" must rank riders by completed series, not rides.
--
-- The completed-devil-week award is result-scoped: a finished series tags each
-- of its four rides (200/300/400/600) with a result_awards row, so the generic
-- get_rider_award_counts (which counts rows) inflates the leaderboard ~4x.
-- There is exactly one Devil Week per calendar year, so the number of distinct
-- award years equals the number of completed series — robust even when a year
-- is only partially tagged (3 of 4 rides).

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
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(DISTINCT EXTRACT(YEAR FROM e.event_date)) DESC, r.last_name ASC, r.first_name ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION get_rider_devil_week_counts(INTEGER) SET search_path = public;

GRANT EXECUTE ON FUNCTION get_rider_devil_week_counts(INTEGER) TO anon, authenticated;

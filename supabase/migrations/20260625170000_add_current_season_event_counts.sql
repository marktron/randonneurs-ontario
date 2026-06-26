-- Get current season event-count leaders
-- Mirrors get_current_season_distances, but ranks riders by number of finished
-- events in the given season rather than total distance.
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
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION get_current_season_event_counts(INTEGER, INTEGER) SET search_path = public;

GRANT EXECUTE ON FUNCTION get_current_season_event_counts(INTEGER, INTEGER) TO anon, authenticated;

-- Function to efficiently get distinct seasons from events
CREATE OR REPLACE FUNCTION get_distinct_event_seasons()
RETURNS TABLE(season integer) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT e.season
  FROM events e
  WHERE e.season IS NOT NULL
  ORDER BY e.season DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

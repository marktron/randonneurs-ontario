-- Function to efficiently get distinct seasons from results
CREATE OR REPLACE FUNCTION get_distinct_seasons()
RETURNS TABLE(season integer) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT r.season
  FROM results r
  ORDER BY r.season DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix distance record functions to use results.distance_km instead of events.distance_km
-- This is important for fleche events where each team rides a different distance,
-- but results.distance_km is populated for all event types.

-- Get top riders by total distance
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
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY SUM(res.distance_km) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION get_rider_distance_totals(INTEGER) SET search_path = public;


-- Get best single-season distances
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
  GROUP BY res.season, r.id, r.slug, r.first_name, r.last_name
  ORDER BY SUM(res.distance_km) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION get_best_season_distances(INTEGER) SET search_path = public;


-- Get current season distance leaders
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
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY SUM(res.distance_km) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION get_current_season_distances(INTEGER, INTEGER) SET search_path = public;


-- Get seasons ranked by total distance ridden
CREATE OR REPLACE FUNCTION get_season_total_distances(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  season INTEGER,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY SUM(res.distance_km) DESC)::INTEGER AS rank,
    res.season AS season,
    SUM(res.distance_km)::BIGINT AS value
  FROM results res
  WHERE res.status = 'finished'
    AND res.season IS NOT NULL
  GROUP BY res.season
  ORDER BY SUM(res.distance_km) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION get_season_total_distances(INTEGER) SET search_path = public;

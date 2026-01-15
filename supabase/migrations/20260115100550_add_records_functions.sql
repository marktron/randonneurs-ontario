-- Database functions for /records page
-- These functions perform aggregation server-side for better performance

-- ============================================================================
-- LIFETIME RECORDS FUNCTIONS
-- ============================================================================

-- Get top riders by total completed events
CREATE OR REPLACE FUNCTION get_rider_completion_counts(limit_count INTEGER DEFAULT 10)
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
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_rider_completion_counts(INTEGER) TO anon, authenticated;


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
    ROW_NUMBER() OVER (ORDER BY SUM(e.distance_km) DESC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    SUM(e.distance_km)::BIGINT AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY SUM(e.distance_km) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_rider_distance_totals(INTEGER) TO anon, authenticated;


-- Get top riders by number of active seasons
CREATE OR REPLACE FUNCTION get_rider_active_seasons(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT res.season) DESC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    COUNT(DISTINCT res.season) AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  WHERE res.status = 'finished'
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(DISTINCT res.season) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_rider_active_seasons(INTEGER) TO anon, authenticated;


-- Get top riders by permanent event completions
CREATE OR REPLACE FUNCTION get_rider_permanent_counts(limit_count INTEGER DEFAULT 10)
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
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND e.event_type = 'permanent'
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  HAVING COUNT(*) > 0
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_rider_permanent_counts(INTEGER) TO anon, authenticated;


-- Get top riders by specific award count (unique seasons)
CREATE OR REPLACE FUNCTION get_rider_award_counts(p_award_slug TEXT, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT res.season) DESC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    COUNT(DISTINCT res.season) AS value
  FROM result_awards ra
  JOIN awards a ON ra.award_id = a.id
  JOIN results res ON ra.result_id = res.id
  JOIN riders r ON res.rider_id = r.id
  WHERE a.slug = p_award_slug
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  HAVING COUNT(DISTINCT res.season) > 0
  ORDER BY COUNT(DISTINCT res.season) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_rider_award_counts(TEXT, INTEGER) TO anon, authenticated;


-- ============================================================================
-- SEASON RECORDS FUNCTIONS
-- ============================================================================

-- Get best single-season event counts
CREATE OR REPLACE FUNCTION get_best_season_event_counts(limit_count INTEGER DEFAULT 10)
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
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::INTEGER AS rank,
    res.season AS season,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    COUNT(*) AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  WHERE res.status = 'finished'
    AND res.season IS NOT NULL
  GROUP BY res.season, r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_best_season_event_counts(INTEGER) TO anon, authenticated;


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
    ROW_NUMBER() OVER (ORDER BY SUM(e.distance_km) DESC)::INTEGER AS rank,
    res.season AS season,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    SUM(e.distance_km)::BIGINT AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND res.season IS NOT NULL
  GROUP BY res.season, r.id, r.slug, r.first_name, r.last_name
  ORDER BY SUM(e.distance_km) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_best_season_distances(INTEGER) TO anon, authenticated;


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
    ROW_NUMBER() OVER (ORDER BY SUM(e.distance_km) DESC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    SUM(e.distance_km)::BIGINT AS value
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND res.season = p_season
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY SUM(e.distance_km) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_current_season_distances(INTEGER, INTEGER) TO anon, authenticated;


-- ============================================================================
-- CLUB ACHIEVEMENT FUNCTIONS
-- ============================================================================

-- Get seasons ranked by unique riders
CREATE OR REPLACE FUNCTION get_season_unique_rider_counts(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  season INTEGER,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT res.rider_id) DESC)::INTEGER AS rank,
    res.season AS season,
    COUNT(DISTINCT res.rider_id) AS value
  FROM results res
  WHERE res.status = 'finished'
    AND res.season IS NOT NULL
  GROUP BY res.season
  ORDER BY COUNT(DISTINCT res.rider_id) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_season_unique_rider_counts(INTEGER) TO anon, authenticated;


-- Get seasons ranked by events organized (non-permanent, submitted status)
CREATE OR REPLACE FUNCTION get_season_event_counts(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  season INTEGER,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::INTEGER AS rank,
    e.season AS season,
    COUNT(*) AS value
  FROM events e
  WHERE e.status = 'submitted'
    AND e.event_type != 'permanent'
    AND e.season IS NOT NULL
  GROUP BY e.season
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_season_event_counts(INTEGER) TO anon, authenticated;


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
    ROW_NUMBER() OVER (ORDER BY SUM(e.distance_km) DESC)::INTEGER AS rank,
    res.season AS season,
    SUM(e.distance_km)::BIGINT AS value
  FROM results res
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND res.season IS NOT NULL
  GROUP BY res.season
  ORDER BY SUM(e.distance_km) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_season_total_distances(INTEGER) TO anon, authenticated;


-- ============================================================================
-- ROUTE RECORDS FUNCTIONS
-- ============================================================================

-- Get routes by frequency of use (times an event was held on this route)
CREATE OR REPLACE FUNCTION get_route_frequency_counts(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  route_slug TEXT,
  route_name TEXT,
  distance_km INTEGER,
  chapter_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT e.id) DESC)::INTEGER AS rank,
    rt.slug AS route_slug,
    rt.name AS route_name,
    rt.distance_km,
    c.name AS chapter_name,
    COUNT(DISTINCT e.id) AS value
  FROM routes rt
  JOIN events e ON e.route_id = rt.id
  LEFT JOIN chapters c ON rt.chapter_id = c.id
  WHERE e.event_type != 'permanent'
  GROUP BY rt.id, rt.slug, rt.name, rt.distance_km, c.name
  ORDER BY COUNT(DISTINCT e.id) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_route_frequency_counts(INTEGER) TO anon, authenticated;


-- Get routes by unique participant count
CREATE OR REPLACE FUNCTION get_route_participant_counts(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  route_slug TEXT,
  route_name TEXT,
  distance_km INTEGER,
  chapter_name TEXT,
  value BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT res.rider_id) DESC)::INTEGER AS rank,
    rt.slug AS route_slug,
    rt.name AS route_name,
    rt.distance_km,
    c.name AS chapter_name,
    COUNT(DISTINCT res.rider_id) AS value
  FROM routes rt
  JOIN events e ON e.route_id = rt.id
  JOIN results res ON res.event_id = e.id
  LEFT JOIN chapters c ON rt.chapter_id = c.id
  WHERE res.status = 'finished'
    AND e.event_type != 'permanent'
  GROUP BY rt.id, rt.slug, rt.name, rt.distance_km, c.name
  ORDER BY COUNT(DISTINCT res.rider_id) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_route_participant_counts(INTEGER) TO anon, authenticated;


-- ============================================================================
-- PARIS-BREST-PARIS FUNCTIONS
-- ============================================================================

-- Get PBP completion counts per rider
CREATE OR REPLACE FUNCTION get_pbp_completion_counts(limit_count INTEGER DEFAULT 10)
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
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND e.name = 'Paris-Brest-Paris'
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_pbp_completion_counts(INTEGER) TO anon, authenticated;


-- Get fastest PBP times
CREATE OR REPLACE FUNCTION get_pbp_fastest_times(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  finish_time TEXT,
  event_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY res.finish_time ASC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    res.finish_time AS finish_time,
    e.event_date AS event_date
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND e.name = 'Paris-Brest-Paris'
    AND res.finish_time IS NOT NULL
  ORDER BY res.finish_time ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_pbp_fastest_times(INTEGER) TO anon, authenticated;


-- ============================================================================
-- GRANITE ANVIL FUNCTIONS
-- ============================================================================

-- Get Granite Anvil completion counts per rider
CREATE OR REPLACE FUNCTION get_granite_anvil_completion_counts(limit_count INTEGER DEFAULT 10)
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
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND e.collection = 'granite-anvil'
  GROUP BY r.id, r.slug, r.first_name, r.last_name
  ORDER BY COUNT(*) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_granite_anvil_completion_counts(INTEGER) TO anon, authenticated;


-- Get fastest Granite Anvil times
CREATE OR REPLACE FUNCTION get_granite_anvil_fastest_times(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  rider_slug TEXT,
  rider_name TEXT,
  finish_time TEXT,
  event_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY res.finish_time ASC)::INTEGER AS rank,
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    res.finish_time AS finish_time,
    e.event_date AS event_date
  FROM results res
  JOIN riders r ON res.rider_id = r.id
  JOIN events e ON res.event_id = e.id
  WHERE res.status = 'finished'
    AND e.collection = 'granite-anvil'
    AND res.finish_time IS NOT NULL
  ORDER BY res.finish_time ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_granite_anvil_fastest_times(INTEGER) TO anon, authenticated;

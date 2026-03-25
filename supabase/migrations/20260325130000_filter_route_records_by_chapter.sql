-- Filter route record RPCs to only include routes from the four actual chapters
-- (Huron, Simcoe-Muskoka, Ottawa, Toronto), excluding "Other" and NULL chapters.
-- Also add chapter_slug to the return type for proper route linking.

-- Must drop first because return type is changing (adding chapter_slug)
DROP FUNCTION IF EXISTS get_route_frequency_counts(INTEGER);
DROP FUNCTION IF EXISTS get_route_participant_counts(INTEGER);

CREATE OR REPLACE FUNCTION get_route_frequency_counts(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  route_slug TEXT,
  route_name TEXT,
  distance_km INTEGER,
  chapter_name TEXT,
  chapter_slug TEXT,
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
    c.slug AS chapter_slug,
    COUNT(DISTINCT e.id) AS value
  FROM routes rt
  JOIN events e ON e.route_id = rt.id
  JOIN chapters c ON rt.chapter_id = c.id
  WHERE e.event_type != 'permanent'
    AND c.slug != 'other'
  GROUP BY rt.id, rt.slug, rt.name, rt.distance_km, c.name, c.slug
  ORDER BY COUNT(DISTINCT e.id) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION get_route_frequency_counts(INTEGER) SET search_path = public;
GRANT EXECUTE ON FUNCTION get_route_frequency_counts(INTEGER) TO anon, authenticated;


CREATE OR REPLACE FUNCTION get_route_participant_counts(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  rank INTEGER,
  route_slug TEXT,
  route_name TEXT,
  distance_km INTEGER,
  chapter_name TEXT,
  chapter_slug TEXT,
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
    c.slug AS chapter_slug,
    COUNT(DISTINCT res.rider_id) AS value
  FROM routes rt
  JOIN events e ON e.route_id = rt.id
  JOIN results res ON res.event_id = e.id
  JOIN chapters c ON rt.chapter_id = c.id
  WHERE res.status = 'finished'
    AND e.event_type != 'permanent'
    AND c.slug != 'other'
  GROUP BY rt.id, rt.slug, rt.name, rt.distance_km, c.name, c.slug
  ORDER BY COUNT(DISTINCT res.rider_id) DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION get_route_participant_counts(INTEGER) SET search_path = public;
GRANT EXECUTE ON FUNCTION get_route_participant_counts(INTEGER) TO anon, authenticated;

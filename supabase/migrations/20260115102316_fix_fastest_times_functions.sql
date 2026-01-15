-- Fix fastest times functions to cast interval to text

-- Get fastest PBP times (fixed: cast interval to text)
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
    res.finish_time::TEXT AS finish_time,
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


-- Get fastest Granite Anvil times (fixed: cast interval to text)
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
    res.finish_time::TEXT AS finish_time,
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

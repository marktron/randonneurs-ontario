-- Get all recipients of a specific award with the year awarded
-- Returns unique rider+season combinations, sorted by season descending (most recent first)
CREATE OR REPLACE FUNCTION get_award_recipients(p_award_slug TEXT)
RETURNS TABLE (
  rider_slug TEXT,
  rider_name TEXT,
  award_year INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    res.season AS award_year
  FROM result_awards ra
  JOIN awards a ON ra.award_id = a.id
  JOIN results res ON ra.result_id = res.id
  JOIN riders r ON res.rider_id = r.id
  WHERE a.slug = p_award_slug
  GROUP BY r.id, r.slug, r.first_name, r.last_name, res.season
  ORDER BY res.season DESC, r.last_name ASC, r.first_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_award_recipients(TEXT) TO anon, authenticated;

-- Get recipients of a specific award with their total season distance.
-- Uses results.distance_km (not events.distance_km) so flèche distances are correct.
-- Handles both season-scoped awards (rider_awards) and result-scoped awards (result_awards).
CREATE OR REPLACE FUNCTION get_award_recipients_with_distance(p_award_slug TEXT)
RETURNS TABLE (
  rider_slug TEXT,
  rider_name TEXT,
  award_year INTEGER,
  season_distance BIGINT
) AS $$
BEGIN
  RETURN QUERY
  -- Season-scoped awards (from rider_awards)
  SELECT
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    ra.season AS award_year,
    COALESCE(season_totals.total_km, 0)::BIGINT AS season_distance
  FROM rider_awards ra
  JOIN awards a ON ra.award_id = a.id
  JOIN riders r ON ra.rider_id = r.id
  LEFT JOIN LATERAL (
    SELECT SUM(res.distance_km) AS total_km
    FROM results res
    WHERE res.rider_id = r.id
      AND res.season = ra.season
      AND res.status = 'finished'
  ) season_totals ON TRUE
  WHERE a.slug = p_award_slug
    AND a.award_type = 'season'
  GROUP BY r.id, r.slug, r.first_name, r.last_name, ra.season, season_totals.total_km

  UNION ALL

  -- Result-scoped awards (from result_awards)
  SELECT
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    res.season AS award_year,
    COALESCE(season_totals.total_km, 0)::BIGINT AS season_distance
  FROM result_awards rsa
  JOIN awards a ON rsa.award_id = a.id
  JOIN results res ON rsa.result_id = res.id
  JOIN riders r ON res.rider_id = r.id
  LEFT JOIN LATERAL (
    SELECT SUM(r2.distance_km) AS total_km
    FROM results r2
    WHERE r2.rider_id = r.id
      AND r2.season = res.season
      AND r2.status = 'finished'
  ) season_totals ON TRUE
  WHERE a.slug = p_award_slug
    AND a.award_type = 'result'
  GROUP BY r.id, r.slug, r.first_name, r.last_name, res.season, season_totals.total_km

  ORDER BY award_year DESC, rider_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION get_award_recipients_with_distance(TEXT) SET search_path = public;
GRANT EXECUTE ON FUNCTION get_award_recipients_with_distance(TEXT) TO anon, authenticated;

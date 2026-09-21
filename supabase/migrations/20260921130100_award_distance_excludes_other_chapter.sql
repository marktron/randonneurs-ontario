-- The awards page distance column (used for O-5000) previously summed every
-- finished result in the season, including Paris-Brest-Paris, which is filed
-- under the `other` chapter and does not count toward O-5000. Switch both
-- branches to the shared ontario_season_distance_km helper introduced in
-- 20260921130000_auto_assign_o_5000.sql so the displayed number always equals
-- the qualifying total (in-Ontario rides only; the club Flèche still counts).
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
    ontario_season_distance_km(r.id, ra.season) AS season_distance
  FROM rider_awards ra
  JOIN awards a ON ra.award_id = a.id
  JOIN riders r ON ra.rider_id = r.id
  WHERE a.slug = p_award_slug
    AND a.award_type = 'season'
  GROUP BY r.id, r.slug, r.first_name, r.last_name, ra.season

  UNION ALL

  -- Result-scoped awards (from result_awards)
  SELECT
    r.slug AS rider_slug,
    TRIM(CONCAT(r.first_name, ' ', r.last_name)) AS rider_name,
    res.season AS award_year,
    ontario_season_distance_km(r.id, res.season) AS season_distance
  FROM result_awards rsa
  JOIN awards a ON rsa.award_id = a.id
  JOIN results res ON rsa.result_id = res.id
  JOIN riders r ON res.rider_id = r.id
  WHERE a.slug = p_award_slug
    AND a.award_type = 'result'
  GROUP BY r.id, r.slug, r.first_name, r.last_name, res.season

  ORDER BY award_year DESC, rider_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION get_award_recipients_with_distance(TEXT) SET search_path = public;
GRANT EXECUTE ON FUNCTION get_award_recipients_with_distance(TEXT) TO anon, authenticated;

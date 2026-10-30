-- Registered riders list links each named rider to their public profile.
-- Return the rider slug, nulled for hidden riders exactly like the name, so the
-- list never leaks a hidden rider's profile URL.
-- CREATE OR REPLACE cannot change a RETURNS TABLE shape, so drop and recreate.

DROP FUNCTION IF EXISTS get_registered_riders(UUID);

CREATE FUNCTION get_registered_riders(p_event_id UUID)
RETURNS TABLE (
  first_name TEXT,
  last_name TEXT,
  share_registration BOOLEAN,
  slug TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN r.hidden THEN NULL ELSE r.first_name END,
    CASE WHEN r.hidden THEN NULL ELSE r.last_name END,
    (reg.share_registration AND NOT r.hidden) AS share_registration,
    CASE WHEN r.hidden THEN NULL ELSE r.slug END
  FROM registrations reg
  JOIN riders r ON reg.rider_id = r.id
  WHERE reg.event_id = p_event_id
    AND reg.status = 'registered'
  ORDER BY reg.registered_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_registered_riders(UUID) TO anon, authenticated;

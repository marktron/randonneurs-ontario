-- Function to get registered riders for an event
-- Uses SECURITY DEFINER to bypass RLS on riders table
-- Only returns public info (no email)

CREATE OR REPLACE FUNCTION get_registered_riders(p_event_id UUID)
RETURNS TABLE (
  first_name TEXT,
  last_name TEXT,
  share_registration BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.first_name,
    r.last_name,
    reg.share_registration
  FROM registrations reg
  JOIN riders r ON reg.rider_id = r.id
  WHERE reg.event_id = p_event_id
    AND reg.status = 'registered'
  ORDER BY reg.registered_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION get_registered_riders(UUID) TO anon, authenticated;

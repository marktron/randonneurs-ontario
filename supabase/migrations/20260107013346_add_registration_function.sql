-- Function to handle event registration
-- Uses SECURITY DEFINER to bypass RLS for rider/registration creation

CREATE OR REPLACE FUNCTION register_for_event(
  p_event_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT,
  p_gender TEXT DEFAULT NULL,
  p_share_registration BOOLEAN DEFAULT false,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_rider_id UUID;
  v_event_status TEXT;
  v_existing_registration UUID;
  v_slug TEXT;
BEGIN
  -- Validate required fields
  IF p_event_id IS NULL OR p_first_name IS NULL OR p_email IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Missing required fields');
  END IF;

  -- Check event exists and is scheduled
  SELECT status INTO v_event_status
  FROM events
  WHERE id = p_event_id;

  IF v_event_status IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Event not found');
  END IF;

  IF v_event_status != 'scheduled' THEN
    RETURN json_build_object('success', false, 'error', 'Registration is not open for this event');
  END IF;

  -- Normalize email
  p_email := lower(trim(p_email));

  -- Find existing rider by email
  SELECT id INTO v_rider_id
  FROM riders
  WHERE email = p_email;

  IF v_rider_id IS NOT NULL THEN
    -- Update existing rider info
    UPDATE riders
    SET
      first_name = p_first_name,
      last_name = COALESCE(p_last_name, ''),
      gender = CASE
        WHEN p_gender IN ('M', 'F', 'X') THEN p_gender
        ELSE gender
      END
    WHERE id = v_rider_id;
  ELSE
    -- Create new rider with unique slug
    v_slug := lower(regexp_replace(split_part(p_email, '@', 1), '[^a-z0-9]', '-', 'g'))
              || '-' || substr(md5(random()::text), 1, 6);

    INSERT INTO riders (slug, first_name, last_name, email, gender)
    VALUES (
      v_slug,
      p_first_name,
      COALESCE(p_last_name, ''),
      p_email,
      CASE WHEN p_gender IN ('M', 'F', 'X') THEN p_gender ELSE NULL END
    )
    RETURNING id INTO v_rider_id;
  END IF;

  -- Check for existing registration
  SELECT id INTO v_existing_registration
  FROM registrations
  WHERE event_id = p_event_id AND rider_id = v_rider_id;

  IF v_existing_registration IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'You are already registered for this event');
  END IF;

  -- Create registration
  INSERT INTO registrations (event_id, rider_id, status, share_registration, notes)
  VALUES (p_event_id, v_rider_id, 'registered', p_share_registration, p_notes);

  RETURN json_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', 'Registration failed: ' || SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION register_for_event(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated;

-- The rider action now derives `gps` whenever it receives coordinates, but
-- older application versions could deliberately store an out-of-radius fix
-- as `manual`. Keep those complete legacy coordinate pairs as organizer
-- evidence. Pairing and diagnostic constraints still reject partial or
-- contradictory evidence.
ALTER TABLE control_checkins
  DROP CONSTRAINT control_checkins_method_coordinates_check,
  ADD CONSTRAINT control_checkins_method_coordinates_check
    CHECK (
      (method = 'gps' AND lat IS NOT NULL)
      OR method IN ('manual', 'admin')
    );

COMMENT ON CONSTRAINT control_checkins_method_coordinates_check ON control_checkins IS
  'GPS rows require a fix; legacy manual and organizer rows may retain a complete paired fix.';

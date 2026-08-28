-- Every reader treats a control location as all-or-none. Normalize unusable
-- partial legacy locations, then enforce the same invariant for direct and
-- service-role writes as the organizer action already validates.
UPDATE event_controls
SET
  lat = NULL,
  lng = NULL
WHERE (lat IS NULL) <> (lng IS NULL);

ALTER TABLE event_controls
  ADD CONSTRAINT event_controls_coordinates_paired_check
    CHECK ((lat IS NULL) = (lng IS NULL));

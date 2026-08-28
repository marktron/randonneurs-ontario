-- Persist bounded, privacy-conscious location failure diagnostics for manual
-- rider check-ins. Raw browser messages and user-agent strings are never
-- stored.
ALTER TABLE control_checkins
  ADD COLUMN location_failure_reason TEXT,
  ADD COLUMN location_failure_stage TEXT,
  ADD COLUMN location_failure_elapsed_ms INTEGER,
  ADD COLUMN location_failure_context TEXT;

-- Normalize legacy inconsistencies before adding stricter constraints. Never
-- invent a missing coordinate or GPS provenance: discard only a partial fix.
-- Complete coordinate pairs on legacy manual rows are useful organizer
-- evidence and must not be erased, even though the current rider action no
-- longer creates manual rows with coordinates.
UPDATE control_checkins
SET
  lat = NULL,
  lng = NULL,
  accuracy_m = NULL,
  distance_to_control_m = NULL
WHERE (lat IS NULL) <> (lng IS NULL);

-- A GPS-labelled row with no complete fix becomes a manual row for organizer
-- review. Organizer rows keep their method and may retain either a complete
-- GPS fix or no fix.
UPDATE control_checkins
SET method = 'manual'
WHERE method = 'gps'
  AND lat IS NULL
  AND lng IS NULL;

UPDATE control_checkins
SET
  accuracy_m = NULL,
  distance_to_control_m = NULL
WHERE lat IS NULL;

-- A row can retain either a coordinate fix or a no-GPS failure diagnostic,
-- never both. Organizer corrections preserve the rider's original evidence:
-- GPS-origin rows keep coordinates, while manual-origin rows keep the
-- diagnostic.
ALTER TABLE control_checkins
  ADD CONSTRAINT control_checkins_coordinates_paired_check
    CHECK ((lat IS NULL) = (lng IS NULL)),
  ADD CONSTRAINT control_checkins_method_coordinates_check
    CHECK (
      (method = 'gps' AND lat IS NOT NULL)
      OR method IN ('manual', 'admin')
    ),
  ADD CONSTRAINT control_checkins_accuracy_requires_coordinates_check
    CHECK (accuracy_m IS NULL OR lat IS NOT NULL),
  ADD CONSTRAINT control_checkins_distance_requires_coordinates_check
    CHECK (distance_to_control_m IS NULL OR lat IS NOT NULL),
  ADD CONSTRAINT control_checkins_location_failure_diagnostic_check
    CHECK (
      (
        location_failure_reason IS NULL
        AND location_failure_stage IS NULL
        AND location_failure_elapsed_ms IS NULL
        AND location_failure_context IS NULL
      )
      OR (
        method IN ('manual', 'admin')
        AND lat IS NULL
        AND lng IS NULL
        AND location_failure_reason IS NOT NULL
        AND location_failure_stage IS NOT NULL
        AND location_failure_elapsed_ms IS NOT NULL
        AND location_failure_context IS NOT NULL
        AND location_failure_reason IN (
          'insecure_context',
          'unsupported',
          'permission_denied',
          'position_unavailable',
          'timeout',
          'request_error'
        )
        AND location_failure_stage IN ('preflight', 'quick', 'high_accuracy')
        AND location_failure_elapsed_ms BETWEEN 0 AND 120000
        AND location_failure_context IN ('browser', 'standalone', 'embedded')
      )
    );

COMMENT ON COLUMN control_checkins.location_failure_reason IS
  'Bounded reason for a rider location failure; never a raw browser message.';
COMMENT ON COLUMN control_checkins.location_failure_stage IS
  'Location acquisition stage that produced the final failure.';
COMMENT ON COLUMN control_checkins.location_failure_elapsed_ms IS
  'Client-observed location acquisition duration, bounded to 0..120000 ms.';
COMMENT ON COLUMN control_checkins.location_failure_context IS
  'Bounded browser context: browser, standalone, or embedded.';
COMMENT ON CONSTRAINT control_checkins_method_coordinates_check ON control_checkins IS
  'GPS rows require a fix; legacy manual and organizer rows may retain a complete paired fix.';

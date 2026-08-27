-- A row can retain either a coordinate fix or a no-GPS failure diagnostic,
-- never both. Organizer corrections preserve the rider's original evidence:
-- GPS-origin rows keep coordinates, while manual-origin rows keep the
-- diagnostic. Normalize any contradictory rows created between migrations by
-- preferring the concrete coordinate evidence.
UPDATE control_checkins
SET
  location_failure_reason = NULL,
  location_failure_stage = NULL,
  location_failure_elapsed_ms = NULL,
  location_failure_context = NULL
WHERE lat IS NOT NULL
  AND (
    location_failure_reason IS NOT NULL
    OR location_failure_stage IS NOT NULL
    OR location_failure_elapsed_ms IS NOT NULL
    OR location_failure_context IS NOT NULL
  );

ALTER TABLE control_checkins
  DROP CONSTRAINT control_checkins_location_failure_diagnostic_check,
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

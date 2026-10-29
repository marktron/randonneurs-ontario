-- Structured ride-start data (see
-- docs/superpowers/specs/2026-10-04-permanent-alternate-start-design.md).
-- direction replaces the "(Reversed)" name match on any event;
-- start_offset_km is a permanent rider's chosen start, in km along the route
-- as posted.
ALTER TABLE events
  ADD COLUMN direction TEXT NOT NULL DEFAULT 'as_posted',
  ADD COLUMN start_offset_km NUMERIC(6,1),
  ADD COLUMN start_lat DOUBLE PRECISION,
  ADD COLUMN start_lng DOUBLE PRECISION;

-- Backfill from the old "(Reversed)" name convention, for every event type:
-- the control import used to reverse any event whose name matched it.
UPDATE events
SET direction = 'reversed'
WHERE name LIKE '%(Reversed)%';

ALTER TABLE events
  ADD CONSTRAINT events_direction_check
    CHECK (direction IN ('as_posted', 'reversed')),
  ADD CONSTRAINT events_start_offset_nonnegative_check
    CHECK (start_offset_km IS NULL OR start_offset_km >= 0),
  ADD CONSTRAINT events_start_coordinates_paired_check
    CHECK ((start_lat IS NULL) = (start_lng IS NULL)),
  ADD CONSTRAINT events_start_offset_requires_coordinates_check
    CHECK (start_offset_km IS NULL OR start_lat IS NOT NULL);

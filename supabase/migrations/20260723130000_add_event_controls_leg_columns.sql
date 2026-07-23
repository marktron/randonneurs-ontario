-- Per-leg control cards for collection routes (>1200 km events whose route
-- has rwgps_collection_id): controls imported from a collection member route
-- ("leg") carry that route's RWGPS id and a display heading, e.g.
-- "Leg 3: CCE 200 - Gravenhurst". Single-route events leave both NULL —
-- zero behavior change. `position` keeps ordering controls globally across
-- legs (all of leg 1's controls, then leg 2's, ...).
ALTER TABLE event_controls
ADD COLUMN leg_rwgps_id TEXT,
ADD COLUMN leg_name TEXT;

-- The pair is set together or not at all.
ALTER TABLE event_controls
ADD CONSTRAINT event_controls_leg_pair
CHECK ((leg_rwgps_id IS NULL) = (leg_name IS NULL));

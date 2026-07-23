-- RWGPS collection reference for multi-leg events (>1200 km). Mutually
-- exclusive with rwgps_id: a route embeds either a single RWGPS route or a
-- collection of routes, never both. Unrelated to the `collection` text
-- column, which is a series grouping (e.g. "Granite Anvil").
ALTER TABLE routes
ADD COLUMN rwgps_collection_id TEXT;

ALTER TABLE routes
ADD CONSTRAINT routes_rwgps_ref_exclusive
CHECK (NOT (rwgps_id IS NOT NULL AND rwgps_collection_id IS NOT NULL));

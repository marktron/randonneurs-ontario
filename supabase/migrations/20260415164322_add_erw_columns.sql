-- Add Epic Ride Weather event tracking columns
ALTER TABLE events ADD COLUMN erw_event_id TEXT;
ALTER TABLE events ADD COLUMN erw_canonical_url TEXT;

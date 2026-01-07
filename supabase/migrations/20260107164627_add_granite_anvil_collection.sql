-- Add collection column to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS collection text;

-- Create index for efficient collection queries
CREATE INDEX IF NOT EXISTS idx_events_collection ON events(collection) WHERE collection IS NOT NULL;

-- Tag Granite Anvil events (1000km+) with the collection
UPDATE events
SET collection = 'granite-anvil'
WHERE name ILIKE '%granite%anvil%'
  AND distance_km >= 1000;

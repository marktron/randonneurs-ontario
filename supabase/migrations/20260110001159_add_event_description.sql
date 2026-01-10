-- Add description field to events table for markdown-formatted event details
ALTER TABLE events ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN events.description IS 'Optional markdown-formatted description for the event';

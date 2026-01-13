-- Add indexes for common query patterns
-- These target the most frequent public-facing queries

-- Events: slug lookup (used in getEventBySlug)
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);

-- Events: composite index for chapter calendar queries
-- Most common pattern: filter by chapter + status + upcoming date
CREATE INDEX IF NOT EXISTS idx_events_chapter_status_date
  ON events(chapter_id, status, event_date);

-- Events: partial index for scheduled events by date
-- Optimizes queries filtering for status='scheduled' with date range
CREATE INDEX IF NOT EXISTS idx_events_scheduled_date
  ON events(event_date)
  WHERE status = 'scheduled';

-- Routes: composite index for chapter routes page
-- Common pattern: filter by chapter + is_active
CREATE INDEX IF NOT EXISTS idx_routes_chapter_active
  ON routes(chapter_id, is_active)
  WHERE is_active = true;

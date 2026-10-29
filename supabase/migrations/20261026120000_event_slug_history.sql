-- Old event slugs kept so rescheduled events keep their links working.
CREATE TABLE event_slug_history (
  slug       TEXT PRIMARY KEY,
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_slug_history_event ON event_slug_history(event_id);
ALTER TABLE event_slug_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_slug_history_select_public" ON event_slug_history
  FOR SELECT USING (true);
COMMENT ON TABLE event_slug_history IS 'Previous slugs of events; /register/[slug] redirects these to the current slug.';

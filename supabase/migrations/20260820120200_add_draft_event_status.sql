-- Add 'draft' to allowed event statuses.
-- Drafts are events being planned for a future season; they must never be
-- visible on the public site, iCal feed, or anon REST API until published.

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;

ALTER TABLE events ADD CONSTRAINT events_status_check
  CHECK (status IN ('draft', 'scheduled', 'cancelled', 'completed', 'submitted'));

-- Public read policy: everything except drafts. Admin code uses the service
-- role (bypasses RLS); authenticated chapter admins keep their existing
-- insert/update/delete policies and read through the service role in the app.
DROP POLICY IF EXISTS "events_select_public" ON events;

CREATE POLICY "events_select_public" ON events
  FOR SELECT USING (status IS DISTINCT FROM 'draft');

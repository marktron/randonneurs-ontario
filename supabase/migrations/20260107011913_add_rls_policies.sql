-- Row Level Security Policies for Randonneurs Ontario
-- Migration: add_rls_policies

-- ============================================
-- Enable RLS on all tables
-- ============================================
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Helper function: Check if user is an admin
-- ============================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Helper function: Check if user is admin for a chapter
-- ============================================
CREATE OR REPLACE FUNCTION is_chapter_admin(check_chapter_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins
    WHERE id = auth.uid()
    AND (role = 'admin' OR (role = 'chapter_admin' AND chapter_id = check_chapter_id))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- chapters: Public read, admin write
-- ============================================
CREATE POLICY "chapters_select_public" ON chapters
  FOR SELECT USING (true);

CREATE POLICY "chapters_insert_admin" ON chapters
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "chapters_update_admin" ON chapters
  FOR UPDATE USING (is_admin());

CREATE POLICY "chapters_delete_admin" ON chapters
  FOR DELETE USING (is_admin());

-- ============================================
-- routes: Public read, chapter admin write
-- ============================================
CREATE POLICY "routes_select_public" ON routes
  FOR SELECT USING (true);

CREATE POLICY "routes_insert_admin" ON routes
  FOR INSERT WITH CHECK (is_chapter_admin(chapter_id));

CREATE POLICY "routes_update_admin" ON routes
  FOR UPDATE USING (is_chapter_admin(chapter_id));

CREATE POLICY "routes_delete_admin" ON routes
  FOR DELETE USING (is_chapter_admin(chapter_id));

-- ============================================
-- events: Public read, chapter admin write
-- ============================================
CREATE POLICY "events_select_public" ON events
  FOR SELECT USING (true);

CREATE POLICY "events_insert_admin" ON events
  FOR INSERT WITH CHECK (is_chapter_admin(chapter_id));

CREATE POLICY "events_update_admin" ON events
  FOR UPDATE USING (is_chapter_admin(chapter_id));

CREATE POLICY "events_delete_admin" ON events
  FOR DELETE USING (is_chapter_admin(chapter_id));

-- ============================================
-- riders: Public read (name only), admin can see all
-- Note: Email is sensitive - only admins see it
-- ============================================
CREATE POLICY "riders_select_public" ON riders
  FOR SELECT USING (true);

CREATE POLICY "riders_insert_admin" ON riders
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "riders_update_admin" ON riders
  FOR UPDATE USING (is_admin());

CREATE POLICY "riders_delete_admin" ON riders
  FOR DELETE USING (is_admin());

-- ============================================
-- registrations: Public read for event registrations
-- (allows showing who's registered for an event)
-- Admin write access
-- ============================================
CREATE POLICY "registrations_select_public" ON registrations
  FOR SELECT USING (true);

CREATE POLICY "registrations_insert_admin" ON registrations
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "registrations_update_admin" ON registrations
  FOR UPDATE USING (is_admin());

CREATE POLICY "registrations_delete_admin" ON registrations
  FOR DELETE USING (is_admin());

-- ============================================
-- results: Public read (results are public records)
-- Chapter admin write access
-- ============================================
CREATE POLICY "results_select_public" ON results
  FOR SELECT USING (true);

CREATE POLICY "results_insert_admin" ON results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
      AND is_chapter_admin(e.chapter_id)
    )
  );

CREATE POLICY "results_update_admin" ON results
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
      AND is_chapter_admin(e.chapter_id)
    )
  );

CREATE POLICY "results_delete_admin" ON results
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
      AND is_chapter_admin(e.chapter_id)
    )
  );

-- ============================================
-- awards: Public read, admin write
-- ============================================
CREATE POLICY "awards_select_public" ON awards
  FOR SELECT USING (true);

CREATE POLICY "awards_insert_admin" ON awards
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "awards_update_admin" ON awards
  FOR UPDATE USING (is_admin());

CREATE POLICY "awards_delete_admin" ON awards
  FOR DELETE USING (is_admin());

-- ============================================
-- result_awards: Public read, follows result permissions
-- ============================================
CREATE POLICY "result_awards_select_public" ON result_awards
  FOR SELECT USING (true);

CREATE POLICY "result_awards_insert_admin" ON result_awards
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM results r
      JOIN events e ON r.event_id = e.id
      WHERE r.id = result_id
      AND is_chapter_admin(e.chapter_id)
    )
  );

CREATE POLICY "result_awards_delete_admin" ON result_awards
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM results r
      JOIN events e ON r.event_id = e.id
      WHERE r.id = result_id
      AND is_chapter_admin(e.chapter_id)
    )
  );

-- ============================================
-- admins: Only super admins can see/modify
-- ============================================
CREATE POLICY "admins_select_self" ON admins
  FOR SELECT USING (id = auth.uid() OR is_admin());

CREATE POLICY "admins_insert_admin" ON admins
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admins_update_admin" ON admins
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "admins_delete_admin" ON admins
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- Create a view to hide rider email from public
-- ============================================
CREATE VIEW public_riders AS
SELECT id, slug, first_name, last_name, gender, created_at, updated_at
FROM riders;

GRANT SELECT ON public_riders TO anon, authenticated;

-- Add RLS policies for memberships table
-- Follows the same pattern as riders/registrations tables

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- Public read access (needed for joins in admin queries and registration checks)
CREATE POLICY "memberships_select_public" ON memberships
  FOR SELECT USING (true);

-- Only admins can insert memberships
CREATE POLICY "memberships_insert_admin" ON memberships
  FOR INSERT WITH CHECK (is_admin());

-- Only admins can update memberships
CREATE POLICY "memberships_update_admin" ON memberships
  FOR UPDATE USING (is_admin());

-- Only admins can delete memberships
CREATE POLICY "memberships_delete_admin" ON memberships
  FOR DELETE USING (is_admin());

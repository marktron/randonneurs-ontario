-- Add super_admin role to the admin role hierarchy
-- super_admin > admin > chapter_admin

-- 1. Update CHECK constraint to include super_admin
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_check;
ALTER TABLE admins ADD CONSTRAINT admins_role_check
  CHECK (role IN ('super_admin', 'admin', 'chapter_admin'));

-- 2. Update is_chapter_admin() to recognize super_admin as having full access
CREATE OR REPLACE FUNCTION is_chapter_admin(check_chapter_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins
    WHERE id = auth.uid()
    AND (role IN ('super_admin', 'admin') OR (role = 'chapter_admin' AND chapter_id = check_chapter_id))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update RLS policies on admins table to require super_admin
DROP POLICY IF EXISTS "admins_insert_admin" ON admins;
CREATE POLICY "admins_insert_admin" ON admins
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "admins_update_admin" ON admins;
CREATE POLICY "admins_update_admin" ON admins
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "admins_delete_admin" ON admins;
CREATE POLICY "admins_delete_admin" ON admins
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

-- 4. Promote all existing admin users to super_admin
UPDATE admins SET role = 'super_admin' WHERE role = 'admin';

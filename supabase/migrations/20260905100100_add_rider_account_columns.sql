-- Rider accounts, phase 1: link riders to auth users; profile columns for phase 3.
-- Spec: docs/superpowers/specs/2026-09-04-rider-accounts-design.md §4.1

ALTER TABLE riders
  ADD COLUMN auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN linked_at TIMESTAMPTZ,
  ADD COLUMN bio TEXT CHECK (char_length(bio) <= 500),
  ADD COLUMN photo_path TEXT;

-- Keep the pair together. ON DELETE SET NULL only clears auth_user_id, so a
-- trigger clears linked_at in the same statement; the CHECK is evaluated after
-- BEFORE triggers run.
CREATE OR REPLACE FUNCTION riders_clear_linked_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    NEW.linked_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_riders_clear_linked_at
  BEFORE UPDATE OF auth_user_id ON riders
  FOR EACH ROW
  WHEN (NEW.auth_user_id IS NULL AND OLD.auth_user_id IS NOT NULL)
  EXECUTE FUNCTION riders_clear_linked_at();

ALTER TABLE riders
  ADD CONSTRAINT riders_link_pair CHECK ((auth_user_id IS NULL) = (linked_at IS NULL));

-- Public profile columns are readable like the other public rider columns.
-- auth_user_id and linked_at are deliberately NOT granted to anon or authenticated.
GRANT SELECT (bio, photo_path) ON riders TO anon, authenticated;

-- Append the profile columns to the public view (CREATE OR REPLACE requires
-- new columns to be trailing).
CREATE OR REPLACE VIEW public_riders
WITH (security_invoker = true, security_barrier = true)
AS
SELECT id, slug, first_name, last_name, gender, rider_number, created_at, updated_at, bio, photo_path
FROM riders
WHERE EXISTS (SELECT 1 FROM results WHERE results.rider_id = riders.id);

GRANT SELECT ON public_riders TO anon, authenticated;

-- Admin "link account by email" needs an auth.users lookup. The admin SDK's
-- listUsers has no email filter, so expose a service-role-only function.
CREATE OR REPLACE FUNCTION auth_user_id_for_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION auth_user_id_for_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_user_id_for_email(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION auth_user_id_for_email(TEXT) TO service_role;

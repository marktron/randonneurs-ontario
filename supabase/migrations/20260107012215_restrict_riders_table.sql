-- Restrict direct access to riders table (contains email)
-- Force anonymous users to use public_riders view instead

-- Revoke direct SELECT on riders table from anonymous users
REVOKE SELECT ON riders FROM anon;

-- Authenticated users can still see riders directly (for admin purposes)
-- The RLS policy controls what they can do

-- Recreate the view with SECURITY DEFINER to bypass RLS
-- This allows the view to read from riders even though anon can't directly
DROP VIEW IF EXISTS public_riders;

CREATE VIEW public_riders
WITH (security_barrier = true)
AS
SELECT id, slug, first_name, last_name, gender, created_at, updated_at
FROM riders;

-- Grant access to the view (not the underlying table)
GRANT SELECT ON public_riders TO anon, authenticated;

-- Rider accounts, phase 0 (docs/superpowers/specs/2026-09-04-rider-accounts-design.md §4.0).
--
-- Once riders can sign in, `authenticated` is a public role: anyone with the
-- anon key can obtain a session. Mirror the `anon` grants exactly on the
-- sensitive base tables and remove the last storage policies keyed on the role.
-- All rider reads of private data and all writes go through service-role server
-- actions; nothing below grants owner access.

-- Base tables: remove the project-default blanket grants.
REVOKE ALL ON riders FROM authenticated;
REVOKE ALL ON registrations FROM authenticated;
REVOKE ALL ON results FROM authenticated;
REVOKE ALL ON event_controls FROM authenticated;
REVOKE ALL ON control_checkins FROM authenticated;

-- anon never had its write grants revoked either (RLS blocked them). Belt and braces.
REVOKE INSERT, UPDATE, DELETE ON riders, registrations, results FROM anon;

-- Same column lists anon holds today
-- (20260217120000_fix_security_linter_warnings.sql:12, 20260324130000_hide_capability_tokens.sql:50-68).
GRANT SELECT (id, slug, first_name, last_name, gender, rider_number, created_at, updated_at)
  ON riders TO authenticated;

GRANT SELECT (
  id, event_id, rider_id, finish_time, status, note, team_name, season, distance_km,
  created_at, updated_at, gpx_url, gpx_file_path, control_card_front_path,
  control_card_back_path, rider_notes, submitted_at
) ON results TO authenticated;

-- registrations: no base-table grant. Reads go through public_registrations,
-- which is already granted to anon and authenticated.

-- Storage: drop the two policies that let any signed-in user overwrite or
-- delete riders' control-card photos and GPX files.
DROP POLICY IF EXISTS "Authenticated update for rider submissions" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete for rider submissions" ON storage.objects;

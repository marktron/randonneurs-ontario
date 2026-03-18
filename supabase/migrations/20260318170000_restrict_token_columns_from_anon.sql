-- Restrict anonymous access to sensitive token columns on registrations and results tables.
--
-- PROBLEM: The registrations_select_public and results_select_public RLS policies
-- use USING (true), granting unrestricted SELECT to the anon role. The management_token
-- and submission_token columns (added in later migrations) are capability URLs that
-- grant unauthenticated access to cancel registrations and submit results.
-- Since NEXT_PUBLIC_SUPABASE_ANON_KEY is embedded in client-side JS, anyone can
-- query these tokens directly via PostgREST.
--
-- FIX: Revoke blanket SELECT from anon on both tables and re-grant only the
-- columns needed by public data layer queries (lib/data/).
-- All server actions that read tokens use getSupabaseAdmin() (service role),
-- which bypasses RLS and column-level grants entirely.
-- All SECURITY DEFINER functions (get_registered_riders, get_event_rider_counts,
-- register_for_event) also bypass these restrictions.

-- =============================================
-- registrations: hide management_token, cancelled_at
-- Public reads need: id, event_id, rider_id, registered_at, notes,
--   status, share_registration, team_name, is_team_captain
-- =============================================
REVOKE SELECT ON registrations FROM anon;

GRANT SELECT (
  id,
  event_id,
  rider_id,
  registered_at,
  notes,
  status,
  share_registration,
  team_name,
  is_team_captain
) ON registrations TO anon;

-- =============================================
-- results: hide submission_token, gpx_file_path,
--   control_card_front_path, control_card_back_path, rider_notes
-- Public reads need: id, event_id, rider_id, finish_time, status,
--   note, team_name, season, distance_km, created_at, updated_at,
--   submitted_at, gpx_url
-- =============================================
REVOKE SELECT ON results FROM anon;

GRANT SELECT (
  id,
  event_id,
  rider_id,
  finish_time,
  status,
  note,
  team_name,
  season,
  distance_km,
  created_at,
  updated_at,
  submitted_at,
  gpx_url
) ON results TO anon;

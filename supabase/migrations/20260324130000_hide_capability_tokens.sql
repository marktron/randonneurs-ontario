-- Hide capability tokens (management_token, submission_token) from the anon role.
--
-- These tokens are used for unauthenticated rider flows:
--   /registration/manage/[token]  → management_token
--   /results/submit/[token]       → submission_token
--
-- Since the anon key is embedded in client-side JS, anyone could query
-- these columns directly via PostgREST, undermining the security model.
--
-- Strategy:
--   registrations → view (column-level grants break PostgREST aggregate
--                   joins like registrations(count), so use a view instead)
--   results       → column-level grants (no aggregate count queries exist)
--
-- All server actions that read tokens use getSupabaseAdmin() (service role),
-- which bypasses both RLS and grants entirely.

-- =============================================
-- REGISTRATIONS: public_registrations view
-- =============================================

CREATE VIEW public_registrations
  WITH (security_barrier = true)
AS SELECT
  id,
  event_id,
  rider_id,
  registered_at,
  notes,
  status,
  share_registration,
  team_name,
  is_team_captain,
  cancelled_at
FROM registrations;

GRANT SELECT ON public_registrations TO anon, authenticated;

-- Revoke blanket SELECT on the base table
REVOKE SELECT ON registrations FROM anon;

-- =============================================
-- RESULTS: column-level grants
-- =============================================

-- Revoke blanket SELECT on the base table
REVOKE SELECT ON results FROM anon;

-- Re-grant every column except submission_token
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
  gpx_url,
  gpx_file_path,
  control_card_front_path,
  control_card_back_path,
  rider_notes,
  submitted_at
) ON results TO anon;

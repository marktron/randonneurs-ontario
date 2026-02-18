-- Fix Supabase security linter warnings:
-- 1. SECURITY DEFINER views → security_invoker = true + column-level grants
-- 2. Function search_path mutable → pin search_path = public

-- ============================================
-- 1. Fix SECURITY DEFINER views
-- ============================================

-- Instead of revoking all SELECT on riders from anon (which forced
-- SECURITY DEFINER views to bypass the restriction), grant SELECT
-- on individual non-sensitive columns. Email remains inaccessible.
GRANT SELECT (id, slug, first_name, last_name, gender, rider_number, created_at, updated_at) ON riders TO anon;

-- Recreate public_riders with security_invoker = true
-- (no longer needs to run as the view creator to access riders)
DROP VIEW IF EXISTS public_riders;

CREATE VIEW public_riders
WITH (security_invoker = true, security_barrier = true)
AS
SELECT id, slug, first_name, last_name, gender, rider_number, created_at, updated_at
FROM riders
WHERE EXISTS (SELECT 1 FROM results WHERE results.rider_id = riders.id);

GRANT SELECT ON public_riders TO anon, authenticated;

-- Recreate public_results with security_invoker = true
DROP VIEW IF EXISTS public_results;

CREATE VIEW public_results
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  r.id,
  r.event_id,
  r.finish_time,
  r.status,
  r.note,
  r.team_name,
  r.season,
  r.distance_km,
  r.created_at,
  ri.slug AS rider_slug,
  ri.first_name,
  ri.last_name
FROM results r
JOIN riders ri ON r.rider_id = ri.id;

GRANT SELECT ON public_results TO anon;
GRANT SELECT ON public_results TO authenticated;

-- ============================================
-- 2. Pin search_path on all functions
-- ============================================
-- Without a pinned search_path, a malicious actor could create a schema
-- that shadows table references. Pinning to 'public' prevents this.

ALTER FUNCTION is_admin() SET search_path = public;
ALTER FUNCTION is_chapter_admin(UUID) SET search_path = public;
ALTER FUNCTION update_updated_at_column() SET search_path = public;
ALTER FUNCTION assign_rider_number() SET search_path = public;
ALTER FUNCTION get_registered_riders(UUID) SET search_path = public;
ALTER FUNCTION get_distinct_seasons() SET search_path = public;
ALTER FUNCTION get_distinct_event_seasons() SET search_path = public;
ALTER FUNCTION get_rider_completion_counts(INTEGER) SET search_path = public;
ALTER FUNCTION get_rider_distance_totals(INTEGER) SET search_path = public;
ALTER FUNCTION get_rider_active_seasons(INTEGER) SET search_path = public;
ALTER FUNCTION get_rider_permanent_counts(INTEGER) SET search_path = public;
ALTER FUNCTION get_rider_award_counts(TEXT, INTEGER) SET search_path = public;
ALTER FUNCTION get_best_season_event_counts(INTEGER) SET search_path = public;
ALTER FUNCTION get_best_season_distances(INTEGER) SET search_path = public;
ALTER FUNCTION get_current_season_distances(INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION get_season_unique_rider_counts(INTEGER) SET search_path = public;
ALTER FUNCTION get_season_event_counts(INTEGER) SET search_path = public;
ALTER FUNCTION get_season_total_distances(INTEGER) SET search_path = public;
ALTER FUNCTION get_route_frequency_counts(INTEGER) SET search_path = public;
ALTER FUNCTION get_route_participant_counts(INTEGER) SET search_path = public;
ALTER FUNCTION get_pbp_completion_counts(INTEGER) SET search_path = public;
ALTER FUNCTION get_granite_anvil_completion_counts(INTEGER) SET search_path = public;
ALTER FUNCTION get_pbp_fastest_times(INTEGER) SET search_path = public;
ALTER FUNCTION get_granite_anvil_fastest_times(INTEGER) SET search_path = public;
ALTER FUNCTION get_rider_sr_streaks(INTEGER, INTEGER) SET search_path = public;
ALTER FUNCTION get_rider_longest_streaks(INTEGER, INTEGER) SET search_path = public;

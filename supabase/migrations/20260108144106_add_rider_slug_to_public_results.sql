-- Add rider_slug to public_results view for linking to rider profiles
-- Must drop and recreate since we're adding a new column

DROP VIEW IF EXISTS public_results;

CREATE VIEW public_results WITH (security_barrier = true) AS
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

-- Re-grant access
GRANT SELECT ON public_results TO anon;
GRANT SELECT ON public_results TO authenticated;

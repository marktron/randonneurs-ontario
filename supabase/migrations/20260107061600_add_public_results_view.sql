-- Create a view that exposes results with rider names for public access
-- This avoids the RLS restriction on the riders table

CREATE OR REPLACE VIEW public_results WITH (security_barrier = true) AS
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
  ri.first_name,
  ri.last_name
FROM results r
JOIN riders ri ON r.rider_id = ri.id;

-- Grant access to anonymous users
GRANT SELECT ON public_results TO anon;
GRANT SELECT ON public_results TO authenticated;

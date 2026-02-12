-- Only show riders in the public directory if they have at least one result.
-- A result with any status (finished, dnf, dns, otl, dq) counts.

DROP VIEW IF EXISTS public_riders;

CREATE VIEW public_riders WITH (security_barrier = true) AS
SELECT id, slug, first_name, last_name, gender, rider_number, created_at, updated_at
FROM riders
WHERE EXISTS (SELECT 1 FROM results WHERE results.rider_id = riders.id);

GRANT SELECT ON public_riders TO anon, authenticated;

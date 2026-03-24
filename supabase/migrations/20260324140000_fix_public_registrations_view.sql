-- Fix PostgREST schema cache error: "Could not find a relationship between
-- 'events' and 'public_registrations'"
--
-- The security_barrier flag on the view prevents PostgREST from detecting the
-- foreign key relationship (registrations.event_id → events.id) through the
-- view. This breaks embedded resource queries like:
--   .from('events').select('*, public_registrations(count)')
--
-- security_barrier is only meaningful when a view has a row-filtering WHERE
-- clause (it prevents predicate pushdown that could leak filtered rows).
-- This view has no WHERE clause — it only hides columns — so the flag
-- provides no security benefit.

DROP VIEW public_registrations;

CREATE VIEW public_registrations AS
SELECT
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

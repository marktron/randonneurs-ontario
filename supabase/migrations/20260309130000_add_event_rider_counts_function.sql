-- Returns distinct rider counts per event, deduplicating across registrations and results
CREATE OR REPLACE FUNCTION get_event_rider_counts(event_ids UUID[])
RETURNS TABLE(event_id UUID, rider_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT e.event_id, COUNT(DISTINCT e.rider_id)
  FROM (
    SELECT r.event_id, r.rider_id
    FROM registrations r
    WHERE r.event_id = ANY(event_ids)
      AND r.status IN ('registered', 'incomplete: membership')
    UNION
    SELECT res.event_id, res.rider_id
    FROM results res
    WHERE res.event_id = ANY(event_ids)
  ) e
  GROUP BY e.event_id;
$$;

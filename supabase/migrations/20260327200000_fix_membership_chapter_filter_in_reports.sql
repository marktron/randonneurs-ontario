-- Fix: "Rode without membership" incorrectly filtered rider_memberships
-- by chapter_id. Membership is org-wide (unique on rider_id + season),
-- so a rider registered through a different chapter was incorrectly
-- shown as having no membership.
--
-- The membership stats (Members, Retention, YoY members) correctly use
-- chapter_id to show chapter-specific membership counts, so those are
-- left unchanged.

-- Non-renewed riders — check membership org-wide, not per-chapter
CREATE OR REPLACE FUNCTION get_report_non_renewed_riders(
  p_season INT,
  p_chapter_id UUID DEFAULT NULL
)
RETURNS TABLE(
  rider_id UUID,
  first_name TEXT,
  last_name TEXT
)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT
    rd.id AS rider_id,
    rd.first_name,
    rd.last_name
  FROM results r
  JOIN events e ON e.id = r.event_id
  JOIN riders rd ON rd.id = r.rider_id
  WHERE r.season = p_season
    AND r.status = 'finished'
    AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id)
    AND (e.event_type != 'permanent'
         OR p_chapter_id = (SELECT id FROM chapters WHERE slug = 'permanent'))
    AND rd.id NOT IN (
      SELECT rm.rider_id
      FROM rider_memberships rm
      WHERE rm.season = p_season
    )
  ORDER BY rd.last_name, rd.first_name;
$$;

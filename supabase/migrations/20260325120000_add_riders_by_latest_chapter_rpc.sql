-- Move "latest membership chapter" filtering into the database.
-- Returns rider IDs + total count for riders whose most recent
-- membership (by season) belongs to the given chapter, with
-- optional multi-term search and pagination.
CREATE OR REPLACE FUNCTION get_riders_by_latest_chapter(
  p_chapter_name TEXT,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE(rider_id UUID, total_count BIGINT)
LANGUAGE sql STABLE AS $$
  WITH latest_membership AS (
    SELECT DISTINCT ON (rm.rider_id)
      rm.rider_id,
      c.name AS chapter_name
    FROM rider_memberships rm
    JOIN chapters c ON c.id = rm.chapter_id
    ORDER BY rm.rider_id, rm.season DESC
  ),
  filtered AS (
    SELECT r.id
    FROM riders r
    JOIN latest_membership lm ON lm.rider_id = r.id
    WHERE lm.chapter_name = p_chapter_name
      AND (
        p_search IS NULL
        OR p_search = ''
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(regexp_split_to_array(trim(p_search), '\s+')) AS term
          WHERE term <> ''
            AND NOT (
              r.full_name ILIKE '%' || term || '%'
              OR coalesce(r.email, '') ILIKE '%' || term || '%'
            )
        )
      )
  )
  SELECT
    sub.id AS rider_id,
    (SELECT count(*) FROM filtered)::BIGINT AS total_count
  FROM filtered sub
  JOIN riders r ON r.id = sub.id
  ORDER BY r.last_name, r.first_name
  LIMIT p_limit
  OFFSET p_offset;
$$;

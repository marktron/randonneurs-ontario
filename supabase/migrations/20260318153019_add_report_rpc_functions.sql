-- 1. Membership stats for a season/chapter
CREATE OR REPLACE FUNCTION get_report_membership_stats(
  p_season INT,
  p_chapter_id UUID DEFAULT NULL
)
RETURNS TABLE(
  total_members BIGINT,
  new_members BIGINT,
  returning_members BIGINT,
  prior_year_members BIGINT
)
LANGUAGE sql STABLE AS $$
  WITH current AS (
    SELECT DISTINCT rider_id
    FROM rider_memberships
    WHERE season = p_season
      AND (p_chapter_id IS NULL OR chapter_id = p_chapter_id)
  ),
  prior AS (
    SELECT DISTINCT rider_id
    FROM rider_memberships
    WHERE season = p_season - 1
      AND (p_chapter_id IS NULL OR chapter_id = p_chapter_id)
  )
  SELECT
    (SELECT count(*) FROM current) AS total_members,
    (SELECT count(*) FROM current WHERE rider_id NOT IN (SELECT rider_id FROM prior)) AS new_members,
    (SELECT count(*) FROM current WHERE rider_id IN (SELECT rider_id FROM prior)) AS returning_members,
    (SELECT count(*) FROM prior) AS prior_year_members;
$$;

-- 2. Event stats for a season/chapter — grouped by distance bucket
CREATE OR REPLACE FUNCTION get_report_event_stats(
  p_season INT,
  p_chapter_id UUID DEFAULT NULL
)
RETURNS TABLE(
  distance_bucket TEXT,
  event_count BIGINT,
  total_riders BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    CASE
      WHEN e.distance_km < 200 THEN 'Populaire'
      WHEN e.distance_km = 200 THEN '200'
      WHEN e.distance_km = 300 THEN '300'
      WHEN e.distance_km = 400 THEN '400'
      WHEN e.distance_km = 600 THEN '600'
      WHEN e.distance_km >= 1000 THEN '1000+'
      ELSE 'Other'
    END AS distance_bucket,
    count(DISTINCT e.id) AS event_count,
    count(DISTINCT r.rider_id) AS total_riders
  FROM events e
  LEFT JOIN results r ON r.event_id = e.id AND r.status = 'finished'
  WHERE e.season = p_season
    AND e.status IN ('completed', 'submitted')
    AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id)
  GROUP BY 1
  ORDER BY min(e.distance_km);
$$;

-- 3. Participation stats (finishes, DNF, DNS, etc.)
CREATE OR REPLACE FUNCTION get_report_participation_stats(
  p_season INT,
  p_chapter_id UUID DEFAULT NULL
)
RETURNS TABLE(
  unique_riders BIGINT,
  total_finishes BIGINT,
  total_dnf BIGINT,
  total_dns BIGINT,
  total_otl BIGINT,
  total_km BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    count(DISTINCT CASE WHEN r.status = 'finished' THEN r.rider_id END) AS unique_riders,
    count(*) FILTER (WHERE r.status = 'finished') AS total_finishes,
    count(*) FILTER (WHERE r.status = 'dnf') AS total_dnf,
    count(*) FILTER (WHERE r.status = 'dns') AS total_dns,
    count(*) FILTER (WHERE r.status = 'otl') AS total_otl,
    coalesce(sum(r.distance_km) FILTER (WHERE r.status = 'finished'), 0) AS total_km
  FROM results r
  JOIN events e ON e.id = r.event_id
  WHERE r.season = p_season
    AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id);
$$;

-- 4. Top riders by events completed and distance for a season/chapter
CREATE OR REPLACE FUNCTION get_report_top_riders(
  p_season INT,
  p_chapter_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  rider_id UUID,
  first_name TEXT,
  last_name TEXT,
  events_finished BIGINT,
  total_km BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    rd.id AS rider_id,
    rd.first_name,
    rd.last_name,
    count(*) AS events_finished,
    sum(r.distance_km) AS total_km
  FROM results r
  JOIN events e ON e.id = r.event_id
  JOIN riders rd ON rd.id = r.rider_id
  WHERE r.season = p_season
    AND r.status = 'finished'
    AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id)
  GROUP BY rd.id, rd.first_name, rd.last_name
  ORDER BY total_km DESC, events_finished DESC
  LIMIT p_limit;
$$;

-- 5. Year-over-year summary (last 5 seasons)
CREATE OR REPLACE FUNCTION get_report_yoy_summary(
  p_season INT,
  p_chapter_id UUID DEFAULT NULL
)
RETURNS TABLE(
  season INT,
  members BIGINT,
  events BIGINT,
  riders BIGINT,
  total_km BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    s.season,
    (SELECT count(DISTINCT rm.rider_id)
     FROM rider_memberships rm
     WHERE rm.season = s.season
       AND (p_chapter_id IS NULL OR rm.chapter_id = p_chapter_id)
    ) AS members,
    (SELECT count(DISTINCT e.id)
     FROM events e
     WHERE e.season = s.season
       AND e.status IN ('completed', 'submitted')
       AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id)
    ) AS events,
    (SELECT count(DISTINCT r.rider_id)
     FROM results r
     JOIN events e ON e.id = r.event_id
     WHERE r.season = s.season
       AND r.status = 'finished'
       AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id)
    ) AS riders,
    (SELECT coalesce(sum(r.distance_km), 0)
     FROM results r
     JOIN events e ON e.id = r.event_id
     WHERE r.season = s.season
       AND r.status = 'finished'
       AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id)
    ) AS total_km
  FROM generate_series(p_season - 4, p_season) AS s(season)
  ORDER BY s.season DESC;
$$;

-- 6. Riders with results but no membership for a season/chapter
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
    AND rd.id NOT IN (
      SELECT rm.rider_id
      FROM rider_memberships rm
      WHERE rm.season = p_season
        AND (p_chapter_id IS NULL OR rm.chapter_id = p_chapter_id)
    )
  ORDER BY rd.last_name, rd.first_name;
$$;

-- Add rider_number column: a permanent sequential number assigned to each rider
-- based on their first qualifying event participation.

-- 1a. Add column
ALTER TABLE riders ADD COLUMN rider_number INTEGER UNIQUE;

-- 1b. Backfill existing riders
-- A "qualifying event" = any result where status != 'dns'
-- Ties broken by riders.created_at
WITH first_event AS (
  SELECT r.rider_id, MIN(e.event_date) AS first_event_date
  FROM results r
  JOIN events e ON r.event_id = e.id
  WHERE r.status != 'dns'
  GROUP BY r.rider_id
),
ranked AS (
  SELECT fe.rider_id,
    ROW_NUMBER() OVER (ORDER BY fe.first_event_date, ri.created_at) AS rn
  FROM first_event fe
  JOIN riders ri ON fe.rider_id = ri.id
)
UPDATE riders SET rider_number = ranked.rn
FROM ranked WHERE riders.id = ranked.rider_id;

-- 1c. Auto-assign trigger for new results
-- Uses MAX(rider_number) + 1 to assign the next available number.
-- Covers all code paths: single create, bulk import, rider self-submission.
CREATE OR REPLACE FUNCTION assign_rider_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != 'dns' THEN
    IF (SELECT rider_number FROM riders WHERE id = NEW.rider_id) IS NULL THEN
      UPDATE riders
      SET rider_number = COALESCE((SELECT MAX(rider_number) FROM riders), 0) + 1
      WHERE id = NEW.rider_id AND rider_number IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_assign_rider_number
  AFTER INSERT OR UPDATE OF status ON results
  FOR EACH ROW EXECUTE FUNCTION assign_rider_number();

-- 1d. Update public_riders view to include rider_number
DROP VIEW IF EXISTS public_riders;
CREATE VIEW public_riders WITH (security_barrier = true) AS
SELECT id, slug, first_name, last_name, gender, rider_number, created_at, updated_at
FROM riders;
GRANT SELECT ON public_riders TO anon, authenticated;

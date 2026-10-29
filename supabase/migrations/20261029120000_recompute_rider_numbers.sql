-- Recompute rider numbers once, and revoke numbers that no longer have a
-- qualifying result behind them.
--
-- Numbers drifted from the documented rule (sequential by first qualifying
-- ride date) through merges, late imports, and results later corrected to dns
-- or deleted. Old-to-new mapping: docs/rider-number-recompute-2026-10-29.csv.

-- A. One-time recompute --------------------------------------------------

-- Capture old numbers: they are the third sort key (same-day ties keep their
-- existing relative order) and are cleared before the ranking is applied.
CREATE TEMP TABLE old_numbers ON COMMIT DROP AS
  SELECT id, rider_number FROM riders;

UPDATE riders SET rider_number = NULL;

WITH fe AS (
  SELECT r.rider_id, MIN(e.event_date) AS first_date
  FROM results r JOIN events e ON e.id = r.event_id
  WHERE r.status <> 'dns' GROUP BY r.rider_id
), ranked AS (
  SELECT ri.id, ROW_NUMBER() OVER (ORDER BY fe.first_date, ri.created_at, old.rider_number) AS rn
  FROM riders ri
  JOIN fe ON fe.rider_id = ri.id
  JOIN old_numbers old ON old.id = ri.id
)
UPDATE riders SET rider_number = ranked.rn FROM ranked WHERE riders.id = ranked.id;

SELECT setval(
  'rider_number_seq',
  GREATEST(COALESCE(MAX(rider_number), 1), 1),
  MAX(rider_number) IS NOT NULL
) FROM riders;

-- B. Revocation ----------------------------------------------------------

CREATE OR REPLACE FUNCTION revoke_rider_number()
RETURNS TRIGGER AS $$
BEGIN
  -- AFTER trigger: the table already reflects the change.
  IF NOT EXISTS (
    SELECT 1 FROM results WHERE rider_id = OLD.rider_id AND status <> 'dns'
  ) THEN
    UPDATE riders SET rider_number = NULL
    WHERE id = OLD.rider_id AND rider_number IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_revoke_rider_number ON results;
CREATE TRIGGER trg_revoke_rider_number
  AFTER UPDATE OF status, rider_id OR DELETE ON results
  FOR EACH ROW EXECUTE FUNCTION revoke_rider_number();

-- Also assign when a result is moved to another rider.
DROP TRIGGER IF EXISTS trg_assign_rider_number ON results;
CREATE TRIGGER trg_assign_rider_number
  AFTER INSERT OR UPDATE OF status, rider_id ON results
  FOR EACH ROW EXECUTE FUNCTION assign_rider_number();

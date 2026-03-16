-- Add member_since column to riders
ALTER TABLE riders ADD COLUMN member_since INTEGER;

-- Populate from earliest result season or rider_membership season
UPDATE riders SET member_since = earliest.year
FROM (
  SELECT rider_id, MIN(year) AS year FROM (
    SELECT rider_id, season AS year FROM results
    UNION ALL
    SELECT rider_id, season AS year FROM rider_memberships
  ) combined
  GROUP BY rider_id
) earliest
WHERE riders.id = earliest.rider_id;

-- Auto-update member_since when results or memberships are inserted
CREATE OR REPLACE FUNCTION update_member_since()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE riders
  SET member_since = NEW.season
  WHERE id = NEW.rider_id
    AND (member_since IS NULL OR member_since > NEW.season);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_results_member_since
  AFTER INSERT ON results
  FOR EACH ROW
  EXECUTE FUNCTION update_member_since();

CREATE TRIGGER trg_rider_memberships_member_since
  AFTER INSERT ON rider_memberships
  FOR EACH ROW
  EXECUTE FUNCTION update_member_since();

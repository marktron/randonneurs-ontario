-- Add rider_awards table for season-scoped awards (e.g., Super Randonneur)
-- Season-scoped awards are earned across a full season rather than for a single result.

-- ============================================
-- 1. Create rider_awards table
-- ============================================
CREATE TABLE rider_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  award_id UUID NOT NULL REFERENCES awards(id),
  season INT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rider_awards_rider ON rider_awards(rider_id);
CREATE INDEX idx_rider_awards_award ON rider_awards(award_id);
CREATE INDEX idx_rider_awards_season ON rider_awards(season);

-- Add updated_at trigger
CREATE TRIGGER update_rider_awards_updated_at BEFORE UPDATE ON rider_awards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. Repurpose awards.award_type as scope discriminator
-- ============================================

-- Set 'season' for super-randonneur
UPDATE awards SET award_type = 'season' WHERE slug = 'super-randonneur';

-- Set 'result' for all others (currently NULL)
UPDATE awards SET award_type = 'result' WHERE award_type IS NULL OR award_type != 'season';

-- Add NOT NULL constraint, CHECK constraint, and DEFAULT
ALTER TABLE awards
  ALTER COLUMN award_type SET NOT NULL,
  ALTER COLUMN award_type SET DEFAULT 'result',
  ADD CONSTRAINT awards_award_type_check CHECK (award_type IN ('result', 'season'));

-- ============================================
-- 3. RLS policies
-- ============================================
ALTER TABLE rider_awards ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "rider_awards_select_public" ON rider_awards
  FOR SELECT USING (true);

-- Admin-only insert (not chapter_admin, since season awards may span chapters)
CREATE POLICY "rider_awards_insert_admin" ON rider_awards
  FOR INSERT WITH CHECK (is_admin());

-- Admin-only update
CREATE POLICY "rider_awards_update_admin" ON rider_awards
  FOR UPDATE USING (is_admin());

-- Admin-only delete
CREATE POLICY "rider_awards_delete_admin" ON rider_awards
  FOR DELETE USING (is_admin());

-- ============================================
-- 4. Migrate SR data from result_awards to rider_awards
-- ============================================
INSERT INTO rider_awards (rider_id, award_id, season)
SELECT DISTINCT res.rider_id, ra.award_id, res.season
FROM result_awards ra
JOIN results res ON ra.result_id = res.id
JOIN awards a ON ra.award_id = a.id
WHERE a.slug = 'super-randonneur' AND res.season IS NOT NULL;

-- ============================================
-- 5. Delete SR rows from result_awards
-- ============================================
DELETE FROM result_awards
WHERE award_id IN (SELECT id FROM awards WHERE slug = 'super-randonneur');

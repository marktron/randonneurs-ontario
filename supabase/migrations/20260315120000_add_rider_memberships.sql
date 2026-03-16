-- Section 1: Add columns to riders
ALTER TABLE riders
  ADD COLUMN ccn_id INTEGER UNIQUE,
  ADD COLUMN birth_year INTEGER;

-- Section 2: Create rider_memberships table
CREATE TABLE rider_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  chapter_id UUID REFERENCES chapters(id),
  membership_type TEXT NOT NULL CHECK (membership_type IN (
    'Individual Membership',
    'Additional Family Member',
    'Family Membership > PRIMARY FAMILY MEMBER',
    'Trial Member',
    'Day Rider'
  )),
  city TEXT,
  province TEXT,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_rider_memberships_rider_season
  ON rider_memberships(rider_id, season);

CREATE INDEX idx_rider_memberships_season
  ON rider_memberships(season);

CREATE TRIGGER set_rider_memberships_updated_at
  BEFORE UPDATE ON rider_memberships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Section 3: RLS policies
ALTER TABLE rider_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rider_memberships_select_public" ON rider_memberships
  FOR SELECT USING (true);

CREATE POLICY "rider_memberships_insert_admin" ON rider_memberships
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "rider_memberships_update_admin" ON rider_memberships
  FOR UPDATE USING (is_admin());

CREATE POLICY "rider_memberships_delete_admin" ON rider_memberships
  FOR DELETE USING (is_admin());

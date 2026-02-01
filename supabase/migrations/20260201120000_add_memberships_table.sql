-- Add memberships table to track CCN membership status
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season INT NOT NULL,
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  membership_id INT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'Individual Membership',
    'Additional Family Member',
    'Family Membership > PRIMARY FAMILY MEMBER',
    'Trial Member'
  )),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: one membership per rider per season
CREATE UNIQUE INDEX idx_memberships_rider_season ON memberships(rider_id, season);

-- Index for lookups
CREATE INDEX idx_memberships_season ON memberships(season);

-- Trigger for updated_at
CREATE TRIGGER set_memberships_updated_at
  BEFORE UPDATE ON memberships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

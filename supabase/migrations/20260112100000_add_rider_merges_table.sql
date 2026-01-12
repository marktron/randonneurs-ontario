-- Tracks when riders are merged during registration
-- This allows returning riders (whose historical records don't have email)
-- to link their registration to their existing rider record

CREATE TABLE rider_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,

  -- What the user submitted during registration
  submitted_first_name TEXT NOT NULL,
  submitted_last_name TEXT NOT NULL,
  submitted_email TEXT NOT NULL,

  -- What the rider record had before (for audit/rollback)
  previous_first_name TEXT,
  previous_last_name TEXT,
  previous_email TEXT,

  -- Context
  merged_at TIMESTAMPTZ DEFAULT now(),
  merge_source TEXT NOT NULL CHECK (merge_source IN ('registration', 'admin'))
);

-- Index for looking up merge history by rider
CREATE INDEX idx_rider_merges_rider_id ON rider_merges(rider_id);

-- RLS policies
ALTER TABLE rider_merges ENABLE ROW LEVEL SECURITY;

-- Only admins can view merge history
CREATE POLICY "Admins can view rider merges"
  ON rider_merges FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins WHERE admins.id = auth.uid()
    )
  );

-- Service role can insert (used by server actions)
CREATE POLICY "Service role can insert rider merges"
  ON rider_merges FOR INSERT
  TO service_role
  WITH CHECK (true);

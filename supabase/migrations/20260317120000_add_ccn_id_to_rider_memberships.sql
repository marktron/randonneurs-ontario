-- Add CCN registration ID to rider_memberships
-- This is the per-season registration ID from the CCN API (e.g., 11671361)
-- Different from riders.ccn_id which is the person-level identity ID
ALTER TABLE rider_memberships
  ADD COLUMN ccn_id INTEGER UNIQUE;

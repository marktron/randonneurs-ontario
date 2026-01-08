-- Add a generated column for full name search
ALTER TABLE riders
ADD COLUMN full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED;

-- Index for faster search
CREATE INDEX idx_riders_full_name ON riders (full_name);

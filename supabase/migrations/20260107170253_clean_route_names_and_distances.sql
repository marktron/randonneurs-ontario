-- Step 1: Populate distance_km from slug patterns (e.g., "alexandria-300km" or "alexandria-300")
UPDATE routes
SET distance_km = (regexp_match(slug, '-(\d+)(?:km)?$'))[1]::integer
WHERE distance_km IS NULL
  AND slug ~ '-\d+(?:km)?$';

-- Step 2: Populate distance_km from name patterns for any remaining NULL values
UPDATE routes
SET distance_km = (regexp_match(name, '\s+(\d+)[kK]?$'))[1]::integer
WHERE distance_km IS NULL
  AND name ~ '\s+\d+[kK]?$';

-- Step 3: Remove distance suffixes from route names
-- Handles patterns like:
--   "Alexandria 300" → "Alexandria"
--   "Westport 400K" → "Westport"
-- Using same rules as events migration
UPDATE routes
SET name = TRIM(regexp_replace(name, '\s+\d+[kK]?\s*(\([^)]+\))?$', ' \1'))
WHERE name ~ '\s+\d+[kK]?(\s*\([^)]+\))?$';

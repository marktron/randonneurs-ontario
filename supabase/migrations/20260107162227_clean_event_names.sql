-- Remove distance suffixes from event names
-- Handles patterns like:
--   "Falling Leaves 300" → "Falling Leaves"
--   "Westport 400K" → "Westport"
--   "Markham Keswick 200 (Devil Week)" → "Markham Keswick (Devil Week)"
-- Preserves "Old 400" and "Old 600" which are actual event names

UPDATE events
SET name = TRIM(regexp_replace(name, '\s+\d+[kK]?\s*(\([^)]+\))?$', ' \1'))
WHERE name ~ '\s+\d+[kK]?(\s*\([^)]+\))?$'
  AND name NOT LIKE 'Old 400%'
  AND name NOT LIKE 'Old 600%';

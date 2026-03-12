-- Migrate Ontario Explorer, O-5000, and Ontario Rover to season-scoped awards

-- 1. Set award_type to 'season'
UPDATE awards SET award_type = 'season'
WHERE slug IN ('ontario-explorer', 'o-5000', 'ontario-rover');

-- 2. Migrate data to rider_awards
INSERT INTO rider_awards (rider_id, award_id, season)
SELECT res.rider_id, ra.award_id, res.season
FROM result_awards ra
JOIN results res ON ra.result_id = res.id
JOIN awards a ON ra.award_id = a.id
WHERE a.slug IN ('ontario-explorer', 'o-5000', 'ontario-rover')
  AND res.season IS NOT NULL;

-- 3. Delete from result_awards
DELETE FROM result_awards
WHERE award_id IN (
  SELECT id FROM awards WHERE slug IN ('ontario-explorer', 'o-5000', 'ontario-rover')
);

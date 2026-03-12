-- Migrate Randonneur 5000 and Randonneur 10000 from result_awards to rider_awards
-- These are season-scoped awards (earned across multi-year periods, not for a single result)

-- 1. Set award_type to 'season'
UPDATE awards SET award_type = 'season' WHERE slug IN ('r-5000', 'r-10000');

-- 2. Migrate data to rider_awards (one row per original result_award)
INSERT INTO rider_awards (rider_id, award_id, season)
SELECT res.rider_id, ra.award_id, res.season
FROM result_awards ra
JOIN results res ON ra.result_id = res.id
JOIN awards a ON ra.award_id = a.id
WHERE a.slug IN ('r-5000', 'r-10000') AND res.season IS NOT NULL;

-- 3. Delete from result_awards
DELETE FROM result_awards
WHERE award_id IN (SELECT id FROM awards WHERE slug IN ('r-5000', 'r-10000'));

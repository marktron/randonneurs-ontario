-- Draw rider numbers from a sequence instead of MAX(rider_number) + 1.
--
-- MAX + 1 reissued a retired number whenever the highest-numbered rider was
-- deleted, and was racy under concurrent inserts. A sequence never hands out
-- the same value twice, so a number that has been retired (merged away or
-- deleted) is never reused. Gaps in rider numbers are expected.

CREATE SEQUENCE IF NOT EXISTS rider_number_seq;

-- Seed so the next value is strictly greater than the current max.
-- With no numbers yet, is_called = false makes the first nextval return 1.
SELECT setval(
  'rider_number_seq',
  GREATEST(COALESCE(MAX(rider_number), 1), 1),
  MAX(rider_number) IS NOT NULL
) FROM riders;

-- CREATE OR REPLACE resets function attributes, so search_path is restated.
CREATE OR REPLACE FUNCTION assign_rider_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != 'dns' THEN
    IF (SELECT rider_number FROM riders WHERE id = NEW.rider_id) IS NULL THEN
      UPDATE riders
      SET rider_number = nextval('rider_number_seq')
      WHERE id = NEW.rider_id AND rider_number IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

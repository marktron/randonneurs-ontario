-- Auto-assign the First Brevet award to a rider's earliest finished `brevet` result.
--
-- The invariant: at most one `first-brevet` row in `result_awards` per rider, and
-- it always points at that rider's earliest finished brevet (status='finished',
-- events.event_type='brevet'). Reconciled by trigger on every INSERT/UPDATE/DELETE
-- to `results`. Backfilled once at the end of this migration.

-- Helper: reconcile the First Brevet award for one rider. Idempotent.
CREATE OR REPLACE FUNCTION reconcile_first_brevet_for_rider(p_rider_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_award_id   UUID;
  v_target_rid UUID;
BEGIN
  IF p_rider_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_award_id FROM awards WHERE slug = 'first-brevet';
  IF v_award_id IS NULL THEN
    RETURN;
  END IF;

  -- Earliest finished brevet for this rider. Tie-break on results.id for stability.
  SELECT r.id INTO v_target_rid
  FROM results r
  JOIN events  e ON e.id = r.event_id
  WHERE r.rider_id  = p_rider_id
    AND r.status    = 'finished'
    AND e.event_type = 'brevet'
  ORDER BY e.event_date ASC, r.id ASC
  LIMIT 1;

  IF v_target_rid IS NULL THEN
    -- No qualifying result → drop any stale award rows for this rider.
    DELETE FROM result_awards ra
    USING results r
    WHERE ra.award_id  = v_award_id
      AND ra.result_id = r.id
      AND r.rider_id   = p_rider_id;
    RETURN;
  END IF;

  -- Drop First Brevet rows on the wrong result for this rider.
  DELETE FROM result_awards ra
  USING results r
  WHERE ra.award_id  = v_award_id
    AND ra.result_id = r.id
    AND r.rider_id   = p_rider_id
    AND ra.result_id <> v_target_rid;

  -- Ensure the correct result has the award.
  INSERT INTO result_awards (result_id, award_id)
  VALUES (v_target_rid, v_award_id)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Trigger function: dispatch reconciliation when results change.
CREATE OR REPLACE FUNCTION trg_results_reconcile_first_brevet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM reconcile_first_brevet_for_rider(OLD.rider_id);
    RETURN OLD;
  END IF;

  PERFORM reconcile_first_brevet_for_rider(NEW.rider_id);

  -- Cover rider_id changes (rare — manual fixes / merges).
  IF TG_OP = 'UPDATE' AND NEW.rider_id IS DISTINCT FROM OLD.rider_id THEN
    PERFORM reconcile_first_brevet_for_rider(OLD.rider_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_results_first_brevet ON results;
CREATE TRIGGER trg_results_first_brevet
AFTER INSERT OR UPDATE OF status, event_id, rider_id OR DELETE
ON results
FOR EACH ROW
EXECUTE FUNCTION trg_results_reconcile_first_brevet();

-- A unique index on `result_awards` can't span the join to `results.rider_id`,
-- so enforce "one First Brevet per rider" via a BEFORE INSERT trigger.
CREATE OR REPLACE FUNCTION trg_result_awards_block_duplicate_first_brevet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_brevet_id UUID;
  v_new_rider_id    UUID;
  v_existing_count  INT;
BEGIN
  SELECT id INTO v_first_brevet_id FROM awards WHERE slug = 'first-brevet';
  IF v_first_brevet_id IS NULL OR NEW.award_id <> v_first_brevet_id THEN
    RETURN NEW;
  END IF;

  SELECT rider_id INTO v_new_rider_id FROM results WHERE id = NEW.result_id;
  IF v_new_rider_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM result_awards ra
  JOIN results r ON r.id = ra.result_id
  WHERE ra.award_id  = v_first_brevet_id
    AND r.rider_id   = v_new_rider_id
    AND ra.result_id <> NEW.result_id;

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'duplicate First Brevet award for rider %', v_new_rider_id
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_result_awards_unique_first_brevet ON result_awards;
CREATE TRIGGER trg_result_awards_unique_first_brevet
BEFORE INSERT ON result_awards
FOR EACH ROW
EXECUTE FUNCTION trg_result_awards_block_duplicate_first_brevet();

-- One-time backfill: reconcile every rider that has at least one result.
DO $$
DECLARE
  r_id UUID;
BEGIN
  FOR r_id IN SELECT DISTINCT rider_id FROM results LOOP
    PERFORM reconcile_first_brevet_for_rider(r_id);
  END LOOP;
END $$;

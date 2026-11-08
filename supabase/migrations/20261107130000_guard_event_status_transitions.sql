-- Guard the two event-status rules that protect data outside the app.
--
-- The full lifecycle table is EVENT_STATUS_TRANSITIONS in
-- lib/events/status.ts and every admin path checks it in TypeScript. Two of
-- its rules also matter to anything that writes the table directly (SQL
-- console, scripts, the service role), so they are enforced here too:
--
--   1. Nothing leaves 'submitted'. Those results have been filed with the ACP
--      (homologated); cancelling would delete them and rescheduling would
--      reopen them.
--   2. Nothing moves to 'draft' unless it is already a draft. Drafts are
--      hidden from the public by RLS, so a published event going back to
--      draft would vanish from the public site.
--
-- Deliberate exception: 'submitted' -> 'completed' is allowed at the DB
-- layer. submitEventResults (lib/actions/events.ts) claims the event as
-- submitted before it sends the ACP results email, and if the send fails it
-- rolls the claim back with
--   UPDATE events SET status = 'completed' WHERE id = ... AND status = 'submitted'.
-- The TypeScript table still forbids submitted -> completed for every admin
-- path, so in practice only that rollback uses it.
--
-- The rest of the table (e.g. cancelled -> completed being refused) lives in
-- TypeScript only. Raised as check_violation (23514), like events_status_check.

CREATE OR REPLACE FUNCTION enforce_event_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'submitted' AND NEW.status NOT IN ('submitted', 'completed') THEN
    RAISE EXCEPTION 'Event % has submitted results; its status cannot change from submitted to %',
      OLD.id, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'draft' AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'Event % is published; its status cannot change from % to draft',
      OLD.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_status_transition ON events;
CREATE TRIGGER trg_enforce_event_status_transition
BEFORE UPDATE OF status
ON events
FOR EACH ROW
EXECUTE FUNCTION enforce_event_status_transition();

-- Rider accounts follow-up: deleteAdminUser (lib/actions/admin-users.ts) was
-- failing with a foreign-key violation for any admin who had ever written an
-- audit row, because audit_logs.admin_id -> admins(id) had no ON DELETE
-- clause. We want to keep audit history when an admin is deleted, not cascade
-- or block the delete.
--
-- Actor model going forward:
--   - actor_user_id (no FK) is the durable actor id. It survives the actor's
--     admins/auth.users rows being deleted, because it is not a foreign key.
--   - actor_label is a durable display-name snapshot taken at write time
--     (the admin's name; NULL for rider-authored rows, which already carry
--     their own identity via the riders/entity_id relationship).
--   - admin_id keeps its FK to admins(id), now ON DELETE SET NULL, purely so
--     existing joins to admins() for a *live* admin keep working. Once an
--     admin is deleted, admin_id goes NULL and the UI falls back to
--     actor_label.
--
-- Because of audit_logs_actor_check (admin_id IS NOT NULL OR actor_user_id IS
-- NOT NULL), simply switching the FK to SET NULL is not safe on its own: a
-- row written with admin_id set and actor_user_id left NULL (as every row
-- before this migration was, and as any future writer that bypasses
-- lib/audit-log.ts might still do) would fail that CHECK the moment its
-- admin_id is nulled out by the FK action. logAuditEvent is updated (in this
-- same change) to always populate actor_user_id := adminId going forward, so
-- new rows are self-sufficient. For old rows, and as a safety net for any
-- writer that doesn't go through logAuditEvent, a BEFORE UPDATE trigger
-- copies OLD.admin_id into actor_user_id whenever an UPDATE would otherwise
-- null out admin_id and leave actor_user_id empty. (It cannot also backfill
-- actor_label at that point: the admin row is already gone from the admins
-- table by the time the ON DELETE SET NULL action fires, in the same
-- transaction. A row that reaches the trigger without actor_label already
-- set keeps actor_label NULL — the UI's actor_user_id-present fallback of
-- "Rider" is wrong for it, but this is understood to only affect rows
-- inserted directly against the table rather than through logAuditEvent.)

ALTER TABLE audit_logs ADD COLUMN actor_label TEXT;

COMMENT ON COLUMN audit_logs.actor_user_id IS
  'Durable actor id (no FK). Populated for both admin- and rider-authored rows so the row survives the actor record being deleted.';
COMMENT ON COLUMN audit_logs.actor_label IS
  'Durable display-name snapshot taken at write time (admin name; NULL for rider-authored rows). Used once admin_id/admins is no longer available.';

-- Backfill: every existing admin-authored row gets actor_user_id = admin_id
-- (admins.id IS the auth user id) and actor_label = the admin's current name.
UPDATE audit_logs SET actor_user_id = admin_id WHERE actor_user_id IS NULL AND admin_id IS NOT NULL;
UPDATE audit_logs a SET actor_label = ad.name FROM admins ad WHERE a.admin_id = ad.id AND a.actor_label IS NULL;

-- Safety net for rows that reach the FK's SET NULL action without already
-- having actor_user_id populated (see comment above).
CREATE OR REPLACE FUNCTION audit_logs_preserve_actor_on_admin_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.admin_id IS NULL AND OLD.admin_id IS NOT NULL AND NEW.actor_user_id IS NULL THEN
    NEW.actor_user_id := OLD.admin_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_preserve_actor_before_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_preserve_actor_on_admin_delete();

-- Drop and re-add the admin_id FK as ON DELETE SET NULL. Find the constraint
-- by name rather than assuming it (though it does happen to already be
-- audit_logs_admin_id_fkey, Postgres's default naming for this column).
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'audit_logs'::regclass AND contype = 'f';

  EXECUTE format('ALTER TABLE audit_logs DROP CONSTRAINT %I', fk_name);
END $$;

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL;

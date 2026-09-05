-- Rider accounts, phase 1: riders can now act on their own records, so an
-- audit row needs an actor that is not an admin.
-- Spec: docs/superpowers/specs/2026-09-04-rider-accounts-design.md §4.2

ALTER TABLE audit_logs ALTER COLUMN admin_id DROP NOT NULL;
ALTER TABLE audit_logs ADD COLUMN actor_user_id UUID;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_check CHECK (admin_id IS NOT NULL OR actor_user_id IS NOT NULL);

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_action_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check CHECK (action IN (
  'create', 'update', 'delete', 'status_change', 'merge', 'submit',
  'account_link', 'account_unlink', 'account_delete', 'approve', 'reject'
));

-- Also admits 'registration' and 'award', which lib/audit-log.ts has been
-- sending (and losing) since they were added to the TypeScript union.
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_entity_type_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_type_check CHECK (entity_type IN (
  'event', 'route', 'rider', 'result', 'registration', 'page', 'admin_user',
  'news', 'navigation', 'award', 'external_result'
));

CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs(actor_user_id) WHERE actor_user_id IS NOT NULL;

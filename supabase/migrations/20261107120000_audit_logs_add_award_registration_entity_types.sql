-- Add 'registration' and 'award' to the entity_type CHECK constraint on audit_logs.
-- lib/audit-log.ts already allowed both, and callers in lib/actions/awards.ts and
-- lib/actions/results.ts log them, but the constraint rejected every such insert.
alter table audit_logs drop constraint audit_logs_entity_type_check;
alter table audit_logs add constraint audit_logs_entity_type_check
  check (entity_type in ('event', 'route', 'rider', 'result', 'registration', 'page', 'admin_user', 'news', 'navigation', 'award'));

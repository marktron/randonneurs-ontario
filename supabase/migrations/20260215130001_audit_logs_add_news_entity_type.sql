-- Add 'news' to the entity_type CHECK constraint on audit_logs
alter table audit_logs drop constraint audit_logs_entity_type_check;
alter table audit_logs add constraint audit_logs_entity_type_check
  check (entity_type in ('event', 'route', 'rider', 'result', 'page', 'admin_user', 'news'));

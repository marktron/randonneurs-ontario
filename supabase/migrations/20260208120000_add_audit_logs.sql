-- Audit log table for tracking admin actions
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admins(id),
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'status_change', 'merge', 'submit')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('event', 'route', 'rider', 'result', 'page', 'admin_user')),
  entity_id TEXT,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient listing by most recent
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "audit_logs_select_admin" ON audit_logs
  FOR SELECT USING (is_admin());

-- Only service role can insert (server actions use service role key)
CREATE POLICY "audit_logs_insert_service" ON audit_logs
  FOR INSERT TO service_role
  WITH CHECK (true);

-- No UPDATE or DELETE policies: logs are immutable

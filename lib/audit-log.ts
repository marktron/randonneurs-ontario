import { getSupabaseAdmin } from '@/lib/supabase-server'

export type AuditAction = 'create' | 'update' | 'delete' | 'status_change' | 'merge' | 'submit'
/**
 * Every entity type the audit_logs CHECK constraint must accept. The real-DB
 * test tests/integration-real/audit-log-entity-types.test.ts inserts one row
 * per value, so adding a type here without a migration fails CI.
 */
export const AUDIT_ENTITY_TYPES = [
  'event',
  'route',
  'rider',
  'result',
  'registration',
  'page',
  'admin_user',
  'news',
  'navigation',
  'award',
] as const
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]

interface AuditLogParams {
  adminId: string
  action: AuditAction
  entityType: AuditEntityType
  entityId?: string | null
  description: string
}

/**
 * Log an admin action to the audit_logs table.
 * Fire-and-forget: errors are logged but never fail the parent action.
 */
export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from('audit_logs')
      .insert({
        admin_id: params.adminId,
        action: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId ?? null,
        description: params.description,
      })

    if (error) {
      console.error('Failed to write audit log:', error)
    }
  } catch (err) {
    console.error('Failed to write audit log:', err)
  }
}

import { getSupabaseAdmin } from '@/lib/supabase-server'

export type AuditAction = 'create' | 'update' | 'delete' | 'status_change' | 'merge' | 'submit'
export type AuditEntityType =
  | 'event'
  | 'route'
  | 'rider'
  | 'result'
  | 'page'
  | 'admin_user'
  | 'news'

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

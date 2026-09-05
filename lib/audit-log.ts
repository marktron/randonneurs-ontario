import { getSupabaseAdmin } from '@/lib/supabase-server'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'merge'
  | 'submit'
  | 'account_link'
  | 'account_unlink'
  | 'account_delete'
  | 'approve'
  | 'reject'

export type AuditEntityType =
  | 'event'
  | 'route'
  | 'rider'
  | 'result'
  | 'registration'
  | 'page'
  | 'admin_user'
  | 'news'
  | 'navigation'
  | 'award'
  | 'external_result'

interface AuditLogParams {
  adminId: string
  /** Display name of the acting admin, snapshotted at write time. */
  actorLabel?: string
  action: AuditAction
  entityType: AuditEntityType
  entityId?: string | null
  description: string
}

interface RiderAuditLogParams {
  /** auth.users.id of the rider who performed the action */
  actorUserId: string
  action: AuditAction
  entityType: AuditEntityType
  entityId?: string | null
  description: string
}

async function writeAuditRow(row: {
  admin_id: string | null
  actor_user_id: string | null
  actor_label?: string | null
  action: AuditAction
  entity_type: AuditEntityType
  entity_id: string | null
  description: string
}): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().from('audit_logs').insert(row)
    if (error) console.error('Failed to write audit log:', error)
  } catch (err) {
    console.error('Failed to write audit log:', err)
  }
}

/**
 * Log an admin action to the audit_logs table.
 * Fire-and-forget: errors are logged but never fail the parent action.
 */
export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  await writeAuditRow({
    admin_id: params.adminId,
    // admins.id IS the auth user id, so this is the same durable id whether
    // the row was written for an admin or a rider. Populating it here (not
    // just in the migration backfill) means new rows survive the admin
    // being deleted without depending on the admin_id -> actor_user_id
    // safety-net trigger.
    actor_user_id: params.adminId,
    actor_label: params.actorLabel ?? null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    description: params.description,
  })
}

/**
 * Log an action a signed-in rider performed on their own records.
 * Same fire-and-forget contract as logAuditEvent.
 */
export async function logRiderAction(params: RiderAuditLogParams): Promise<void> {
  await writeAuditRow({
    admin_id: null,
    actor_user_id: params.actorUserId,
    actor_label: null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    description: params.description,
  })
}

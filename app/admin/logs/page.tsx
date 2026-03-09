import { requireAdmin } from '@/lib/auth/get-admin'
import { isFullAdmin } from '@/lib/auth/roles'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { AuditLogTabs } from './audit-log-tabs'

export interface AuditLogRow {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  description: string
  created_at: string
  admins: {
    name: string
  } | null
}

export interface RiderMergeRow {
  id: string
  rider_id: string
  submitted_first_name: string
  submitted_last_name: string
  submitted_email: string
  previous_first_name: string | null
  previous_last_name: string | null
  previous_email: string | null
  merge_source: string
  merged_at: string
  riders: {
    first_name: string
    last_name: string
  } | null
}

export default async function AuditLogsPage() {
  const admin = await requireAdmin()

  if (!isFullAdmin(admin.role)) {
    redirect('/admin')
  }

  const [{ data: logs }, { data: merges }] = await Promise.all([
    getSupabaseAdmin()
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, description, created_at, admins (name)')
      .order('created_at', { ascending: false })
      .limit(100),
    getSupabaseAdmin()
      .from('rider_merges')
      .select(
        'id, rider_id, submitted_first_name, submitted_last_name, submitted_email, previous_first_name, previous_last_name, previous_email, merge_source, merged_at, riders (first_name, last_name)'
      )
      .order('merged_at', { ascending: false })
      .limit(100),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">Recent actions across the system</p>
      </div>

      <AuditLogTabs
        logs={(logs || []) as AuditLogRow[]}
        merges={(merges || []) as RiderMergeRow[]}
      />
    </div>
  )
}

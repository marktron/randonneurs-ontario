import { requireAdmin } from '@/lib/auth/get-admin'
import { isFullAdmin } from '@/lib/auth/roles'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface AuditLogRow {
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

const actionLabels: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  create: { label: 'Create', variant: 'default' },
  update: { label: 'Update', variant: 'secondary' },
  delete: { label: 'Delete', variant: 'destructive' },
  status_change: { label: 'Status Change', variant: 'outline' },
  merge: { label: 'Merge', variant: 'secondary' },
  submit: { label: 'Submit', variant: 'default' },
}

const entityTypeLabels: Record<string, string> = {
  event: 'Event',
  route: 'Route',
  rider: 'Rider',
  result: 'Result',
  page: 'Page',
  admin_user: 'Admin User',
  news: 'News',
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AuditLogsPage() {
  const admin = await requireAdmin()

  if (!isFullAdmin(admin.role)) {
    redirect('/admin')
  }

  const { data: logs } = await getSupabaseAdmin()
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, description, created_at, admins (name)')
    .order('created_at', { ascending: false })
    .limit(100)

  const typedLogs = (logs || []) as AuditLogRow[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">Recent admin actions across the system</p>
      </div>

      {typedLogs.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">No audit log entries yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date/Time</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {typedLogs.map((log) => {
              const actionInfo = actionLabels[log.action] || {
                label: log.action,
                variant: 'outline' as const,
              }
              return (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatDateTime(log.created_at)}
                  </TableCell>
                  <TableCell>{log.admins?.name || 'Unknown'}</TableCell>
                  <TableCell>
                    <Badge variant={actionInfo.variant}>{actionInfo.label}</Badge>
                  </TableCell>
                  <TableCell>{entityTypeLabels[log.entity_type] || log.entity_type}</TableCell>
                  <TableCell className="max-w-md truncate">{log.description}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

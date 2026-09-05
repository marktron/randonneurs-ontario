'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { LocalTime } from '@/components/admin/local-time'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AuditLogRow, RiderMergeRow } from './page'

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
  account_link: { label: 'Account linked', variant: 'default' },
  account_unlink: { label: 'Account unlinked', variant: 'secondary' },
  account_delete: { label: 'Account deleted', variant: 'destructive' },
  approve: { label: 'Approved', variant: 'default' },
  reject: { label: 'Rejected', variant: 'destructive' },
}

const entityTypeLabels: Record<string, string> = {
  event: 'Event',
  route: 'Route',
  rider: 'Rider',
  result: 'Result',
  page: 'Page',
  admin_user: 'Admin User',
  news: 'News',
  navigation: 'Navigation',
  registration: 'Registration',
  award: 'Award',
  external_result: 'External result',
}

const mergeSourceLabels: Record<string, string> = {
  registration: 'Registration',
  admin: 'Admin',
}

interface AuditLogTabsProps {
  logs: AuditLogRow[]
  merges: RiderMergeRow[]
}

export function AuditLogTabs({ logs, merges }: AuditLogTabsProps) {
  return (
    <Tabs defaultValue="admin">
      <TabsList variant="line">
        <TabsTrigger value="admin">Admin Actions</TabsTrigger>
        <TabsTrigger value="merges">
          Rider Merges
          {merges.length > 0 && (
            <span className="bg-muted text-muted-foreground ml-1.5 rounded-full px-2 py-0.5 text-xs tabular-nums">
              {merges.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="admin">
        {logs.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">No audit log entries yet.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead className="hidden sm:table-cell">Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const actionInfo = actionLabels[log.action] || {
                    label: log.action,
                    variant: 'outline' as const,
                  }
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        <LocalTime dateString={log.created_at} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {log.admins?.name ?? (log.actor_user_id ? 'Rider' : 'Unknown')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionInfo.variant}>{actionInfo.label}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {entityTypeLabels[log.entity_type] || log.entity_type}
                      </TableCell>
                      <TableCell className="max-w-md truncate">{log.description}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="merges">
        {merges.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">No rider merge entries yet.</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date/Time</TableHead>
                  <TableHead className="hidden sm:table-cell">Source</TableHead>
                  <TableHead>Current Rider</TableHead>
                  <TableHead>Submitted Name</TableHead>
                  <TableHead className="hidden md:table-cell">Previous Name</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {merges.map((merge) => {
                  const submittedName = `${merge.submitted_first_name} ${merge.submitted_last_name}`
                  const previousName =
                    merge.previous_first_name && merge.previous_last_name
                      ? `${merge.previous_first_name} ${merge.previous_last_name}`
                      : null
                  const currentName = merge.riders
                    ? `${merge.riders.first_name} ${merge.riders.last_name}`
                    : 'Unknown'
                  const nameChanged = previousName && previousName !== submittedName

                  return (
                    <TableRow key={merge.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        <LocalTime dateString={merge.merged_at} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline">
                          {mergeSourceLabels[merge.merge_source] || merge.merge_source}
                        </Badge>
                      </TableCell>
                      <TableCell>{currentName}</TableCell>
                      <TableCell className={nameChanged ? 'text-destructive font-medium' : ''}>
                        {submittedName}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{previousName || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {merge.submitted_email}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}

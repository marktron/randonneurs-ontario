import { parseLocalDate } from '@/lib/utils'
import { ClickableTableRow } from '@/components/admin/clickable-table-row'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EventStatusBadge } from '@/components/admin/event-status-badge'
import type { EventForAdminList } from '@/types/queries'

interface EventsTableProps {
  events: EventForAdminList[]
  buildEventDetailUrl: (eventId: string) => string
}

export function EventsTable({ events, buildEventDetailUrl }: EventsTableProps) {
  return (
    <div className="rounded-md border">
      <Table className="block sm:table">
        <TableHeader className="hidden sm:table-header-group">
          <TableRow>
            <TableHead>Event</TableHead>
            <TableHead className="hidden md:table-cell">Chapter</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="hidden sm:table-cell">Distance</TableHead>
            <TableHead className="hidden sm:table-cell">Riders</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="block sm:table-row-group">
          {events.length === 0 ? (
            <TableRow className="block sm:table-row">
              <TableCell
                colSpan={6}
                className="block p-4 text-center text-muted-foreground sm:table-cell sm:p-3"
              >
                No events found
              </TableCell>
            </TableRow>
          ) : (
            events.map((event) => (
              <ClickableTableRow
                key={event.id}
                href={buildEventDetailUrl(event.id)}
                className="relative block p-4 sm:table-row sm:p-0"
              >
                <TableCell className="block whitespace-normal p-0 pr-28 sm:table-cell sm:p-3 sm:pr-3">
                  <div>
                    <span className="font-medium">{event.name}</span>
                    <p className="text-sm text-muted-foreground capitalize">{event.event_type}</p>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {event.chapters?.name || '—'}
                </TableCell>
                <TableCell className="block p-0 pt-1 text-muted-foreground sm:table-cell sm:p-3 sm:text-foreground">
                  {parseLocalDate(event.event_date).toLocaleDateString('en-CA', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  <span className="sm:hidden"> · {event.distance_km} km</span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{event.distance_km} km</TableCell>
                <TableCell className="hidden sm:table-cell tabular-nums">
                  {event.rider_count ?? 0}
                </TableCell>
                <TableCell className="absolute top-4 right-4 block p-0 sm:static sm:table-cell sm:p-3">
                  <EventStatusBadge status={event.status} />
                </TableCell>
              </ClickableTableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

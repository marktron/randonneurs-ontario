import { Badge } from '@/components/ui/badge'

/** Admin status badge. Keep in sync with the status table in docs/guide.md. */
export function EventStatusBadge({ status }: { status: string | null }) {
  switch (status ?? 'scheduled') {
    case 'draft':
      return (
        <Badge variant="outline" className="border-dashed text-muted-foreground">
          Draft
        </Badge>
      )
    case 'scheduled':
      return <Badge variant="secondary">Scheduled</Badge>
    case 'completed':
      return <Badge>Completed</Badge>
    case 'submitted':
      return <Badge className="bg-green-600 hover:bg-green-600">Submitted</Badge>
    case 'cancelled':
      return <Badge variant="destructive">Cancelled</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

'use client'

import { memo, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  adminSetCheckin,
  adminDeleteCheckin,
  type AdminCheckin,
  type AdminCheckinGridRider,
} from '@/lib/actions/control-checkins'
import type { CheckinFlags } from '@/lib/brevet-card'
import { formatControlTime } from '@/lib/brmTimes'
import { toast } from 'sonner'
import Link from 'next/link'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'

export interface GridControl {
  id: string
  name: string
  distanceKm: number
  /** Preformatted Toronto-time window, e.g. "Sat 08:00 – Sat 11:30". */
  windowLabel: string
}

interface EventCheckinsGridProps {
  eventId: string
  eventSubmitted: boolean
  controls: GridControl[]
  riders: AdminCheckinGridRider[]
}

const FLAG_LABELS: Array<{ key: keyof CheckinFlags; label: string; title: string }> = [
  { key: 'outOfRadius', label: 'radius', title: 'GPS fix was outside the control radius' },
  { key: 'noGps', label: 'no gps', title: 'Checked in without a GPS fix' },
  { key: 'early', label: 'early', title: 'Before the control opened' },
  { key: 'late', label: 'late', title: 'After the control closed' },
  { key: 'lateSync', label: 'late sync', title: 'Synced well after the tap (offline outbox)' },
]

/** ISO → value usable in a datetime-local input, in the browser's timezone. */
function isoToLocalInputValue(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface EditingCell {
  rider: AdminCheckinGridRider
  control: GridControl
  existing: AdminCheckin | null
}

export function EventCheckinsGrid({
  eventId,
  eventSubmitted,
  controls,
  riders,
}: EventCheckinsGridProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<EditingCell | null>(null)

  const openCell = (
    rider: AdminCheckinGridRider,
    control: GridControl,
    existing: AdminCheckin | null
  ) => {
    if (eventSubmitted) return
    setEditing({ rider, control, existing })
  }

  const closeDialog = () => setEditing(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Check-ins</h2>
          <p className="text-sm text-muted-foreground">
            Times shown in Toronto time. Flags mark anomalies to review — they don&apos;t block
            anything.{' '}
            {eventSubmitted
              ? 'Results have been submitted; check-ins are frozen.'
              : 'Click a cell to add or correct a check-in.'}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.refresh()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {riders.length === 0 || controls.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-md p-6 text-center">
          {controls.length === 0
            ? 'Save controls above to start tracking check-ins.'
            : 'No registered riders yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px] sticky left-0 bg-background">Rider</TableHead>
                {controls.map((control) => (
                  <TableHead key={control.id} className="min-w-[130px]">
                    <div className="font-medium">{control.name}</div>
                    <div className="text-xs font-normal text-muted-foreground tabular-nums">
                      {control.distanceKm} km · {control.windowLabel}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {riders.map((rider) => (
                <RiderRow
                  key={rider.registrationId}
                  rider={rider}
                  controls={controls}
                  eventSubmitted={eventSubmitted}
                  onOpenCell={openCell}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CheckinDialog
        eventId={eventId}
        editing={editing}
        onClose={closeDialog}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}

interface RiderRowProps {
  rider: AdminCheckinGridRider
  controls: GridControl[]
  eventSubmitted: boolean
  onOpenCell: (
    rider: AdminCheckinGridRider,
    control: GridControl,
    existing: AdminCheckin | null
  ) => void
}

/**
 * Memoized so that typing in the correction dialog (which only changes state
 * owned by CheckinDialog) doesn't re-render every rider row / cell in the
 * grid — this table can have 100+ riders × several controls.
 */
const RiderRow = memo(function RiderRow({
  rider,
  controls,
  eventSubmitted,
  onOpenCell,
}: RiderRowProps) {
  const checkinsByControl = useMemo(() => {
    const map = new Map<string, AdminCheckin>()
    for (const checkin of rider.checkins) {
      map.set(checkin.controlId, checkin)
    }
    return map
  }, [rider.checkins])

  return (
    <TableRow>
      <TableCell className="font-medium sticky left-0 bg-background">
        <div className="flex items-center gap-1.5">
          <span>{rider.riderName}</span>
          {rider.managementToken && (
            <Link
              href={`/card/${rider.managementToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              title={`Open ${rider.riderName}'s digital card`}
              aria-label={`Open ${rider.riderName}'s digital card`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </TableCell>
      {controls.map((control) => {
        const checkin = checkinsByControl.get(control.id) || null
        const activeFlags = checkin ? FLAG_LABELS.filter(({ key }) => checkin.flags[key]) : []
        return (
          <TableCell
            key={control.id}
            className={eventSubmitted ? '' : 'cursor-pointer hover:bg-muted/50'}
            onClick={() => onOpenCell(rider, control, checkin)}
          >
            {checkin ? (
              <div className="space-y-1">
                <div className="tabular-nums">
                  {formatControlTime(new Date(checkin.checkedInAt))}
                </div>
                {activeFlags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {activeFlags.map(({ key, label, title }) => (
                      <Badge
                        key={key}
                        variant="outline"
                        title={title}
                        className="text-[10px] px-1 py-0"
                      >
                        {label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TableCell>
        )
      })}
    </TableRow>
  )
})

interface CheckinDialogProps {
  eventId: string
  editing: EditingCell | null
  onClose: () => void
  onSaved: () => void
}

/**
 * Owns the correction dialog's form state (timeValue/noteValue) so that
 * keystrokes only re-render this component, not the full riders × controls
 * table. `editing` changes on open/close (not per keystroke).
 */
function CheckinDialog({ eventId, editing, onClose, onSaved }: CheckinDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [timeValue, setTimeValue] = useState('')
  const [noteValue, setNoteValue] = useState('')
  // Reset the form fields whenever a new cell is opened (or the dialog is
  // closed), without an effect: this is React's documented "adjusting state
  // during render" pattern, applied here to avoid a flash of stale values.
  const [lastEditing, setLastEditing] = useState<EditingCell | null>(null)
  if (editing !== lastEditing) {
    setLastEditing(editing)
    if (editing) {
      setTimeValue(editing.existing ? isoToLocalInputValue(editing.existing.checkedInAt) : '')
      setNoteValue('')
    }
  }

  const handleSave = () => {
    if (!editing) return
    if (!timeValue) {
      toast.error('Enter a check-in time')
      return
    }
    if (!noteValue.trim()) {
      toast.error('A note explaining the correction is required')
      return
    }
    const iso = new Date(timeValue).toISOString()
    startTransition(async () => {
      const result = await adminSetCheckin({
        eventId,
        registrationId: editing.rider.registrationId,
        controlId: editing.control.id,
        checkedInAt: iso,
        note: noteValue.trim(),
      })
      if (result.success) {
        toast.success('Check-in saved')
        onClose()
        onSaved()
      } else {
        toast.error(result.error || 'Failed to save check-in')
      }
    })
  }

  const handleDelete = () => {
    if (!editing?.existing) return
    if (!noteValue.trim()) {
      toast.error('A note explaining the deletion is required')
      return
    }
    startTransition(async () => {
      const result = await adminDeleteCheckin({
        eventId,
        checkinId: editing.existing!.id,
        note: noteValue.trim(),
      })
      if (result.success) {
        toast.success('Check-in deleted')
        onClose()
        onSaved()
      } else {
        toast.error(result.error || 'Failed to delete check-in')
      }
    })
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing?.existing ? 'Correct check-in' : 'Add check-in'}</DialogTitle>
          <DialogDescription>
            {editing?.rider.riderName} at {editing?.control.name} ({editing?.control.distanceKm}{' '}
            km). Recorded as an admin correction with your note in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {editing?.existing?.note && (
            <p className="text-sm text-muted-foreground">Existing note: {editing.existing.note}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="checkin-time">Check-in time (your local time)</Label>
            <Input
              id="checkin-time"
              type="datetime-local"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="checkin-note">Note (required)</Label>
            <Input
              id="checkin-note"
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="e.g. Rider's phone died; receipt shows 14:32"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {editing?.existing && (
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete check-in
            </Button>
          )}
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

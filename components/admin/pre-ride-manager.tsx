'use client'

/**
 * Admin list of registered riders with their approved pre-ride start, if
 * any. Setting a pre-ride start reruns that rider's digital card (control
 * windows, check-in acceptance, finish time) from the override instead of
 * the event's scheduled start. Printed control cards for a pre-ride are
 * generated from /control-cards with the custom date/time.
 */

import { useState, useTransition } from 'react'
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
import { setPreRideStart } from '@/lib/actions/pre-ride'
import type { AdminCheckinGridRider } from '@/lib/actions/control-checkins'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface PreRideManagerProps {
  riders: AdminCheckinGridRider[]
}

export function PreRideManager({ riders }: PreRideManagerProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<AdminCheckinGridRider | null>(null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [isPending, startTransition] = useTransition()

  function openFor(rider: AdminCheckinGridRider) {
    setEditing(rider)
    setDate(rider.preRideDate ?? '')
    setTime(rider.preRideStartTime?.slice(0, 5) ?? '')
  }

  function save(clear: boolean) {
    if (!editing) return
    startTransition(async () => {
      const result = await setPreRideStart({
        registrationId: editing.registrationId,
        preRideDate: clear ? null : date,
        preRideStartTime: clear ? null : time,
      })
      if (result.success) {
        toast.success(clear ? 'Pre-ride cleared' : 'Pre-ride start saved')
        setEditing(null)
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to save pre-ride start')
      }
    })
  }

  if (riders.length === 0) return null

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">Pre-Rides</h2>
        <p className="text-sm text-muted-foreground">
          An approved pre-rider&apos;s digital card runs off their own start date and time. Their
          finish email still sends when they complete the ride; printed cards come from the
          control-cards generator with the custom start.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rider</TableHead>
            <TableHead>Pre-ride start</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {riders.map((rider) => (
            <TableRow key={rider.registrationId}>
              <TableCell>{rider.riderName}</TableCell>
              <TableCell>
                {rider.preRideDate ? (
                  <Badge variant="outline">
                    {rider.preRideDate} · {rider.preRideStartTime?.slice(0, 5)}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => openFor(rider)}>
                  {rider.preRideDate ? 'Edit' : 'Set'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pre-ride start</DialogTitle>
            <DialogDescription>
              {editing?.riderName} — set the approved start date and time for this rider&apos;s
              pre-ride. Clearing puts them back on the event schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pre-ride-date">Date</Label>
              <Input
                id="pre-ride-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pre-ride-time">Start time</Label>
              <Input
                id="pre-ride-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            {editing?.preRideDate && (
              <Button variant="destructive" onClick={() => save(true)} disabled={isPending}>
                Clear pre-ride
              </Button>
            )}
            <Button onClick={() => save(false)} disabled={isPending || !date || !time}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

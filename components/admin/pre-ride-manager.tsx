'use client'

/**
 * Admin list of riders with an approved pre-ride start. Setting a pre-ride
 * start reruns that rider's digital card (control windows, check-in
 * acceptance, finish time) from the override instead of the event's
 * scheduled start. Printed control cards for a pre-ride are generated from
 * /control-cards with the custom date/time.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { CollapsibleSection } from '@/components/admin/collapsible-section'
import { setPreRideStart } from '@/lib/actions/pre-ride'
import type { AdminCheckinGridRider } from '@/lib/actions/control-checkins'
import { parseLocalDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'

interface PreRideManagerProps {
  riders: AdminCheckinGridRider[]
  eventStartTime: string | null
  eventScheduled: boolean
}

type DialogState = { mode: 'add' } | { mode: 'edit'; rider: AdminCheckinGridRider } | null

function formatPreRideLabel(date: string, time: string | null): string {
  const formattedDate = parseLocalDate(date).toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  if (!time) return formattedDate

  const [hours, minutes] = time.split(':')
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  const formattedTime = `${hour12}:${minutes} ${ampm}`

  return `${formattedDate} · ${formattedTime}`
}

export function PreRideManager({ riders, eventStartTime, eventScheduled }: PreRideManagerProps) {
  const router = useRouter()
  const [dialogState, setDialogState] = useState<DialogState>(null)
  const [selectedRegistrationId, setSelectedRegistrationId] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [isPending, startTransition] = useTransition()

  const preRiders = riders.filter((r) => r.preRideDate !== null)
  const availableRiders = riders.filter((r) => r.preRideDate === null)

  function openAdd() {
    setDialogState({ mode: 'add' })
    setSelectedRegistrationId('')
    setDate('')
    setTime(eventStartTime?.slice(0, 5) ?? '')
  }

  function openEdit(rider: AdminCheckinGridRider) {
    setDialogState({ mode: 'edit', rider })
    setDate(rider.preRideDate ?? '')
    setTime(rider.preRideStartTime?.slice(0, 5) ?? eventStartTime?.slice(0, 5) ?? '')
  }

  function save(registrationId: string, clear: boolean) {
    startTransition(async () => {
      const result = await setPreRideStart({
        registrationId,
        preRideDate: clear ? null : date,
        preRideStartTime: clear ? null : time,
      })
      if (result.success) {
        toast.success(clear ? 'Pre-ride cleared' : 'Pre-ride start saved')
        setDialogState(null)
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to save pre-ride start')
      }
    })
  }

  if (riders.length === 0) return null

  return (
    <CollapsibleSection
      title="Pre-Rides"
      description="An approved pre-rider's digital card runs off their own start date and time. Their finish email still sends when they complete the ride; printed cards come from the control-cards generator with the custom start."
      summary={`${preRiders.length} pre-rider${preRiders.length === 1 ? '' : 's'}`}
      className="space-y-3"
      actions={
        <Button
          variant="outline"
          onClick={openAdd}
          disabled={availableRiders.length === 0 || !eventScheduled}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add pre-rider
        </Button>
      }
    >
      <div className="space-y-3">
        {preRiders.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-md p-6 text-center">
            No pre-rides for this event.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rider</TableHead>
                <TableHead>Pre-ride start</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {preRiders.map((rider) => (
                <TableRow key={rider.registrationId}>
                  <TableCell>{rider.riderName}</TableCell>
                  <TableCell>
                    {formatPreRideLabel(rider.preRideDate!, rider.preRideStartTime)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(rider)}
                      disabled={!eventScheduled}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogState !== null} onOpenChange={(open) => !open && setDialogState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState?.mode === 'edit'
                ? `${dialogState.rider.riderName} pre-ride`
                : 'Add pre-rider'}
            </DialogTitle>
            <DialogDescription>
              Set the approved start date and time for this rider&apos;s pre-ride.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {dialogState?.mode === 'add' && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pre-ride-rider">Rider</Label>
                <Select value={selectedRegistrationId} onValueChange={setSelectedRegistrationId}>
                  <SelectTrigger id="pre-ride-rider">
                    <SelectValue placeholder="Select a rider" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRiders.map((rider) => (
                      <SelectItem key={rider.registrationId} value={rider.registrationId}>
                        {rider.riderName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
            {dialogState?.mode === 'edit' && (
              <Button
                variant="outline"
                onClick={() => save(dialogState.rider.registrationId, true)}
                disabled={isPending}
              >
                Cancel pre-ride
              </Button>
            )}
            <Button
              onClick={() => {
                const registrationId =
                  dialogState?.mode === 'edit'
                    ? dialogState.rider.registrationId
                    : selectedRegistrationId
                save(registrationId, false)
              }}
              disabled={
                isPending ||
                !date ||
                !time ||
                (dialogState?.mode === 'add' && !selectedRegistrationId)
              }
            >
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CollapsibleSection>
  )
}

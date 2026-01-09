'use client'

import { useState, useTransition, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateEventStatus, type EventStatus } from '@/lib/actions/events'
import { toast } from 'sonner'
import { Loader2, Check, AlertTriangle } from 'lucide-react'

// Only these statuses are selectable in the dropdown
// 'submitted' is set programmatically when results are emailed
const STATUS_OPTIONS: { value: Exclude<EventStatus, 'submitted'>; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface EventStatusSelectProps {
  eventId: string
  initialStatus: EventStatus
  resultsCount: number
}

export function EventStatusSelect({ eventId, initialStatus, resultsCount }: EventStatusSelectProps) {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<EventStatus>(initialStatus)
  const [showSaved, setShowSaved] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Sync local state when prop changes (e.g., after router.refresh())
  useEffect(() => {
    setStatus(initialStatus)
  }, [initialStatus])

  const performStatusUpdate = (newStatus: EventStatus) => {
    startTransition(async () => {
      const result = await updateEventStatus(eventId, newStatus)

      if (result.success) {
        setStatus(newStatus)
        setShowSaved(true)
        setTimeout(() => setShowSaved(false), 1500)
      } else {
        toast.error(result.error || 'Failed to update status')
      }
    })
  }

  const handleChange = (newStatus: EventStatus) => {
    if (newStatus === 'cancelled' && resultsCount > 0) {
      setShowCancelConfirm(true)
      return
    }

    setStatus(newStatus)
    performStatusUpdate(newStatus)
  }

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false)
    setStatus('cancelled')
    performStatusUpdate('cancelled')
  }

  // If submitted, show read-only badge instead of dropdown
  if (status === 'submitted') {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-600">
        Submitted
      </Badge>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Select
          value={status}
          onValueChange={(v) => handleChange(v as EventStatus)}
          disabled={isPending}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {showSaved && <Check className="h-4 w-4 text-green-600" />}
      </div>

      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cancel Event?
            </DialogTitle>
            <DialogDescription>
              This event has {resultsCount} result{resultsCount === 1 ? '' : 's'} recorded.
              Cancelling the event will permanently delete all results.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelConfirm(false)}>
              Keep Event
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Event & Delete Results'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

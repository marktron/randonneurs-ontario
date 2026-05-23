'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

const STATUS_OPTIONS: { value: Exclude<EventStatus, 'submitted'>; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface EventStatusSelectProps {
  eventId: string
  initialStatus: EventStatus
  resultsCount: number
  initialDescription: string | null
}

export function EventStatusSelect({
  eventId,
  initialStatus,
  resultsCount,
  initialDescription,
}: EventStatusSelectProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<EventStatus>(initialStatus)
  const [showSaved, setShowSaved] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [draftDescription, setDraftDescription] = useState(initialDescription ?? '')

  useEffect(() => {
    setStatus(initialStatus)
  }, [initialStatus])

  useEffect(() => {
    if (!showCancelDialog) {
      setDraftDescription(initialDescription ?? '')
    }
  }, [initialDescription, showCancelDialog])

  const runUpdate = (newStatus: EventStatus, options?: { description?: string | null }) => {
    startTransition(async () => {
      const result = await updateEventStatus(eventId, newStatus, options)
      if (result.success) {
        setStatus(newStatus)
        setShowSaved(true)
        setTimeout(() => setShowSaved(false), 1500)
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to update status')
      }
    })
  }

  const handleChange = (newStatus: EventStatus) => {
    if (newStatus === 'cancelled') {
      setShowCancelDialog(true)
      return
    }
    setStatus(newStatus)
    runUpdate(newStatus)
  }

  const handleConfirmCancel = () => {
    setShowCancelDialog(false)
    runUpdate('cancelled', { description: draftDescription })
  }

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

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel event?</DialogTitle>
            <DialogDescription>
              Add a cancellation note at the top of the description. Riders will see this on the
              public event page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label htmlFor="event-cancel-description">Event description</Label>
            <Textarea
              id="event-cancel-description"
              rows={8}
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
            />
            {resultsCount > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This event has {resultsCount} {resultsCount === 1 ? 'result' : 'results'} that
                  will be permanently deleted if you cancel.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Keep Event
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Event'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

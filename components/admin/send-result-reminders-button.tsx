'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { sendResultReminderEmails } from '@/lib/actions/events'
import { toast } from 'sonner'
import { Loader2, Mail } from 'lucide-react'

interface SendResultRemindersButtonProps {
  eventId: string
  eventName: string
  pendingCount: number
}

export function SendResultRemindersButton({
  eventId,
  eventName,
  pendingCount,
}: SendResultRemindersButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)

  const riderWord = pendingCount === 1 ? 'rider' : 'riders'
  const reminderWord = pendingCount === 1 ? 'Reminder' : 'Reminders'

  const handleSend = () => {
    setShowConfirm(false)
    startTransition(async () => {
      const result = await sendResultReminderEmails(eventId)

      if (result.success) {
        const sent = result.data?.emailsSent ?? 0
        toast.success(`Sent ${sent} reminder ${sent === 1 ? 'email' : 'emails'}`)
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to send reminder emails')
      }
    })
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setShowConfirm(true)}
        disabled={isPending || pendingCount === 0}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Mail className="mr-2 h-4 w-4" />
            Send Reminders
          </>
        )}
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Result Reminders?</DialogTitle>
            <DialogDescription>
              This will email {pendingCount} {riderWord} registered for <strong>{eventName}</strong>{' '}
              who {pendingCount === 1 ? 'has' : 'have'} not submitted results yet, with a link to
              submit them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend}>
              <Mail className="mr-2 h-4 w-4" />
              Send {pendingCount} {reminderWord}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

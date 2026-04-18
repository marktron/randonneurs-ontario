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
import { submitEventResults } from '@/lib/actions/events'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'

interface SubmitResultsButtonProps {
  eventId: string
  eventName: string
  eventType: string
  resultsCount: number
  onSuccess?: () => void
}

export function SubmitResultsButton({
  eventId,
  eventName,
  eventType,
  resultsCount,
  onSuccess,
}: SubmitResultsButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)

  const isPermanent = eventType === 'permanent'
  const buttonLabel = isPermanent
    ? 'Finalize Results'
    : 'Submit Results to VP of Brevet Administration'
  const dialogTitle = isPermanent ? 'Finalize Results?' : 'Submit Results?'
  const confirmLabel = isPermanent ? 'Finalize Results' : 'Submit Results'
  const riderWord = resultsCount === 1 ? 'rider' : 'riders'

  const handleSubmit = () => {
    setShowConfirm(false)
    startTransition(async () => {
      const result = await submitEventResults(eventId)

      if (result.success) {
        toast.success(isPermanent ? 'Results finalized' : 'Results submitted successfully')
        onSuccess?.()
        router.refresh()
      } else {
        toast.error(
          result.error || (isPermanent ? 'Failed to finalize results' : 'Failed to submit results')
        )
      }
    })
  }

  return (
    <>
      <Button onClick={() => setShowConfirm(true)} disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isPermanent ? 'Finalizing...' : 'Submitting...'}
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            {buttonLabel}
          </>
        )}
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {isPermanent ? (
                <>
                  This will mark <strong>{eventName}</strong> ({resultsCount} {riderWord}) as
                  submitted.
                </>
              ) : (
                <>
                  This will email the results for <strong>{eventName}</strong> ({resultsCount}{' '}
                  {riderWord}) to the VP of Brevet Administration and mark the event as submitted.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              <Send className="mr-2 h-4 w-4" />
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

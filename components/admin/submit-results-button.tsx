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
  resultsCount: number
  onSuccess?: () => void
}

export function SubmitResultsButton({ eventId, eventName, resultsCount, onSuccess }: SubmitResultsButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)

  const handleSubmit = () => {
    setShowConfirm(false)
    startTransition(async () => {
      const result = await submitEventResults(eventId)

      if (result.success) {
        toast.success('Results submitted successfully')
        onSuccess?.()
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to submit results')
      }
    })
  }

  return (
    <>
      <Button
        onClick={() => setShowConfirm(true)}
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Submit Results to VP of Brevet Administration
          </>
        )}
      </Button>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Results?</DialogTitle>
            <DialogDescription>
              This will email the results for <strong>{eventName}</strong> ({resultsCount} rider{resultsCount !== 1 ? 's' : ''}) to the VP of Brevet Administration and mark the event as submitted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              <Send className="mr-2 h-4 w-4" />
              Submit Results
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

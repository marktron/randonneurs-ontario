'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Trash2, Loader2 } from 'lucide-react'
import { deleteEvent } from '@/lib/actions/events'
import { toast } from 'sonner'

interface EventDeleteButtonProps {
  eventId: string
  eventName: string
  isPastEvent: boolean
  registrationsCount: number
}

export function EventDeleteButton({
  eventId,
  eventName,
  isPastEvent,
  registrationsCount,
}: EventDeleteButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  if (isPastEvent) {
    return null
  }

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteEvent(eventId)

      if (result.success) {
        toast.success('Event deleted successfully')
        router.push('/admin/events')
      } else {
        toast.error(result.error || 'Failed to delete event')
        setOpen(false)
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Event</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{eventName}</strong>?
            {registrationsCount > 0 && (
              <>
                {' '}This will also delete {registrationsCount} registration{registrationsCount !== 1 ? 's' : ''}.
              </>
            )}
            {' '}This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Event'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

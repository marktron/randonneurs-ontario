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
import { publishSeasonDrafts } from '@/lib/actions/events'
import { formatLongDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Loader2, Megaphone } from 'lucide-react'

export interface PublishSeasonDraft {
  id: string
  name: string
  /** YYYY-MM-DD */
  eventDate: string
}

export interface PublishSeasonButtonProps {
  /** ACP season label: Nov 1 of the prior year to Oct 31 of this year. */
  acpSeason: number
  chapterId: string
  chapterName: string
  /** The chapter's drafts dated inside the ACP season. */
  events: PublishSeasonDraft[]
}

export function PublishSeasonButton({
  acpSeason,
  chapterId,
  chapterName,
  events,
}: PublishSeasonButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const total = events.length
  if (total === 0) return null

  const noun = total === 1 ? 'draft' : 'drafts'
  const eventsNoun = total === 1 ? 'event' : 'events'

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await publishSeasonDrafts(acpSeason, chapterId)
      if (!result.success) {
        toast.error(result.error || 'Failed to publish season')
        return
      }
      const published = result.data?.published ?? 0
      const erwFailures = result.data?.erwFailures ?? 0
      const publishedNoun = published === 1 ? 'event' : 'events'
      if (erwFailures > 0) {
        toast.warning(
          `Published ${published} ${publishedNoun}; ${erwFailures} could not be synced to Epic Ride Weather`
        )
      } else {
        toast.success(`Published ${published} ${publishedNoun} for the ${acpSeason} season`)
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Megaphone className="h-4 w-4 mr-2" />
          Publish {acpSeason} season ({total} {noun})
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Publish the {acpSeason} season for {chapterName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Every {chapterName} draft dated Nov 1, {acpSeason - 1} to Oct 31, {acpSeason} becomes
            visible on the public calendar, the iCal feed, and Epic Ride Weather. This cannot be
            undone from the site (you would have to cancel events individually).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="text-sm space-y-1 max-h-64 overflow-y-auto">
          {events.map((event) => (
            <li key={event.id} className="flex justify-between gap-4">
              <span>{event.name}</span>
              <span className="tabular-nums text-muted-foreground shrink-0">
                {formatLongDate(event.eventDate)}
              </span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Keep as drafts</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing…
              </>
            ) : (
              `Publish ${total} ${eventsNoun}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

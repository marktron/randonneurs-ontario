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
import { toast } from 'sonner'
import { Loader2, Megaphone } from 'lucide-react'

export interface PublishSeasonButtonProps {
  season: number
  /** One row per chapter that has at least one draft in this season. */
  draftCounts: { chapterName: string; count: number }[]
}

export function PublishSeasonButton({ season, draftCounts }: PublishSeasonButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const total = draftCounts.reduce((sum, row) => sum + row.count, 0)
  if (total === 0) return null

  const noun = total === 1 ? 'draft' : 'drafts'
  const eventsNoun = total === 1 ? 'event' : 'events'

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await publishSeasonDrafts(season)
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
        toast.success(`Published ${published} ${publishedNoun} for the ${season} season`)
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
          Publish {season} season ({total} {noun})
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish the {season} season?</AlertDialogTitle>
          <AlertDialogDescription>
            Every draft dated in {season} becomes visible on the public calendar, the iCal feed, and
            Epic Ride Weather. This cannot be undone from the site (you would have to cancel events
            individually).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="text-sm space-y-1">
          {draftCounts.map((row) => (
            <li key={row.chapterName} className="flex justify-between">
              <span>{row.chapterName}</span>
              <span className="tabular-nums">{row.count}</span>
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

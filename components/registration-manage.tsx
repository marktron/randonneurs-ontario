'use client'

import { useState, useTransition } from 'react'
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
import { cancelRegistration } from '@/lib/actions/manage-registration'
import { formatRideName } from '@/lib/events/format'
import { format, parseISO } from 'date-fns'
import { CalendarDays, MapPin, Clock, Smartphone, XCircle } from 'lucide-react'
import Link from 'next/link'

interface RegistrationManageProps {
  token: string
  registration: {
    id: string
    status: string | null
    cancelled_at: string | null
    management_token: string
    is_team_captain: boolean
  }
  event: {
    id: string
    slug: string
    status: string | null
    name: string
    event_date: string
    start_time: string | null
    start_location: string | null
    distance_km: number
    event_type: string | null
    chapter_name: string | null
    chapter_slug: string | null
  }
  rider: {
    first_name: string
    last_name: string
    email: string | null
  }
  eventStarted: boolean
  hasDigitalCard: boolean
}

export function RegistrationManage({
  token,
  registration,
  event,
  rider,
  eventStarted,
  hasDigitalCard,
}: RegistrationManageProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(registration.status === 'cancelled')

  const riderName = `${rider.first_name} ${rider.last_name}`
  const rideName = formatRideName(event.name, event.distance_km)
  const formattedDate = format(parseISO(event.event_date), 'EEEE, MMMM d, yyyy')

  function formatTime(timeStr: string | null): string {
    if (!timeStr) return 'TBD'
    const [hours, minutes] = timeStr.split(':')
    const hour = parseInt(hours, 10)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    return `${hour12}:${minutes} ${ampm}`
  }

  function handleCancel() {
    setError(null)
    startTransition(async () => {
      const result = await cancelRegistration(token)
      if (result.success) {
        setCancelled(true)
      } else {
        setError(result.error || 'Failed to cancel registration')
      }
    })
  }

  // Event cancelled by organizer
  if (event.status === 'cancelled') {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-2xl md:text-3xl font-bold">Event Cancelled</h1>
        <div className="rounded-lg border border-border bg-muted/50 p-6">
          <p className="text-muted-foreground">
            The <strong>{rideName}</strong> has been cancelled by the organizer.
          </p>
        </div>
      </div>
    )
  }

  // Registration cancelled
  if (cancelled) {
    return (
      <div className="space-y-6">
        <h1 className="font-serif text-2xl md:text-3xl font-bold">Registration Cancelled</h1>
        <div className="rounded-lg border border-border bg-muted/50 p-6 space-y-4">
          <p className="text-muted-foreground">
            Your registration for <strong>{rideName}</strong> on {formattedDate} has been cancelled.
          </p>
          <p className="text-muted-foreground">
            Changed your mind?{' '}
            <Link
              href={`/register/${event.slug}`}
              className="text-accent underline underline-offset-4 hover:text-accent/80"
            >
              Re-register for this event
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl md:text-3xl font-bold">Manage Registration</h1>
        <p className="text-muted-foreground mt-2">{riderName}</p>
      </div>

      {/* Event Details */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <h2 className="font-serif text-xl font-semibold">
          <Link
            href={`/register/${event.slug}`}
            className="underline underline-offset-4 decoration-muted-foreground/40 hover:decoration-foreground transition-colors"
          >
            {rideName}
          </Link>
        </h2>
        <div className="grid gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span>{formattedDate}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{formatTime(event.start_time)}</span>
          </div>
          {event.start_location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{event.start_location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-4">
        {/* Digital brevet card — organizer has saved controls for this event */}
        {hasDigitalCard && (
          <div className="rounded-lg border border-border p-6 space-y-3">
            <div>
              <h3 className="font-semibold">Digital Brevet Card</h3>
              <p className="text-sm text-muted-foreground">
                Check in at controls from your phone on event day. Open it before the start and keep
                the page handy — check-ins made without signal sync automatically.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full sm:w-auto h-12">
              <Link href={`/card/${token}`}>
                <Smartphone className="h-4 w-4 mr-2" />
                Open your brevet card
              </Link>
            </Button>
          </div>
        )}

        {/* Cancel — show when event is scheduled */}
        {event.status === 'scheduled' && (
          <div className="rounded-lg border border-border p-6 space-y-3">
            <div>
              <h3 className="font-semibold">
                {eventStarted ? "I'm not riding" : 'Cancel Registration'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {eventStarted
                  ? "Didn't start the event? Cancel your registration."
                  : "Can't make it? Cancel your registration for this event."}
              </p>
              {registration.is_team_captain && event.event_type === 'fleche' && (
                <p className="text-sm text-amber-600 mt-2">
                  As team captain, cancelling your registration will not automatically cancel your
                  team members&apos; registrations.
                </p>
              )}
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={isPending}
                  className="w-full sm:w-auto h-12 border-destructive/50 text-destructive hover:bg-destructive/10"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel Registration
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel your registration?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You’ll be removed from the start list for <strong>{rideName}</strong> on{' '}
                    {formattedDate}. You can re-register later if you change your mind.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep registration</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancel}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Cancel registration
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </div>
  )
}

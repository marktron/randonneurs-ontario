'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import type { UpcomingEvent } from '@/lib/actions/rider-results'

interface RegistrationSuccessProps {
  title: string
  children: React.ReactNode
  /** Forms pass their focus ref so the success message receives focus. */
  successRef?: React.RefObject<HTMLDivElement | null>
}

/** Green-checkmark success block shared by the registration and result forms. */
export function RegistrationSuccess({ title, children, successRef }: RegistrationSuccessProps) {
  return (
    <div
      ref={successRef}
      tabIndex={successRef ? -1 : undefined}
      role="status"
      className="text-center py-8"
      data-testid="registration-success"
    >
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
        <svg
          aria-hidden="true"
          className="w-6 h-6 text-green-600 dark:text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="font-serif text-2xl tracking-tight mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

/** Spinner row shown while upcoming events load below the success block. */
export function UpcomingEventsLoading() {
  return (
    <div className="border-t border-border pt-6 mt-6" role="status">
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <div
          className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin"
          aria-hidden="true"
        />
        Loading upcoming events…
      </div>
    </div>
  )
}

interface UpcomingEventsSectionProps {
  title: string
  description?: string
  events: UpcomingEvent[]
  /** True when the rider is already registered for these events ("Details" link). */
  isRegistered?: boolean
}

/** Titled list of upcoming-event cards below the success block. */
export function UpcomingEventsSection({
  title,
  description,
  events,
  isRegistered = false,
}: UpcomingEventsSectionProps) {
  return (
    <div className="border-t border-border pt-6 mt-6">
      <h3 className={`font-medium text-sm text-center ${description ? 'mb-1' : 'mb-4'}`}>
        {title}
      </h3>
      {description && (
        <p className="text-xs text-muted-foreground mb-4 text-center">{description}</p>
      )}
      <div className="space-y-3">
        {events.map((event) => (
          <UpcomingEventCard key={event.id} event={event} isRegistered={isRegistered} />
        ))}
      </div>
    </div>
  )
}

interface UpcomingEventCardProps {
  event: UpcomingEvent
  isRegistered?: boolean
}

export function UpcomingEventCard({ event, isRegistered = false }: UpcomingEventCardProps) {
  const label = isRegistered ? 'Details' : 'Register'
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-border bg-muted/30">
      <div className="flex-shrink-0 text-center w-14">
        <div className="text-xs text-muted-foreground uppercase">
          {format(new Date(event.date + 'T00:00:00'), 'MMM')}
        </div>
        <div className="text-lg font-medium tabular-nums">
          {format(new Date(event.date + 'T00:00:00'), 'd')}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{event.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">{event.distance} km</div>
        {event.startLocation && (
          <div className="text-xs text-muted-foreground truncate">{event.startLocation}</div>
        )}
      </div>
      <Link
        href={`/register/${event.slug}`}
        className="flex-shrink-0 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        aria-label={`${label === 'Details' ? 'Details for' : 'Register for'} ${event.name}`}
      >
        {label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  )
}

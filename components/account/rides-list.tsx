import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { parseLocalDate } from '@/lib/utils'
import type { AccountRide } from '@/lib/account/rides'

function formatDate(iso: string): string {
  return parseLocalDate(iso).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function ResultBadge({ status }: { status: string | null }) {
  if (!status) return null
  const labels: Record<string, string> = {
    finished: 'Finished',
    dnf: 'DNF',
    dns: 'DNS',
    pending: 'Result pending',
    otl: 'OTL',
  }
  return <Badge variant="outline">{labels[status] ?? status}</Badge>
}

function RideRow({ ride, upcoming }: { ride: AccountRide; upcoming: boolean }) {
  return (
    <li className="flex flex-col gap-2 border-t border-border py-4 first:border-t-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="font-medium">
          <Link href={`/register/${ride.eventSlug}`} className="hover:underline underline-offset-4">
            {ride.eventName}
          </Link>
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground tabular-nums">
          {formatDate(ride.eventDate)} · {ride.distanceKm} km
          {ride.chapterName && <> · {ride.chapterName}</>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {ride.registrationStatus === 'cancelled' && <Badge variant="secondary">Cancelled</Badge>}
          <ResultBadge status={ride.resultStatus} />
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 text-sm">
        {ride.registrationStatus !== 'cancelled' && (
          <Link
            href={`/registration/manage/${ride.managementToken}`}
            className="underline underline-offset-4"
          >
            {upcoming ? 'Manage registration' : 'Manage / submit result'}
          </Link>
        )}
        {upcoming && ride.registrationStatus !== 'cancelled' && (
          <Link href={`/card/${ride.managementToken}`} className="underline underline-offset-4">
            Digital card
          </Link>
        )}
      </div>
    </li>
  )
}

export function RidesList({ upcoming, past }: { upcoming: AccountRide[]; past: AccountRide[] }) {
  return (
    <div className="space-y-10">
      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="font-serif text-2xl tracking-tight">
          Upcoming rides
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing on the calendar yet.{' '}
            <Link href="/calendar" className="underline underline-offset-4">
              Find a ride
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3">
            {upcoming.map((ride) => (
              <RideRow key={ride.registrationId} ride={ride} upcoming />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="past-heading">
        <h2 id="past-heading" className="font-serif text-2xl tracking-tight">
          Past rides
        </h2>
        {past.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No past registrations on this account.
          </p>
        ) : (
          <ul className="mt-3">
            {past.map((ride) => (
              <RideRow key={ride.registrationId} ride={ride} upcoming={false} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

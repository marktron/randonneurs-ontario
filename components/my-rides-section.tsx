'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getMyUpcomingRides, type MyUpcomingRide } from '@/lib/actions/my-rides'

const STORAGE_KEY = 'ro-registration'
const MAX_COLLAPSED = 3

function formatDate(dateString: string): { month: string; day: string } {
  const date = new Date(dateString + 'T00:00:00')
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const day = date.getDate().toString()
  return { month, day }
}

export function MyRidesSection() {
  const [rides, setRides] = useState<MyUpcomingRide[] | null>(null)
  const [firstName, setFirstName] = useState('')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return

      const data = JSON.parse(saved)
      if (!data?.email) return

      setFirstName(data.firstName || '')

      getMyUpcomingRides(data.email).then((result) => {
        if (result.success && result.data && result.data.length > 0) {
          setRides(result.data)
        }
      })
    } catch {
      // Corrupted localStorage — render nothing
    }
  }, [])

  if (!rides || rides.length === 0) return null

  const hasOverflow = rides.length > MAX_COLLAPSED
  const visibleRides = expanded ? rides : rides.slice(0, MAX_COLLAPSED)
  const remaining = rides.length - MAX_COLLAPSED

  return (
    <section
      className="mb-8 -mx-4 rounded-lg bg-muted/50 p-4 animate-in fade-in duration-500"
      aria-label="Your upcoming rides"
    >
      <h2 className="font-serif text-2xl tracking-tight">Your Upcoming Rides</h2>
      {firstName && <p className="mt-1 text-sm text-muted-foreground">Welcome back, {firstName}</p>}

      <ul className="mt-6 space-y-1">
        {visibleRides.map((ride) => {
          const { month, day } = formatDate(ride.date)
          return (
            <li key={ride.slug}>
              <Link
                href={`/register/${ride.slug}`}
                className="group flex items-start gap-3 py-2 -mx-1 px-1 rounded-md hover:bg-background/60 transition-colors"
              >
                {/* Date block */}
                <div className="flex-shrink-0 w-10 text-center">
                  <div className="text-[10px] font-medium tracking-wider text-muted-foreground">
                    {month}
                  </div>
                  <div className="text-lg font-semibold tabular-nums leading-tight">{day}</div>
                </div>

                {/* Ride details */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">
                    {ride.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <span className="tabular-nums">{ride.distance} km</span>
                    {ride.chapterName && <span> &middot; {ride.chapterName}</span>}
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>

      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-4 ml-2 text-xs font-medium text-primary hover:underline underline-offset-2 transition-colors cursor-pointer"
        >
          {expanded ? 'Show less' : `Show ${remaining} more events`}
        </button>
      )}
    </section>
  )
}

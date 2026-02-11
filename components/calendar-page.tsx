'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { PageShell } from '@/components/page-shell'
import { PageHero } from '@/components/page-hero'
import { EventList, type Event } from '@/components/event-card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Dynamic import to avoid Radix UI hydration mismatch with DropdownMenu
const CalendarSubscribeButton = dynamic(
  () => import('@/components/calendar-subscribe-button').then((mod) => mod.CalendarSubscribeButton),
  { ssr: false }
)

type DistanceFilter = 'all' | 'populaire' | '200' | '300' | '400' | '600' | '1000'

const distanceFilterOptions: { value: DistanceFilter; label: string }[] = [
  { value: 'all', label: 'All distances' },
  { value: 'populaire', label: 'Populaires (under 200 km)' },
  { value: '200', label: '200 km' },
  { value: '300', label: '300 km' },
  { value: '400', label: '400 km' },
  { value: '600', label: '600 km' },
  { value: '1000', label: '1000+ km' },
]

function filterEvents(events: Event[], filter: DistanceFilter): Event[] {
  if (filter === 'all') return events
  return events.filter((event) => {
    const distance = parseInt(event.distance, 10)
    switch (filter) {
      case 'populaire':
        return distance < 200
      case '1000':
        return distance >= 1000
      default:
        return distance === parseInt(filter, 10)
    }
  })
}

export interface CalendarPageProps {
  chapter: string
  chapterSlug: string
  description: string
  coverImage?: string
  events: Event[]
}

export function CalendarPage({
  chapter,
  chapterSlug,
  description,
  coverImage,
  events,
}: CalendarPageProps) {
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>('all')

  const filteredEvents = useMemo(
    () => filterEvents(events, distanceFilter),
    [events, distanceFilter]
  )

  return (
    <PageShell>
      <PageHero
        image={coverImage}
        eyebrow="2026 Season"
        title={chapter}
        description={description}
      />
      <div className="content-container py-16 md:py-20">
        <div className="flex items-center justify-end gap-3 mb-6">
          <Select
            value={distanceFilter}
            onValueChange={(value) => setDistanceFilter(value as DistanceFilter)}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {distanceFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CalendarSubscribeButton chapter={chapterSlug} />
        </div>
        {filteredEvents.length > 0 ? (
          <EventList events={filteredEvents} />
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>No events match the selected filter.</p>
          </div>
        )}
      </div>
    </PageShell>
  )
}

// Re-export Event type for convenience
export type { Event } from '@/components/event-card'

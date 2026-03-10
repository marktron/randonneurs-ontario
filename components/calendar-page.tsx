'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { ListIcon, GridIcon } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { PageHero } from '@/components/page-hero'
import { EventList, type Event } from '@/components/event-card'
import { CalendarGridView } from '@/components/calendar-grid-view'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

// Dynamic import to avoid Radix UI hydration mismatch with DropdownMenu
const CalendarSubscribeButton = dynamic(
  () => import('@/components/calendar-subscribe-button').then((mod) => mod.CalendarSubscribeButton),
  { ssr: false }
)

type DistanceFilter = 'all' | 'populaire' | '200' | '300' | '400' | '600' | '1000'
type CalendarView = 'list' | 'grid'

const STORAGE_KEY = 'ro-calendar-view'

const distanceFilterOptions: { value: DistanceFilter; label: string }[] = [
  { value: 'all', label: 'All distances' },
  { value: 'populaire', label: 'Populaires (under 200 km)' },
  { value: '200', label: '200 km' },
  { value: '300', label: '300 km' },
  { value: '400', label: '400 km' },
  { value: '600', label: '600 km' },
  { value: '1000', label: '1000+ km' },
]

function getSavedView(): CalendarView | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'list' || saved === 'grid') return saved
    return null
  } catch {
    return null
  }
}

function saveView(view: CalendarView): void {
  try {
    localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // Ignore storage errors
  }
}

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
  const [view, setView] = useState<CalendarView>('list')

  useEffect(() => {
    const saved = getSavedView()
    if (saved) setView(saved)
  }, [])

  function handleViewChange(value: string) {
    if (value === 'list' || value === 'grid') {
      setView(value)
      saveView(value)
    }
  }

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
      <div className="content-container pt-6 pb-16 md:pt-10 md:pb-20">
        <div className="flex flex-wrap items-center justify-end gap-3 mb-8">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={handleViewChange}
            variant="outline"
            size="sm"
            aria-label="Calendar view"
          >
            <ToggleGroupItem value="list" aria-label="List view">
              <ListIcon className="size-4" />
              <span className="sr-only sm:not-sr-only sm:ml-1 text-xs">List</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label="Grid view">
              <GridIcon className="size-4" />
              <span className="sr-only sm:not-sr-only sm:ml-1 text-xs">Grid</span>
            </ToggleGroupItem>
          </ToggleGroup>
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
          view === 'list' ? (
            <EventList events={filteredEvents} />
          ) : (
            <CalendarGridView events={filteredEvents} />
          )
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

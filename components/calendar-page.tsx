'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ListIcon, CalendarDaysIcon } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { PageHero } from '@/components/page-hero'
import { getCurrentSeasonLabel } from '@/lib/season'
import { EventList, type Event } from '@/components/event-card'
import { CalendarGridView } from '@/components/calendar-grid-view'
import { useRegisteredSlugs } from '@/hooks/use-registered-slugs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Alert, AlertDescription } from '@/components/ui/alert'

// Dynamic import to avoid Radix UI hydration mismatch with DropdownMenu
const CalendarSubscribeButton = dynamic(
  () => import('@/components/calendar-subscribe-button').then((mod) => mod.CalendarSubscribeButton),
  { ssr: false }
)

type DistanceFilter = 'all' | 'populaire' | '200' | '300' | '400' | '600' | '1000'
type CalendarView = 'list' | 'grid'

const STORAGE_KEY = 'ro-calendar-view'

const chapterOptions: { value: string; label: string }[] = [
  { value: 'all', label: 'All Chapters' },
  { value: 'huron', label: 'Huron' },
  { value: 'ottawa', label: 'Ottawa' },
  { value: 'simcoe-muskoka', label: 'Simcoe-Muskoka' },
  { value: 'toronto', label: 'Toronto' },
]

const distanceFilterOptions: { value: DistanceFilter; label: string }[] = [
  { value: 'all', label: 'All Distances' },
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

/**
 * Distinct calendar years among the page's draft events, sorted ascending,
 * or empty array if there are none. Drives the "schedule is a draft" notice:
 * - No drafts: no notice
 * - One year: "The [year] schedule is a draft..."
 * - Multiple years: "Some events on this calendar are drafts..."
 *
 * Computed from every event on the page, not just the currently filtered
 * subset, so the notice doesn't flicker as the visitor changes the distance
 * filter.
 */
function draftYears(events: Event[]): number[] {
  const years = new Set(
    events
      .filter((event) => event.status === 'draft')
      .map((event) => new Date(event.date + 'T00:00:00').getFullYear())
  )
  return Array.from(years).sort((a, b) => a - b)
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
  /** Overrides the hero h1 text. Defaults to `chapter` for backward compatibility. */
  title?: string
}

export function CalendarPage({
  chapter,
  chapterSlug,
  description,
  coverImage,
  events,
  title,
}: CalendarPageProps) {
  const router = useRouter()
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>('all')
  const [view, setView] = useState<CalendarView>('list')
  const registeredSlugs = useRegisteredSlugs()

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
  const draftYearsArray = useMemo(() => draftYears(events), [events])

  return (
    <PageShell>
      <PageHero
        image={coverImage}
        eyebrow={`${getCurrentSeasonLabel()} Season`}
        title={title ?? chapter}
        description={description}
      />
      <div className="content-container pt-6 pb-16 md:pt-10 md:pb-20 print:max-w-none print:px-0 print:pt-0 print:pb-0">
        {draftYearsArray.length > 0 && (
          <Alert className="mb-6 border-dashed bg-muted/30 print:mb-1 print:border-0 print:bg-transparent print:px-0 print:py-0">
            <AlertDescription className="print:text-xs">
              {draftYearsArray.length === 1
                ? `The ${draftYearsArray[0]} schedule is a draft. Events and dates may change. Registration opens once the schedule is final.`
                : 'Some events on this calendar are drafts. Events and dates may change. Registration opens once the schedule is final.'}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-3 mb-8 md:flex-row md:flex-wrap md:items-center md:justify-end print:hidden">
          <div className="flex items-center justify-between md:contents">
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
                <span className="ml-1 text-sm">List</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label="Grid view">
                <CalendarDaysIcon className="size-4" />
                <span className="ml-1 text-sm">Grid</span>
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="md:order-last">
              <CalendarSubscribeButton chapter={chapterSlug} />
            </div>
          </div>
          <div className="flex items-center gap-3 md:contents">
            <Select
              value={chapterSlug}
              onValueChange={(value) => {
                router.push(value === 'all' ? '/calendar' : `/calendar/${value}`)
              }}
            >
              <SelectTrigger
                size="sm"
                className="flex-1 md:flex-none"
                aria-label="Filter by chapter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {chapterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={distanceFilter}
              onValueChange={(value) => setDistanceFilter(value as DistanceFilter)}
            >
              <SelectTrigger
                size="sm"
                className="flex-1 md:flex-none"
                aria-label="Filter by distance"
              >
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
          </div>
        </div>
        <div aria-live="polite" aria-atomic="true">
          <p className="sr-only">
            {filteredEvents.length === 0
              ? 'No events match the selected filter.'
              : `Showing ${filteredEvents.length} event${filteredEvents.length !== 1 ? 's' : ''} in ${view} view.`}
          </p>
          {filteredEvents.length > 0 ? (
            view === 'list' ? (
              <EventList events={filteredEvents} registeredSlugs={registeredSlugs} />
            ) : (
              <CalendarGridView
                events={filteredEvents}
                printHeading={`Randonneurs Ontario · ${title ?? chapter}`}
                printOmitChapter={chapterSlug !== 'all'}
                registeredSlugs={registeredSlugs}
              />
            )
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No events match the selected filter.</p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}

// Re-export Event type for convenience
export type { Event } from '@/components/event-card'

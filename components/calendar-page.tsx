'use client'

import dynamic from 'next/dynamic'
import { PageShell } from '@/components/page-shell'
import { PageHero } from '@/components/page-hero'
import { EventList, type Event } from '@/components/event-card'

// Dynamic import to avoid Radix UI hydration mismatch with DropdownMenu
const CalendarSubscribeButton = dynamic(
  () => import('@/components/calendar-subscribe-button').then((mod) => mod.CalendarSubscribeButton),
  { ssr: false }
)

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
  return (
    <PageShell>
      <PageHero
        image={coverImage}
        eyebrow="2026 Season"
        title={chapter}
        description={description}
      />
      <div className="content-container py-16 md:py-20">
        <div className="flex justify-end mb-6">
          <CalendarSubscribeButton chapter={chapterSlug} />
        </div>
        <EventList events={events} />
      </div>
    </PageShell>
  )
}

// Re-export Event type for convenience
export type { Event } from '@/components/event-card'

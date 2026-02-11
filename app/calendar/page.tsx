import { CalendarPage } from '@/components/calendar-page'
import { getAllUpcomingEvents } from '@/lib/data/events'

export const metadata = {
  title: 'Event Calendar',
  description: 'View upcoming brevets and populaires from all chapters of Randonneurs Ontario.',
}

export default async function AllChaptersCalendarPage() {
  const events = await getAllUpcomingEvents()

  return (
    <CalendarPage
      chapter="All Chapters"
      chapterSlug="all"
      description="Upcoming brevets and populaires from all chapters across Ontario."
      events={events}
    />
  )
}

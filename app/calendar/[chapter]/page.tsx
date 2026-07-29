import { notFound } from 'next/navigation'
import { CalendarPage } from '@/components/calendar-page'
import { getEventsByChapter, getChapterInfo, getAllChapterSlugs } from '@/lib/data/events'
import { BreadcrumbJsonLd } from '@/components/structured-data'

interface PageProps {
  params: Promise<{ chapter: string }>
}

// Generate static params for all chapters
export async function generateStaticParams() {
  return getAllChapterSlugs().map((chapter) => ({
    chapter,
  }))
}

// Generate metadata for each chapter
export async function generateMetadata({ params }: PageProps) {
  const { chapter } = await params
  const chapterInfo = getChapterInfo(chapter)

  if (!chapterInfo) {
    return {
      title: 'Chapter Not Found',
    }
  }

  return {
    title: `${chapterInfo.name} Chapter Calendar`,
    description: `View upcoming brevets and populaires from the ${chapterInfo.name} chapter of Randonneurs Ontario.`,
  }
}

export default async function ChapterCalendarPage({ params }: PageProps) {
  const { chapter } = await params
  const chapterInfo = getChapterInfo(chapter)

  if (!chapterInfo) {
    notFound()
  }

  const events = await getEventsByChapter(chapter)

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', href: '/' },
          { name: 'Calendar', href: '/calendar' },
          { name: chapterInfo.name, href: `/calendar/${chapter}` },
        ]}
      />
      <CalendarPage
        chapter={chapterInfo.name}
        chapterSlug={chapter}
        description={chapterInfo.description}
        coverImage={chapterInfo.coverImage}
        events={events}
        title={`${chapterInfo.name} Chapter Ride Calendar`}
      />
    </>
  )
}

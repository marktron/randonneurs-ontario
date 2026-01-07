import { notFound } from 'next/navigation'
import { RoutesPage } from '@/components/routes-page'
import { getRoutesByChapter, getChapterInfo, getAllChapterSlugs } from '@/lib/data/routes'

interface PageProps {
  params: Promise<{ chapter: string }>
}

export async function generateStaticParams() {
  return getAllChapterSlugs().map((chapter) => ({
    chapter,
  }))
}

export async function generateMetadata({ params }: PageProps) {
  const { chapter } = await params
  const chapterInfo = getChapterInfo(chapter)

  if (!chapterInfo) {
    return {
      title: 'Chapter Not Found',
    }
  }

  return {
    title: `${chapterInfo.name} Chapter Routes`,
    description: `Browse routes from the ${chapterInfo.name} chapter of Randonneurs Ontario.`,
  }
}

export default async function ChapterRoutesPage({ params }: PageProps) {
  const { chapter } = await params
  const chapterInfo = getChapterInfo(chapter)

  if (!chapterInfo) {
    notFound()
  }

  const collections = await getRoutesByChapter(chapter)

  return (
    <RoutesPage
      chapter={chapterInfo.name}
      description={chapterInfo.description}
      coverImage={chapterInfo.coverImage}
      collections={collections}
    />
  )
}

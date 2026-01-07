import { notFound } from "next/navigation"
import { ResultsPage } from "@/components/results-page"
import {
  getChapterResults,
  getChapterMeta,
  getAvailableYears,
  getAllChaptersWithYears,
} from "@/lib/data/results"

// Revalidate every hour - results don't change frequently
export const revalidate = 3600

interface ResultsPageParams {
  params: Promise<{
    year: string
    chapter: string
  }>
}

export async function generateStaticParams() {
  const chapters = await getAllChaptersWithYears()
  const params: { year: string; chapter: string }[] = []

  for (const chapter of chapters) {
    for (const year of chapter.years) {
      params.push({ year: year.toString(), chapter: chapter.slug })
    }
  }

  return params
}

export async function generateMetadata({ params }: ResultsPageParams) {
  const { year, chapter } = await params
  const meta = getChapterMeta(chapter)

  if (!meta) {
    return { title: "Results" }
  }

  return {
    title: `${meta.name} ${year} Results`,
    description: `View ${year} brevet and populaire results from the ${meta.name} chapter of Randonneurs Ontario.`,
  }
}

export default async function ChapterResultsPage({ params }: ResultsPageParams) {
  const { year, chapter } = await params
  const yearNum = parseInt(year, 10)

  const meta = getChapterMeta(chapter)
  if (!meta) {
    notFound()
  }

  const [events, availableYears] = await Promise.all([
    getChapterResults(chapter, yearNum),
    getAvailableYears(chapter),
  ])

  if (availableYears.length === 0) {
    notFound()
  }

  return (
    <ResultsPage
      chapter={meta.name}
      chapterSlug={chapter}
      year={yearNum}
      description={meta.description}
      coverImage={meta.coverImage}
      events={events}
      availableYears={availableYears}
    />
  )
}

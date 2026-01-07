import Link from "next/link"
import { PageShell } from "@/components/page-shell"
import { PageHero } from "@/components/page-hero"
import { getAllChaptersWithYears, getChapterMeta } from "@/lib/data/results"

// Revalidate every hour
export const revalidate = 3600

export const metadata = {
  title: "Results",
  description: "View brevet and populaire results from all chapters of Randonneurs Ontario.",
}

export default async function ResultsIndexPage() {
  const chapters = await getAllChaptersWithYears()

  return (
    <PageShell>
      <PageHero
        image="/toronto.jpg"
        eyebrow="Season Results"
        title="Results"
        description="Browse results from brevets, populaires, and other randonneuring events across Ontario."
      />

      <div className="content-container py-16 md:py-20">
        <div className="grid gap-8 md:grid-cols-2">
          {chapters.map((chapter) => {
            const meta = getChapterMeta(chapter.slug)
            const latestYear = chapter.years[0]
            const earliestYear = chapter.years[chapter.years.length - 1]

            return (
              <Link
                key={chapter.slug}
                href={`/results/${latestYear}/${chapter.slug}`}
                className="group block p-6 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/30 transition-all"
              >
                <h2 className="font-serif text-2xl tracking-tight group-hover:text-primary transition-colors">
                  {chapter.name}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {meta?.description}
                </p>
                <p className="text-sm text-muted-foreground mt-3">
                  {earliestYear === latestYear
                    ? `${latestYear}`
                    : `${earliestYear} – ${latestYear}`}
                  {" · "}
                  {chapter.years.length} {chapter.years.length === 1 ? "season" : "seasons"}
                </p>
              </Link>
            )
          })}
        </div>

        {chapters.length === 0 && (
          <p className="text-center text-muted-foreground py-12">
            No results available yet.
          </p>
        )}
      </div>
    </PageShell>
  )
}

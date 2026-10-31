import type { Metadata } from 'next'
import { PageShell } from '@/components/page-shell'
import { Hero } from '@/components/hero'
import { UpcomingRides } from '@/components/upcoming-rides'
import { ArrowLink } from '@/components/arrow-link'
import { MyRidesSection } from '@/components/my-rides-section'
import { NewsSection } from '@/components/news-section'
import { getHeroImages } from '@/lib/hero-images'
import { getPublishedNews } from '@/lib/data/news'

export const metadata: Metadata = {
  title: {
    absolute: 'Randonneurs Ontario — Long-Distance Cycling in Ontario',
  },
  description:
    'A volunteer-run randonneuring club organizing non-competitive long-distance brevets across Ontario since 1983, with chapters in Toronto, Ottawa, Huron, and Simcoe-Muskoka. See the ride calendar, learn about your first brevet, and join.',
}

export default async function Page() {
  const heroImages = getHeroImages()
  const newsItems = await getPublishedNews()
  return (
    <PageShell>
      <Hero images={heroImages} />

      {/* Two-column layout: Intro + Sidebar.
          On small screens the grid stacks in source order, so News comes first
          and sits above the intro where time-sensitive notices get seen. On lg
          the intro spans both rows on the left and News tops the sidebar column.
          Row 1 is sized to the news block and row 2 absorbs the rest, so the
          lower sidebar sections stay pinned directly beneath it. */}
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:gap-x-20 lg:gap-y-0">
          {newsItems.length > 0 && (
            <div className="lg:col-start-2 lg:row-start-1 lg:border-l lg:border-border lg:pl-12">
              <NewsSection items={newsItems} />
            </div>
          )}

          {/* Main content */}
          <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-2">
            {/* Headline */}
            <h1 className="font-serif text-4xl leading-tight tracking-tight md:text-5xl lg:text-6xl">
              Long-Distance Cycling, at Your Own Pace
            </h1>

            {/* Intro Copy */}
            <div className="mt-10 max-w-3xl space-y-6 text-lg leading-8 text-muted-foreground md:text-xl md:leading-9 prose">
              <p className="prose-lg text-foreground font-medium">
                Long-distance cycling doesn’t have to be loud, fast, or competitive.
              </p>
              <p className="prose-lg">
                There is a particular pleasure in setting out early on a bicycle with a control card
                in your pocket and a very long way to go.
              </p>

              <p className="prose-lg">
                Randonneurs Ontario is a volunteer-run club that has organized <em>brevets</em>{' '}
                (non-competitive rides of 200 km and up) since 1983, across some of the best quiet
                roads in Ontario. There are time limits, but they are generous. The goal is not
                necessarily to be fast, but to keep going.
              </p>

              <p className="prose-lg">
                You might ride through farmland at sunrise, eat a butter tart in a small town cafe,
                fix a flat on the side of the road, and roll back in after dark wondering why the
                day felt both very long and strangely short.
              </p>

              <p className="prose-lg">If that sounds appealing, you’ll fit in here.</p>
            </div>

            {/* Call to Action Links */}
            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-4">
              <ArrowLink href="/your-first-brevet">Learn about your first brevet</ArrowLink>
              <ArrowLink href="/calendar">Explore the calendar</ArrowLink>
              <ArrowLink href="/membership">Become a member</ArrowLink>
            </div>
          </div>

          {/* Sidebar (remaining sections) */}
          <div className="lg:col-start-2 lg:row-start-2 lg:border-l lg:border-border lg:pl-12">
            <MyRidesSection />
            <UpcomingRides />
          </div>
        </div>
      </div>
    </PageShell>
  )
}

import { PageShell } from '@/components/page-shell'
import { Hero } from '@/components/hero'
import { UpcomingRides } from '@/components/upcoming-rides'
import { ArrowLink } from '@/components/arrow-link'
import { MyRidesSection } from '@/components/my-rides-section'
import { getHeroImages } from '@/lib/hero-images'

export default function Page() {
  const heroImages = getHeroImages()
  return (
    <PageShell>
      <Hero images={heroImages} />

      {/* Two-column layout: Intro + Sidebar */}
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex flex-col gap-16 lg:flex-row lg:gap-20">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Headline */}
            <h1 className="font-serif text-4xl leading-tight tracking-tight md:text-5xl lg:text-6xl">
              Long-Distance Cycling, at Your Own Pace
            </h1>

            {/* Intro Copy */}
            <div className="mt-10 max-w-3xl space-y-6 text-lg leading-8 text-muted-foreground md:text-xl md:leading-9">
              <p className="text-foreground font-medium">
                Long-distance cycling doesn&apos;t have to be loud, fast, or competitive.
              </p>

              <p>
                At Randonneurs Ontario, it&apos;s about self-reliance, curiosity, and seeing how far
                you can go under your own power.
              </p>

              <p>
                Randonneurs Ontario is a volunteer-run cycling organization dedicated to
                non-competitive long-distance cycling in Ontario. We organize brevets — structured
                rides of 200 km and beyond — that challenge riders to manage pacing, navigation, and
                endurance within generous time limits.
              </p>

              <p>
                Riders participate for many reasons: to explore quiet roads, to test themselves, to
                ride through the night, or simply to experience distance differently. There are no
                podiums and no winners — only the satisfaction of steady forward progress.
              </p>

              <p>
                Whether you are curious about your first long ride or are an experienced randonneur
                planning a season, you&apos;ll find your place here.
              </p>
            </div>

            {/* Call to Action Links */}
            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-4">
              <ArrowLink href="/calendar">Start with your first brevet</ArrowLink>
              <ArrowLink href="/calendar">Explore the calendar</ArrowLink>
              <ArrowLink href="/membership">Join the community</ArrowLink>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:w-80 lg:shrink-0 lg:border-l lg:border-border lg:pl-12">
            <MyRidesSection />
            <UpcomingRides />
          </div>
        </div>
      </div>
    </PageShell>
  )
}

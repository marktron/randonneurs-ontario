import { PageShell } from '@/components/page-shell'
import { ControlCardForm } from '@/components/control-card-form'
import { getActiveRoutesWithRwgps } from '@/lib/data/routes'
import Link from 'next/link'

export const metadata = {
  title: 'Print Control Cards',
  description:
    'Generate and print BRM control cards for any active route. Control times are calculated automatically.',
}

export default async function ControlCardsPage() {
  const routes = await getActiveRoutesWithRwgps()

  return (
    <PageShell>
      <div className="content-container-wide py-12 md:py-16">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
          {/* Left Column - Information */}
          <div className="flex-1 min-w-0">
            <div className="mb-8">
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-muted-foreground mb-3">
                Tools
              </p>
              <h1 className="font-serif text-4xl md:text-5xl tracking-tight">
                Print Control Cards
              </h1>
            </div>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-lg text-muted-foreground leading-relaxed">
                Generate printable BRM control cards for any active route. Control opening and
                closing times are calculated automatically from the route distance and your start
                time.
              </p>

              <div className="mt-10 space-y-8">
                <div>
                  <h2 className="font-serif text-xl tracking-tight mb-3">How it works</h2>
                  <ol className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                        1
                      </span>
                      <span>Select a route and set your start date and time</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                        2
                      </span>
                      <span>
                        Control points are imported automatically from RideWithGPS when available,
                        or you can add them manually
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                        3
                      </span>
                      <span>Edit control points as needed</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                        4
                      </span>
                      <span>
                        Generate and print your cards. Opening and closing times are calculated
                        using standard BRM rules.
                      </span>
                    </li>
                  </ol>
                </div>

                <div>
                  <h2 className="font-serif text-xl tracking-tight mb-3">Notes</h2>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex gap-2">
                      <span className="text-primary">&bull;</span>
                      <span>
                        You normally won’t need to print the cards yourself. The ride organizer will
                        distribute control cards at the event check-in.
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-primary">&bull;</span>
                      <span>Cards are designed for double-sided printing on letter-size paper</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-primary">&bull;</span>
                      <span>Two cards print per sheet (front and back)</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-primary">&bull;</span>
                      <span>
                        Control times follow{' '}
                        <Link
                          href="https://www.audax-club-parisien.com/en/our-organization/our-rules/"
                          className="text-primary hover:underline underline-offset-2"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          ACP/BRM rules
                        </Link>
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Form */}
          <div className="lg:w-[480px] lg:shrink-0">
            <ControlCardForm routes={routes} />
          </div>
        </div>
      </div>
    </PageShell>
  )
}

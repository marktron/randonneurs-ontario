import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { PageHero } from '@/components/page-hero'
import { EventList } from '@/components/event-card'
import { Button } from '@/components/ui/button'
import { getPermanentEvents } from '@/lib/data/events'

export const metadata = {
  title: 'Permanents Calendar',
  description: 'View scheduled permanent rides and register to ride any active route on your own schedule.',
}

export default async function PermanentsCalendarPage() {
  const events = await getPermanentEvents()

  return (
    <PageShell>
      <PageHero
        image="/toronto.jpg"
        eyebrow="2026 Season"
        title="Permanents"
        description="Ride any active route on your own schedule, outside of the regular brevet calendar."
      />
      <div className="content-container py-16 md:py-20">
        {/* CTA Section */}
        <div className="bg-muted/50 border border-border rounded-lg p-6 md:p-8 mb-12">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
            Schedule a Permanent
          </h2>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Choose any active route and ride it on your own schedule. Submit your request at least two weeks in advance to allow time for coordination.
          </p>
          <Button asChild className="mt-6">
            <Link href="/register/permanent">Register for a Permanent</Link>
          </Button>
        </div>

        {/* Scheduled Permanents */}
        {events.length > 0 ? (
          <>
            <h2 className="font-serif text-2xl md:text-3xl tracking-tight mb-8">
              Scheduled Permanents
            </h2>
            <EventList events={events} />
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>No permanents currently scheduled.</p>
            <p className="mt-1">Use the button above to register for one.</p>
          </div>
        )}
      </div>
    </PageShell>
  )
}

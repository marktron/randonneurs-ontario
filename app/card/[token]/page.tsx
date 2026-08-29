import { cache } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { BrevetCard } from '@/components/brevet-card-view'
import { getBrevetCardByToken } from '@/lib/actions/brevet-card'
import { isDigitalCardEventType } from '@/lib/brevet-card'
import { formatRideName } from '@/lib/events/format'

interface PageProps {
  params: Promise<{ token: string }>
}

export const dynamic = 'force-dynamic'

// Dedupe the card fetch between generateMetadata and the page within a
// single request (force-dynamic disables any other caching layer).
const getCard = cache(getBrevetCardByToken)

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params
  const data = await getCard(token)

  if (!data) {
    return { title: 'Brevet Card Not Found', robots: { index: false, follow: false } }
  }

  return {
    title: `Brevet Card: ${formatRideName(data.event.name, data.event.distanceKm)}`,
    robots: { index: false, follow: false },
  }
}

export default async function BrevetCardPage({ params }: PageProps) {
  const { token } = await params
  const data = await getCard(token)

  if (!data) {
    notFound()
  }

  const cardAvailable =
    data.registration.status === 'registered' &&
    isDigitalCardEventType(data.event.eventType) &&
    data.controls.length > 0

  if (!cardAvailable) {
    let reason: string
    let notSetUp = false
    if (data.registration.status !== 'registered') {
      reason = 'This registration is no longer active, so its brevet card is unavailable.'
    } else if (!isDigitalCardEventType(data.event.eventType)) {
      reason = 'Digital brevet cards are not available for this type of event.'
    } else {
      notSetUp = true
      reason =
        'The organizer hasn’t set up the digital control card for this event yet. Check back closer to the event, or use the paper brevet card handed out at the start.'
    }

    return (
      <PageShell>
        <div className="content-container pt-20 md:pt-28 max-w-2xl pb-16">
          <h1 className="font-serif text-3xl md:text-4xl tracking-tight">Digital Brevet Card</h1>
          <p className="mt-4 text-muted-foreground">{reason}</p>
          {notSetUp && (
            <p className="mt-4">
              <Link href="/digital-control-cards" className="underline underline-offset-4">
                Learn more about digital control cards
              </Link>
            </p>
          )}
          <p className="mt-4">
            <Link href={`/registration/manage/${token}`} className="underline underline-offset-4">
              Manage your registration
            </Link>
          </p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <BrevetCard token={token} initialData={data} />
    </PageShell>
  )
}

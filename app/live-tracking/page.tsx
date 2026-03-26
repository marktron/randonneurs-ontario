import Link from 'next/link'
import { PageShell } from '@/components/page-shell'

export const metadata = {
  title: 'Live Tracking',
  description:
    'Follow riders in real time on our SpotWalla map and learn how to add your own tracker.',
}

export default function LiveTrackingPage() {
  const mapUrl = process.env.NEXT_PUBLIC_SPOTWALLA_MAP

  return (
    <PageShell>
      {/* Header */}
      <div className="content-container pt-20 md:pt-28 max-w-4xl">
        <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl tracking-tight">
          Live Tracking
        </h1>
      </div>
      <article className="prose content-container-editorial py-6 max-w-4xl">
        <p>
          Follow Randonneurs Ontario riders close to real time during events. We use SpotWalla to
          display GPS trackers on a shared map. Since this is an opt-in feature, not every rider
          will appear on the map.
        </p>
        {/* Instructions */}
        <h2>Add Yourself to the Map</h2>
        <p>
          If you have a SPOT Tracker, Garmin InReach, or a{' '}
          <a href="https://spotwalla.com/help/devices" target="_blank" rel="noopener noreferrer">
            supported smartphone app
          </a>
          , you can add yourself to the map. Spotwalla charges a small{' '}
          <a
            href="https://spotwalla.com/help/memberships"
            target="_blank"
            rel="noopener noreferrer"
          >
            membership fee
          </a>{' '}
          to register a tracking device.
        </p>
        <p>
          <Link href="/riders/john-cumming">John Cumming</Link> manages the club’s SpotWalla page
          and has prepared step-by-step guides:
        </p>
        <ul>
          <li>
            <a
              href="/guides/Location-Sharing-Key-Concepts.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              Getting started with SpotWalla
            </a>
          </li>
          <li>
            <a
              href="/guides/Joining-Brevet-Page-from-your-Phone.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              Joining a Brevet page from your phone
            </a>
          </li>
        </ul>

        {/* Map Embed */}
        {mapUrl && (
          <div className="mt-6">
            <h2>Live Map</h2>
            <div className="mt-6 aspect-[3/4] md:aspect-[4/3] w-full overflow-hidden rounded-md border border-border">
              <iframe
                src={mapUrl}
                title="SpotWalla live tracking map"
                className="h-full w-full"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm no-underline hover:text-primary transition-colors"
            >
              View on SpotWalla
              <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
        )}
      </article>
    </PageShell>
  )
}

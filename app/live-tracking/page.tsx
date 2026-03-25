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

      <article className="content-container-editorial py-6 max-w-4xl">
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Follow Randonneurs Ontario riders in (near) real time during events. We use SpotWalla to
          display GPS trackers on a shared map. Since this is an opt-in feature, not every rider
          will appear on the map.
        </p>
        {/* Instructions */}
        <h2 className="mt-6 font-serif text-2xl tracking-tight">Add Yourself to the Map</h2>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          If you have a SPOT Tracker, Garmin InReach, or a{' '}
          <a
            href="https://spotwalla.com/help/devices"
            target="_blank"
            rel="noopener noreferrer"
            className=" hover:text-primary underline"
          >
            supported smartphone app
          </a>
          , you can add yourself to the map. SpotWalla maps are free to view, but there is a small
          fee to track a device during events.
        </p>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          <Link href="/riders/john-cumming" className=" hover:text-primary underline">
            John Cumming
          </Link>
          , who manages the club’s SpotWalla page, has prepared a{' '}
          <a
            href="/guides/Location-Sharing-Key-Concepts.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className=" hover:text-primary underline"
          >
            guide to help you get started
          </a>
          , as well as a guide to{' '}
          <a
            href="/guides/Joining-Brevet-Page-from-your-Phone.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className=" hover:text-primary underline"
          >
            manage SpotWalla from your phone
          </a>
          .
        </p>

        {/* Map Embed */}
        {mapUrl && (
          <div className="mt-6">
            <h2 className="font-serif text-2xl tracking-tight">Live Map</h2>
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
              className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
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

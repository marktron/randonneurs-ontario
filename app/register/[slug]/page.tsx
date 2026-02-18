import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { PageShell } from '@/components/page-shell'
import { RegisterCTA } from '@/components/register-cta'
import { MarkdownContent } from '@/components/markdown-content'
import { RwgpsEmbed } from '@/components/rwgps-embed'
import { getEventBySlug, getRegisteredRiders } from '@/lib/data/events'
import { MapPinIcon, CalendarIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  params: Promise<{ slug: string }>
}

// Always render fresh - registered riders list changes frequently
export const dynamic = 'force-dynamic'

// Generate metadata for each event
export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const event = await getEventBySlug(slug)

  if (!event) {
    return {
      title: 'Event Not Found',
    }
  }

  return {
    title: `Register for ${event.name} ${event.distance}km`,
    description: `Register for the ${event.name} ${event.distance}km ${event.type.toLowerCase()} on ${formatDateShort(event.date)}.`,
  }
}

function formatDateShort(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatEventDate(dateString: string, timeString: string): string {
  const date = new Date(dateString + 'T00:00:00')
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' })
  const month = date.toLocaleDateString('en-US', { month: 'long' })
  const day = date.getDate()
  const year = date.getFullYear()

  const [hours, minutes] = timeString.split(':')
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12

  return `${dayOfWeek} ${month} ${day}, ${year} at ${hour12}:${minutes} ${ampm}`
}

function createGoogleMapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}

export default async function RegisterPage({ params }: PageProps) {
  const { slug } = await params
  const event = await getEventBySlug(slug)

  if (!event) {
    notFound()
  }

  const registeredRiders = await getRegisteredRiders(event.id)

  return (
    <PageShell>
      {/* Hero Image - Full bleed */}
      {event.imageUrl && (
        <div className="relative w-full h-[25vh] md:h-[50vh] min-h-[180px] md:min-h-[350px] max-h-[550px]">
          <Image
            src={event.imageUrl}
            alt={event.name}
            fill
            className="object-cover editorial-image"
            sizes="100vw"
            priority
            unoptimized
          />
        </div>
      )}

      {/* Event Header */}
      <header className="bg-background">
        <div className="content-container-wide pt-6 md:pt-10 pb-4 md:pb-6">
          {/* Kicker / Overline */}
          <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
            <Badge variant="secondary" className="text-xs tracking-wider font-medium">
              {event.type}
            </Badge>
            <span className="text-xs tracking-[0.15em] uppercase text-muted-foreground">
              {event.distance} km · {event.chapterName}
            </span>
          </div>

          {/* Title */}
          <h1 className="font-serif text-3xl md:text-5xl lg:text-6xl tracking-tight mb-4 md:mb-6">
            {event.name}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span>{formatEventDate(event.date, event.startTime)}</span>
            </div>
            {event.startLocation ? (
              <div className="flex items-center gap-2">
                <MapPinIcon className="h-4 w-4 text-muted-foreground" />
                <Link
                  href={createGoogleMapsUrl(event.startLocation)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline underline-offset-2"
                >
                  {event.startLocation}
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <MapPinIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Start control per route</span>
              </div>
            )}
          </div>

          {/* Mobile Register CTA */}
          <div className="lg:hidden mt-6">
            <RegisterCTA eventId={event.id} isPermanent={event.type === 'Permanent'} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="content-container-wide pt-6 md:pt-8 pb-12 md:pb-16">
        <div className="flex flex-col gap-8 md:gap-12 lg:flex-row lg:gap-16">
          {/* Left Column - Event Details */}
          <div className="flex-1 min-w-0">
            {/* Event Description */}
            {event.description && (
              <div className="mb-8 md:mb-12 -mt-4">
                <MarkdownContent content={event.description} />
              </div>
            )}

            {/* Route Map or Cue Sheet */}
            {event.rwgpsId ? (
              <div className="mb-8 md:mb-12">
                <h2 className="font-serif text-2xl tracking-tight pb-4">Route</h2>
                <RwgpsEmbed routeId={event.rwgpsId} />
                {event.routeSlug && (
                  <p className="mt-3 text-sm">
                    <Link
                      href={`/routes/${event.chapterSlug}/${event.routeSlug}`}
                      className="text-primary hover:underline underline-offset-2"
                    >
                      View past results for this route
                    </Link>
                  </p>
                )}
              </div>
            ) : event.cueSheetUrl ? (
              <div className="mb-8 md:mb-12">
                <h2 className="font-serif text-2xl tracking-tight">Route</h2>
                <a
                  href={event.cueSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline underline-offset-2"
                >
                  View Cue Sheet
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
                {event.routeSlug && (
                  <p className="mt-3 text-sm">
                    <Link
                      href={`/routes/${event.chapterSlug}/${event.routeSlug}`}
                      className="text-primary hover:underline underline-offset-2"
                    >
                      View past results for this route
                    </Link>
                  </p>
                )}
              </div>
            ) : null}

            {/* Registered Riders */}
            <div className="">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="font-serif text-2xl tracking-tight">Registered</h2>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {registeredRiders.length} {registeredRiders.length === 1 ? 'rider' : 'riders'}
                </span>
              </div>
              {registeredRiders.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 sm:gap-x-8 gap-y-1">
                  {registeredRiders.map((rider, index) => (
                    <p key={index} className="text-sm py-1.5 border-b border-border/50 truncate">
                      {rider.name}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No riders registered yet. Be the first!
                </p>
              )}
            </div>
          </div>

          {/* Right Column - Registration Form (desktop only) */}
          <div className="hidden lg:block lg:w-[400px] lg:shrink-0">
            <RegisterCTA eventId={event.id} isPermanent={event.type === 'Permanent'} />
          </div>
        </div>
      </div>
    </PageShell>
  )
}

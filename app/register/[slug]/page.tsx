import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { PageShell } from '@/components/page-shell'
import { RegisterCTA } from '@/components/register-cta'
import { MarkdownContent } from '@/components/markdown-content'
import { RwgpsEmbed } from '@/components/rwgps-embed'
import {
  getEventBySlug,
  getRegisteredRiders,
  getFlecheTeams,
  getRegisteredRidersWithTeams,
  type RegisteredRider,
} from '@/lib/data/events'
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

  const isFlecheMeta = event.type === 'Fleche'
  const flecheTitle = isFlecheMeta
    ? `${new Date(event.date + 'T00:00:00').getFullYear()} Flèche${event.startLocation ? ` – ${event.startLocation}` : ''}`
    : null

  return {
    title: `Register for ${flecheTitle || `${event.name} ${event.distance}km`}`,
    description: isFlecheMeta
      ? `Register your team for the ${flecheTitle} on ${formatDateShort(event.date)}.`
      : `Register for the ${event.name} ${event.distance}km ${event.type.toLowerCase()} on ${formatDateShort(event.date)}.`,
    ...(event.imageUrl && {
      openGraph: {
        images: [{ url: event.imageUrl }],
      },
    }),
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

  const isFleche = event.type === 'Fleche'
  const flecheDisplayName = isFleche
    ? `${new Date(event.date + 'T00:00:00').getFullYear()} Flèche${event.startLocation ? ` – ${event.startLocation}` : ''}`
    : null
  const [registeredRiders, flecheTeams] = await Promise.all([
    isFleche ? getRegisteredRidersWithTeams(event.id) : getRegisteredRiders(event.id),
    isFleche ? getFlecheTeams(event.id) : Promise.resolve([]),
  ])

  return (
    <PageShell>
      {/* Hero Section */}
      {event.imageUrl ? (
        <div className="relative w-full h-[30vh] md:h-[60vh] min-h-[200px] md:min-h-[350px] max-h-[550px] overflow-hidden">
          <Image
            src={event.imageUrl}
            alt={event.name}
            fill
            className="object-cover editorial-image"
            sizes="100vw"
            priority
            unoptimized
          />
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-neutral-900/70 to-transparent pt-16 md:pt-24">
            <div className="content-container-wide mt-10 pb-6 md:pb-8">
              <Badge
                variant="secondary"
                className="bg-white/90 text-neutral-900 text-xs tracking-wider font-medium mb-3"
              >
                {event.type}
              </Badge>
              <h1 className="font-serif text-3xl md:text-5xl lg:text-6xl tracking-tight text-neutral-100 text-shadow-lg">
                {flecheDisplayName || event.name}
              </h1>
            </div>
          </div>
        </div>
      ) : null}

      {/* Event Header — meta info below image (or full header if no image) */}
      <header className="bg-background">
        <div className="content-container-wide pt-6 md:pt-10 pb-4 md:pb-6">
          {/* Show full header when no image */}
          {!event.imageUrl && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
                <Badge variant="secondary" className="text-xs tracking-wider font-medium">
                  {event.type}
                </Badge>
                {!isFleche && (
                  <span className="text-xs tracking-[0.15em] uppercase text-muted-foreground">
                    {event.distance} km · {event.chapterName}
                  </span>
                )}
              </div>
              <h1 className="font-serif text-3xl md:text-5xl lg:text-6xl tracking-tight mb-4 md:mb-6">
                {flecheDisplayName || event.name}
              </h1>
            </>
          )}

          {/* Kicker line (shown when image exists — badge/title are on the image) */}
          {event.imageUrl && !isFleche && (
            <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
              <span className="text-xs tracking-[0.15em] uppercase text-muted-foreground">
                {event.distance} km · {event.chapterName}
              </span>
            </div>
          )}

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
            <RegisterCTA
              eventId={event.id}
              isPermanent={event.type === 'Permanent'}
              isFleche={isFleche}
              existingTeams={flecheTeams}
            />
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
                isFleche ? (
                  <FlecheRegisteredRiders riders={registeredRiders} />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 sm:gap-x-8 gap-y-1">
                    {registeredRiders.map((rider, index) => (
                      <p key={index} className="text-sm py-1.5 border-b border-border/50 truncate">
                        {rider.name}
                      </p>
                    ))}
                  </div>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  No riders registered yet. Be the first!
                </p>
              )}
            </div>
          </div>

          {/* Right Column - Registration Form (desktop only) */}
          <div className="hidden lg:block lg:w-[400px] lg:shrink-0">
            <RegisterCTA
              eventId={event.id}
              isPermanent={event.type === 'Permanent'}
              isFleche={isFleche}
              existingTeams={flecheTeams}
            />
          </div>
        </div>
      </div>
    </PageShell>
  )
}

function FlecheRegisteredRiders({ riders }: { riders: RegisteredRider[] }) {
  // Group riders by team
  const teamMap = new Map<string, RegisteredRider[]>()
  const unassigned: RegisteredRider[] = []

  for (const rider of riders) {
    if (rider.teamName) {
      const existing = teamMap.get(rider.teamName) || []
      existing.push(rider)
      teamMap.set(rider.teamName, existing)
    } else {
      unassigned.push(rider)
    }
  }

  const teams = Array.from(teamMap.entries()).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-6">
      {teams.map(([teamName, teamRiders]) => (
        <div key={teamName}>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="font-serif text-lg tracking-tight">{teamName}</h3>
            <span className="text-xs tabular-nums text-muted-foreground">
              {teamRiders.length} {teamRiders.length === 1 ? 'rider' : 'riders'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 sm:gap-x-8 gap-y-1">
            {teamRiders.map((rider, index) => (
              <p key={index} className="text-sm py-1.5 border-b border-border/50 truncate">
                {rider.name}
              </p>
            ))}
          </div>
        </div>
      ))}
      {unassigned.length > 0 && (
        <div className="text-muted-foreground">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="font-serif text-lg tracking-tight">Unassigned</h3>
            <span className="text-xs tabular-nums text-muted-foreground">
              {unassigned.length} {unassigned.length === 1 ? 'rider' : 'riders'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 sm:gap-x-8 gap-y-1">
            {unassigned.map((rider, index) => (
              <p key={index} className="text-sm py-1.5 border-b border-border/50 truncate">
                {rider.name}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

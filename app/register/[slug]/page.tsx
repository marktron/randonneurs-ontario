import { notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { RegistrationForm } from "@/components/registration-form";
import { getEventBySlug, getAllEventSlugs, getRegisteredRiders } from "@/lib/data/events";
import { MapPinIcon, CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Generate static params for all events
export async function generateStaticParams() {
  const slugs = await getAllEventSlugs();
  return slugs.map((slug) => ({ slug }));
}

// Generate metadata for each event
export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);

  if (!event) {
    return {
      title: "Event Not Found",
    };
  }

  return {
    title: `Register for ${event.name} ${event.distance}km`,
    description: `Register for the ${event.name} ${event.distance}km ${event.type.toLowerCase()} on ${formatDateShort(event.date)}.`,
  };
}

function formatDateShort(dateString: string): string {
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatEventDate(dateString: string, timeString: string): string {
  const date = new Date(dateString + "T00:00:00");
  const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "short" });
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  const year = date.getFullYear();

  const [hours, minutes] = timeString.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `${dayOfWeek} ${month} ${day}, ${year} at ${hour12}:${minutes} ${ampm}`;
}

function createGoogleMapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export default async function RegisterPage({ params }: PageProps) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);

  if (!event) {
    notFound();
  }

  const registeredRiders = await getRegisteredRiders(event.id);

  return (
    <PageShell>
      <div className="content-container-wide py-12 md:py-16">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
          {/* Left Column - Event Details */}
          <div className="flex-1 min-w-0">
            {/* Event Header */}
            <div className="mb-8">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <Badge variant="secondary" className="text-xs tracking-wider font-medium">
                  {event.type}
                </Badge>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {event.distance} km
                </span>
                <span className="text-sm text-muted-foreground">
                  {event.chapterName} Chapter
                </span>
              </div>
              <h1 className="font-serif text-4xl md:text-5xl tracking-tight">
                {event.name}
              </h1>
            </div>

            {/* Event Meta */}
            <div className="space-y-4 mb-10">
              <div className="flex items-start gap-3">
                <CalendarIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">{formatEventDate(event.date, event.startTime)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPinIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  {event.startLocation ? (
                    <Link
                      href={createGoogleMapsUrl(event.startLocation)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline underline-offset-2"
                    >
                      {event.startLocation}
                    </Link>
                  ) : (
                    <p className="font-medium text-muted-foreground">Start control per route</p>
                  )}
                </div>
              </div>
            </div>

            {/* Route Map or Cue Sheet */}
            {event.rwgpsId ? (
              <div className="mb-10">
                <h2 className="text-xs font-medium tracking-[0.2em] uppercase text-muted-foreground mb-4">
                  Route
                </h2>
                <div className="aspect-[4/3] w-full overflow-hidden">
                  <iframe
                    src={`https://ridewithgps.com/embeds?type=route&id=${event.rwgpsId}&sampleGraph=true`}
                    className="w-full h-full"
                    style={{ border: "none" }}
                    title="Route Map"
                  />
                </div>
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
              <div className="mb-10">
                <h2 className="text-xs font-medium tracking-[0.2em] uppercase text-muted-foreground mb-4">
                  Route
                </h2>
                <a
                  href={event.cueSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline underline-offset-2"
                >
                  View Cue Sheet
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
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
            <div className="border-t border-border pt-10">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="font-serif text-2xl tracking-tight">
                  Registered
                </h2>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {registeredRiders.length} {registeredRiders.length === 1 ? 'rider' : 'riders'}
                </span>
              </div>
              {registeredRiders.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-1">
                  {registeredRiders.map((rider, index) => (
                    <p
                      key={index}
                      className="text-sm py-1.5 border-b border-border/50 truncate"
                    >
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

          {/* Right Column - Registration Form */}
          <div className="lg:w-[400px] lg:shrink-0">
            <RegistrationForm eventId={event.id} isPermanent={event.type === "Permanent"} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

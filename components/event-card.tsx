import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export interface Event {
  slug: string; // Event slug for registration link
  date: string; // ISO date string
  name: string;
  type: "Populaire" | "Brevet" | "Fleche" | "Permanent";
  distance: string;
  startLocation: string;
  startTime: string; // HH:MM format
}

function formatDate(dateString: string): { dayOfWeek: string; month: string; day: string; year: string } {
  const date = new Date(dateString + "T00:00:00");
  const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });
  const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const day = date.getDate().toString();
  const year = date.getFullYear().toString();
  return { dayOfWeek, month, day, year };
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes}${ampm}`;
}

export function EventCard({ event }: { event: Event }) {
  const { dayOfWeek, month, day } = formatDate(event.date);

  return (
    <article className="group grid grid-cols-[4.5rem_1fr] gap-6 py-8 sm:grid-cols-[6rem_1fr] sm:gap-10">
      {/* Date block */}
      <div className="text-center border-r border-border pr-6 sm:pr-10">
        <div className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground">
          {month}
        </div>
        <div className="text-4xl font-serif tabular-nums leading-none mt-1 sm:text-5xl">
          {day}
        </div>
        <div className="text-[11px] font-medium tracking-wide text-muted-foreground mt-2 hidden sm:block">
          {dayOfWeek}
        </div>
      </div>

      {/* Event details */}
      <div className="min-w-0 flex flex-col justify-center">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-serif text-xl leading-tight sm:text-2xl">
            <Link
              href={`/register/${event.slug}`}
              className="hover:text-primary transition-colors"
            >
              {event.name}
            </Link>
          </h3>
          <span className="text-sm tabular-nums text-muted-foreground">
            {event.distance} km
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span>{event.startLocation}</span>
          <span className="hidden sm:inline text-border">|</span>
          <span className="tabular-nums">{formatTime(event.startTime)}</span>
          <Badge variant="outline" className="text-[10px] tracking-wider font-medium ml-auto sm:ml-0">
            {event.type}
          </Badge>
        </div>

        <div className="mt-4">
          <Link
            href={`/register/${event.slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-4 decoration-primary/40 hover:decoration-primary transition-colors"
          >
            Register for this event
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    </article>
  );
}

export function EventList({ events }: { events: Event[] }) {
  // Group events by month
  const eventsByMonth = events.reduce((acc, event) => {
    const date = new Date(event.date + "T00:00:00");
    const monthKey = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!acc[monthKey]) {
      acc[monthKey] = [];
    }
    acc[monthKey].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  return (
    <div className="space-y-16">
      {Object.entries(eventsByMonth).map(([month, monthEvents]) => (
        <section key={month}>
          <header className="mb-8">
            <h2 className="text-xs font-medium tracking-[0.25em] uppercase text-muted-foreground">
              {month}
            </h2>
          </header>
          <div className="divide-y divide-border">
            {monthEvents.map((event, index) => (
              <EventCard key={`${event.date}-${event.distance}-${index}`} event={event} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

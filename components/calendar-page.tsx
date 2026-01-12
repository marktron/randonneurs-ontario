import { PageShell } from "@/components/page-shell";
import { PageHero } from "@/components/page-hero";
import { EventList, type Event } from "@/components/event-card";
import { CalendarSubscribeButton } from "@/components/calendar-subscribe-button";

export interface CalendarPageProps {
  chapter: string;
  chapterSlug: string;
  description: string;
  coverImage: string;
  events: Event[];
}

export function CalendarPage({ chapter, chapterSlug, description, coverImage, events }: CalendarPageProps) {
  return (
    <PageShell>
      <PageHero
        image={coverImage}
        eyebrow="2026 Season"
        title={chapter}
        description={description}
      />
      <div className="content-container py-16 md:py-20">
        <div className="flex justify-end mb-6">
          <CalendarSubscribeButton chapter={chapterSlug} chapterName={chapter} />
        </div>
        <EventList events={events} />
      </div>
    </PageShell>
  );
}

// Re-export Event type for convenience
export type { Event } from "@/components/event-card";

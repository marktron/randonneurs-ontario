"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { PageHero } from "@/components/page-hero";
import { type EventResult } from "@/lib/data/results";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

export interface ResultsPageProps {
  chapter: string;
  chapterSlug: string;
  year: number;
  description: string;
  coverImage: string;
  events: EventResult[];
  availableYears: number[];
}

function formatFullDate(dateString: string): string {
  const date = new Date(dateString + "T00:00:00");
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

export function ResultsPage({
  chapter,
  chapterSlug,
  year,
  description,
  coverImage,
  events,
  availableYears,
}: ResultsPageProps) {
  const router = useRouter();

  const totalStarters = events.reduce((acc, event) => acc + event.riders.length, 0);
  const totalDistance = events.reduce((acc, event) => {
    const finishers = event.riders.filter((r) => !["DNF", "DNS", "OTL", "DQ"].includes(r.time)).length;
    return acc + (parseInt(event.distance, 10) * finishers);
  }, 0);

  const currentIndex = availableYears.indexOf(year);
  const prevYear = currentIndex < availableYears.length - 1 ? availableYears[currentIndex + 1] : null;
  const nextYear = currentIndex > 0 ? availableYears[currentIndex - 1] : null;

  const handleYearChange = (newYear: string) => {
    router.push(`/results/${newYear}/${chapterSlug}`);
  };

  return (
    <PageShell>
      <PageHero
        image={coverImage}
        eyebrow="Season Results"
        title={chapter}
        description={description}
      />

      {/* Year Navigation & Season Stats */}
      <div className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            {/* Year Selector */}
            <div className="flex items-center">
              {/* Previous Year */}
              <Link
                href={prevYear ? `/results/${prevYear}/${chapterSlug}` : '#'}
                className={`group relative p-3 -m-3 transition-all duration-200 ${
                  prevYear
                    ? 'text-muted-foreground hover:text-foreground cursor-pointer'
                    : 'text-muted-foreground/20 pointer-events-none'
                }`}
                aria-label={prevYear ? `View ${prevYear} results` : 'No earlier results'}
                aria-disabled={!prevYear}
                tabIndex={prevYear ? 0 : -1}
              >
                <ChevronLeftIcon className="h-5 w-5 transition-transform duration-200 group-hover:-translate-x-0.5" />
              </Link>

              {/* Year Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className="group relative w-auto min-w-[7rem] bg-transparent h-auto py-1 px-3 focus:outline-none">
                  <span className="font-serif text-4xl tracking-tight tabular-nums transition-colors duration-200 group-hover:text-primary">
                    {year}
                  </span>
                  <span className="absolute -bottom-1 left-3 right-3 h-px bg-current opacity-0 group-hover:opacity-20 transition-opacity duration-200" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="max-h-72 min-w-[8rem]"
                  align="center"
                >
                  <DropdownMenuRadioGroup value={year.toString()} onValueChange={handleYearChange}>
                    {availableYears.map((y) => (
                      <DropdownMenuRadioItem
                        key={y}
                        value={y.toString()}
                        className="font-serif text-lg tracking-tight tabular-nums justify-center cursor-pointer"
                      >
                        {y}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Next Year */}
              <Link
                href={nextYear ? `/results/${nextYear}/${chapterSlug}` : '#'}
                className={`group relative p-3 -m-3 transition-all duration-200 ${
                  nextYear
                    ? 'text-muted-foreground hover:text-foreground cursor-pointer'
                    : 'text-muted-foreground/20 pointer-events-none'
                }`}
                aria-label={nextYear ? `View ${nextYear} results` : 'No later results'}
                aria-disabled={!nextYear}
                tabIndex={nextYear ? 0 : -1}
              >
                <ChevronRightIcon className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>

            {/* Season Stats */}
            <div className="flex items-baseline gap-6 sm:gap-10">
              <div className="group">
                <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground/70 transition-colors duration-200 group-hover:text-muted-foreground">
                  Events
                </p>
                <p className="font-serif text-2xl sm:text-3xl tracking-tight tabular-nums">
                  {events.length}
                </p>
              </div>
              <div className="group">
                <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground/70 transition-colors duration-200 group-hover:text-muted-foreground">
                  Riders
                </p>
                <p className="font-serif text-2xl sm:text-3xl tracking-tight tabular-nums">
                  {totalStarters}
                </p>
              </div>
              <div className="group">
                <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground/70 transition-colors duration-200 group-hover:text-muted-foreground">
                  Distance
                </p>
                <p className="font-serif text-2xl sm:text-3xl tracking-tight tabular-nums whitespace-nowrap">
                  {totalDistance.toLocaleString()} km
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="content-container py-16 md:py-20">
        {events.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            No results yet for the {year} season.
          </p>
        ) : (
          <div className="space-y-16">
            {events.map((event) => {
              // Count riders excluding DNS
              const participants = event.riders.filter((r) => r.time !== "DNS");

              return (
                <article key={`${event.date}-${event.name}-${event.distance}`} id={`event-${event.date}`} className="scroll-mt-24">
                  {/* Event Header */}
                  <header className="mb-6">
                    <h2 className="font-serif text-2xl md:text-3xl tracking-tight">
                      {event.routeSlug ? (
                        <Link
                          href={`/routes/${chapterSlug}/${event.routeSlug}`}
                          className="hover:text-primary transition-colors"
                        >
                          {event.name} {event.distance}
                        </Link>
                      ) : (
                        <>{event.name} {event.distance}</>
                      )}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatFullDate(event.date)} · {event.distance} km · {participants.length} {participants.length === 1 ? 'rider' : 'riders'}
                    </p>
                  </header>

                  {/* Riders Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1">
                    {participants.map((rider, index) => (
                      <div
                        key={`${rider.name}-${index}`}
                        className="flex items-baseline justify-between py-1.5 border-b border-border/50 group"
                      >
                        <Link
                          href={`/riders/${rider.slug}`}
                          className="text-sm hover:text-primary transition-colors truncate pr-4"
                        >
                          {rider.name}
                        </Link>
                        <span
                          className={`text-sm tabular-nums shrink-0 ${
                            rider.time === "DNF" || rider.time === "DNS"
                              ? "text-muted-foreground/60"
                              : "text-muted-foreground"
                          }`}
                        >
                          {rider.time}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}

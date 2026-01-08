"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import Fade from "embla-carousel-fade";
import { cn } from "@/lib/utils";
import type { HeroImage } from "@/lib/hero-images";

type HeroProps = {
  images: HeroImage[];
};

export function Hero({ images }: HeroProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      duration: 40,
    },
    [
      Autoplay({
        delay: 6000,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
      }),
      Fade(),
    ]
  );

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  return (
    <section className="relative">
      {/* Hero Carousel - Full bleed */}
      <div className="relative h-[50vh] min-h-[300px] md:h-[60vh] md:min-h-[400px] lg:h-[70vh] lg:min-h-[500px] w-full overflow-hidden bg-muted">
        <div ref={emblaRef} className="h-full overflow-hidden">
          <div className="flex h-full">
            {images.map((image, index) => (
              <div
                key={image.src}
                className="relative h-full min-w-0 flex-[0_0_100%]"
              >
                <div
                  className={cn(
                    "absolute inset-0 transition-transform duration-[8000ms] ease-out",
                    selectedIndex === index ? "scale-105" : "scale-100"
                  )}
                >
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    className="object-cover editorial-image"
                    priority={index === 0}
                    sizes="100vw"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gradient overlay for depth */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-foreground/5 via-transparent to-foreground/20" />

      </div>
    </section>
  );
}

export function IntroSection() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 md:py-28">
      {/* Headline */}
      <h1 className="font-serif text-4xl leading-tight tracking-tight md:text-5xl lg:text-6xl">
        Long-Distance Cycling, at Your Own Pace
      </h1>

      {/* Intro Copy */}
      <div className="mt-10 space-y-6 text-lg leading-8 text-muted-foreground md:text-xl md:leading-9">
        <p className="text-foreground font-medium">
          Long-distance cycling doesn&apos;t have to be loud, fast, or competitive.
        </p>

        <p>
          At Randonneurs Ontario, it&apos;s about self-reliance, curiosity, and seeing
          how far you can go under your own power.
        </p>

        <p>
          Randonneurs Ontario is a volunteer-run cycling organization dedicated to
          non-competitive long-distance cycling in Ontario. We organize brevets —
          structured rides of 200 km and beyond — that challenge riders to manage
          pacing, navigation, and endurance within generous time limits.
        </p>

        <p>
          Riders participate for many reasons: to explore quiet roads, to test
          themselves, to ride through the night, or simply to experience distance
          differently. There are no podiums and no winners — only the satisfaction
          of steady forward progress.
        </p>

        <p>
          Whether you are curious about your first long ride or are an experienced
          randonneur planning a season, you&apos;ll find your place here.
        </p>
      </div>

      {/* Call to Action Links */}
      <div className="mt-12 flex flex-wrap gap-x-8 gap-y-4">
        <Link
          href="/calendar"
          className="group inline-flex items-center gap-2 text-base font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
        >
          Start with your first brevet
          <svg
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 8l4 4m0 0l-4 4m4-4H3"
            />
          </svg>
        </Link>
        <Link
          href="/calendar"
          className="group inline-flex items-center gap-2 text-base font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
        >
          Explore the calendar
          <svg
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 8l4 4m0 0l-4 4m4-4H3"
            />
          </svg>
        </Link>
        <Link
          href="/membership"
          className="group inline-flex items-center gap-2 text-base font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
        >
          Join the community
          <svg
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 8l4 4m0 0l-4 4m4-4H3"
            />
          </svg>
        </Link>
      </div>
    </section>
  );
}

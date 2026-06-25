'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import Fade from 'embla-carousel-fade'
import { cn } from '@/lib/utils'
import type { HeroImage } from '@/lib/hero-images'

type HeroProps = {
  images: HeroImage[]
}

export function Hero({ images }: HeroProps) {
  // Pick a random starting slide on each load so the carousel doesn't always
  // open on the same image. A lazy initializer keeps this out of the rendered
  // markup (the DOM slide order is unchanged), so there's no hydration
  // mismatch — embla just applies the start position client-side on mount.
  const [startIndex] = useState(() =>
    images.length > 0 ? Math.floor(Math.random() * images.length) : 0
  )
  const [selectedIndex, setSelectedIndex] = useState(0)
  // Slides render in fixed DOM order, so the first paint would show slide 0
  // before embla scrolls to the random start — a visible flash. Keep the
  // carousel hidden until embla has initialized on its start slide, then fade
  // it in. SSR and the first client render both start hidden, so there's no
  // hydration mismatch.
  const [isReady, setIsReady] = useState(false)

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      duration: 40,
      startIndex,
    },
    [
      Autoplay({
        delay: 6000,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
      }),
      Fade(),
    ]
  )

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    onSelect()
    // embla has applied the start slide (and Fade's per-slide opacity) by now,
    // so it's safe to reveal the carousel without flashing slide 0.
    setIsReady(true)
    emblaApi.on('select', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
    }
  }, [emblaApi, onSelect])

  return (
    <section className="relative">
      {/* Hero Carousel - Full bleed */}
      <div className="relative h-[40vh] min-h-[250px] md:h-[60vh] md:min-h-[400px] lg:h-[70vh] lg:min-h-[500px] w-full overflow-hidden bg-muted">
        <div
          ref={emblaRef}
          className={cn(
            'h-full overflow-hidden transition-opacity duration-700',
            isReady ? 'opacity-100' : 'opacity-0'
          )}
        >
          <div className="flex h-full">
            {images.map((image, index) => (
              <div key={image.src} className="relative h-full min-w-0 flex-[0_0_100%]">
                <div
                  className={cn(
                    'absolute inset-0 transition-transform duration-[8000ms] ease-out',
                    selectedIndex === index ? 'scale-105' : 'scale-100'
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
  )
}

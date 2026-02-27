# Event Hero Image with Title Overlay

## Problem

The event detail page (`/register/[slug]`) displays the hero image at 50vh followed by the event header on a white background below. This pushes event content far down the page and wastes vertical space — the image and title serve the same purpose (identify the event) but occupy separate blocks.

## Design

Overlay the event name and type badge directly on the hero image, using a bottom gradient for legibility. This follows the same pattern established by `PageHero` component used on other pages.

### On the image (bottom-left anchored)

- Type badge (e.g. "Populaire") — light variant for contrast on dark gradient
- Event name — white serif text with `text-shadow-lg`

### Image container

- Height: `h-[25vh] md:h-[40vh]`, min `180px` / `300px`, max `500px`
- Gradient: `bg-gradient-to-t from-neutral-900/70 to-neutral-900/20`
- Content inside `content-container-wide` to align with page grid below
- Text anchored to bottom with padding

### Below the image (white background)

- Kicker line: distance + chapter (e.g. "105 km · Ottawa")
- Date and start location meta (unchanged)
- Mobile register CTA (unchanged)

### No-image fallback

When `event.imageUrl` is absent, render the header on white background as before (no overlay, no gradient).

### What doesn't change

- Event content area, registration form, route embed, registered riders list
- Mobile register CTA placement (below header)
- `editorial-image` filter on the photo

## File changes

- `app/register/[slug]/page.tsx` — restructure hero image and header sections

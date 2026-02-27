# Event Hero Image Overlay — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Overlay event name and type badge on the hero image to reduce vertical space usage on event detail pages.

**Architecture:** Replace the separate hero image + header blocks with a single hero section where text is anchored bottom-left over a gradient. When no image exists, fall back to the current white-background header. Follows the pattern from `components/page-hero.tsx`.

**Tech Stack:** Next.js Image, Tailwind CSS v4 (text-shadow-lg utility), shadcn Badge component

---

## Reference

### Existing pattern in `components/page-hero.tsx`

```tsx
<div className="relative border-b border-border overflow-hidden">
  <Image src={image} alt="" fill className="object-cover editorial-image" priority />
  <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/70 to-neutral-900/20" />
  <div className="relative mx-auto max-w-4xl px-6 py-16 md:py-20">
    <p className="eyebrow-hero text-neutral-200 text-shadow-lg">{eyebrow}</p>
    <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl tracking-tight text-neutral-100 text-shadow-lg">{title}</h1>
  </div>
</div>
```

### Current event page structure (`app/register/[slug]/page.tsx`)

Lines 76-140: Hero image block (lines 76-89) + Event header block (lines 91-140) are separate siblings inside `<PageShell>`.

### Key CSS classes available

- `content-container-wide` → `mx-auto max-w-6xl px-4 sm:px-6`
- `editorial-image` → `filter: saturate(0.9) contrast(1.05) sepia(0.04)`
- `eyebrow-hero` → `text-[11px] font-bold tracking-[0.3em] uppercase`
- `text-shadow-lg` → Tailwind v4 built-in utility

---

### Task 1: Restructure event hero with overlay

**Files:**
- Modify: `app/register/[slug]/page.tsx:74-140`

**Step 1: Replace the hero image + header blocks**

Replace lines 74-140 (from `return (` through the closing `</header>`) with the new combined hero. The key change: when `event.imageUrl` exists, the title and badge render _inside_ the image container. When it doesn't, they render on white.

```tsx
    <PageShell>
      {/* Hero Section */}
      {event.imageUrl ? (
        <div className="relative w-full h-[25vh] md:h-[40vh] min-h-[180px] md:min-h-[300px] max-h-[500px] overflow-hidden">
          <Image
            src={event.imageUrl}
            alt={event.name}
            fill
            className="object-cover editorial-image"
            sizes="100vw"
            priority
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/70 to-neutral-900/20" />
          <div className="relative h-full flex flex-col justify-end">
            <div className="content-container-wide pb-6 md:pb-8">
              <Badge variant="secondary" className="bg-white/90 text-neutral-900 text-xs tracking-wider font-medium mb-3">
                {event.type}
              </Badge>
              <h1 className="font-serif text-3xl md:text-5xl lg:text-6xl tracking-tight text-neutral-100 text-shadow-lg">
                {event.name}
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
                <span className="text-xs tracking-[0.15em] uppercase text-muted-foreground">
                  {event.distance} km · {event.chapterName}
                </span>
              </div>
              <h1 className="font-serif text-3xl md:text-5xl lg:text-6xl tracking-tight mb-4 md:mb-6">
                {event.name}
              </h1>
            </>
          )}

          {/* Kicker line (shown when image exists — badge/title are on the image) */}
          {event.imageUrl && (
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
            <RegisterCTA eventId={event.id} isPermanent={event.type === 'Permanent'} />
          </div>
        </div>
      </header>
```

**Step 2: Verify dev server renders correctly**

Run: `npm run dev` and navigate to an event with an image (e.g. `/register/scoops-105`)

Check:
- Badge and title appear bottom-left on the image
- Gradient is visible from bottom
- Text is legible (white on dark gradient)
- Distance/chapter kicker appears below on white
- Date and location meta appear below
- Scroll down — rest of page unchanged

Also check an event without an image:
- Full header renders on white background as before

**Step 3: Commit**

```bash
git add app/register/[slug]/page.tsx
git commit -m "feat: overlay event title on hero image"
```

---

### Task 2: Update e2e test

**Files:**
- Modify: `tests/e2e/registration.spec.ts`

The existing e2e test at line 23 checks `page.locator('h1').toBeVisible()`. With the overlay, the h1 is now inside the image container rather than the header. The test should still pass since h1 is still visible, but verify.

**Step 1: Run existing e2e tests**

Run: `npx playwright test tests/e2e/registration.spec.ts`

Expected: Tests pass — the h1 locator doesn't care about its parent container.

**Step 2: Commit (only if test changes were needed)**

```bash
git commit -m "test: update e2e test for hero overlay"
```

---

### Task 3: Update documentation

**Files:**
- Modify: `docs/plans/2026-02-26-event-hero-overlay-design.md` — mark plan as completed

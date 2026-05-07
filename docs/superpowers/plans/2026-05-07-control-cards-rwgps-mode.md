# Control Cards `?rwgps=true` Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `?rwgps=true` query-param mode to `/control-cards` that swaps the route picker for a RideWithGPS URL/ID input, so route designers can validate draft routes that aren't in the DB yet.

**Architecture:** Extend `lib/rwgps.ts` with a route-ID parser and a metadata-aware fetch (`fetchRwgpsRoute`). Make `app/control-cards/page.tsx` aware of the `rwgps` search param, branching its UI copy and skipping the DB routes query in rwgps mode. Add a `mode: 'picker' | 'rwgps'` prop to `ControlCardForm`; in `'rwgps'` mode it renders a URL input + editable route-name + editable distance fields, and downstream code reads from a memoized `effectiveRoute` so the print-URL builder is mode-agnostic.

**Tech Stack:** Next.js App Router (Server Components + client form), TypeScript, vitest, shadcn/ui (Card, Input, Button, Label), Tailwind, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-05-07-control-cards-rwgps-mode-design.md`

---

## File Structure

**Modified:**

- `lib/rwgps.ts` — add `parseRwgpsRouteId` and `fetchRwgpsRoute`. Extend the `RwgpsRoute` interface with `name` and `distance` fields.
- `tests/unit/lib/rwgps.test.ts` — add tests for both new exports.
- `app/control-cards/page.tsx` — read `searchParams.rwgps`, skip DB query in rwgps mode, swap intro copy, pass `mode` to form.
- `components/control-card-form.tsx` — accept `mode` prop, branch picker UI, add `rwgpsInput`/`manualRouteName`/`manualDistanceKm` state, add `effectiveRoute` memo, route all downstream logic through it.

**No new files.**

---

## Task 1: Add `parseRwgpsRouteId` to `lib/rwgps.ts`

**Files:**

- Modify: `lib/rwgps.ts`
- Test: `tests/unit/lib/rwgps.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/lib/rwgps.test.ts` (after the existing `describe('fetchRwgpsControls', ...)` block, at the end of the file):

```typescript
describe('parseRwgpsRouteId', () => {
  it('extracts the ID from a full RWGPS URL', () => {
    expect(parseRwgpsRouteId('https://ridewithgps.com/routes/47170397')).toBe('47170397')
  })

  it('extracts the ID from a slugged URL', () => {
    expect(parseRwgpsRouteId('https://ridewithgps.com/routes/47170397-toronto-loop')).toBe(
      '47170397'
    )
  })

  it('extracts the ID from a host-less URL', () => {
    expect(parseRwgpsRouteId('ridewithgps.com/routes/47170397')).toBe('47170397')
  })

  it('accepts a bare numeric ID', () => {
    expect(parseRwgpsRouteId('47170397')).toBe('47170397')
  })

  it('trims surrounding whitespace', () => {
    expect(parseRwgpsRouteId('  47170397  ')).toBe('47170397')
    expect(parseRwgpsRouteId('\nhttps://ridewithgps.com/routes/47170397\n')).toBe('47170397')
  })

  it('returns null for unrecognized input', () => {
    expect(parseRwgpsRouteId('https://example.com/foo/123')).toBeNull()
    expect(parseRwgpsRouteId('not a url')).toBeNull()
    expect(parseRwgpsRouteId('')).toBeNull()
  })

  it('extracts the ID from an http URL', () => {
    expect(parseRwgpsRouteId('http://ridewithgps.com/routes/123')).toBe('123')
  })
})
```

Update the import at the top of the file from:

```typescript
import { cleanControlName, extractControls, fetchRwgpsControls } from '@/lib/rwgps'
```

to:

```typescript
import {
  cleanControlName,
  extractControls,
  fetchRwgpsControls,
  parseRwgpsRouteId,
} from '@/lib/rwgps'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/rwgps.test.ts -t "parseRwgpsRouteId"`
Expected: All 7 tests fail with import error or "parseRwgpsRouteId is not a function".

- [ ] **Step 3: Implement `parseRwgpsRouteId`**

Add to `lib/rwgps.ts` (place it near the top, just below the type definitions, before `cleanControlName`):

```typescript
/**
 * Extract a RideWithGPS route ID from a URL, slugged URL, or bare ID.
 * Returns null when no ID can be found.
 */
export function parseRwgpsRouteId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const fromUrl = trimmed.match(/\/routes\/(\d+)/)
  if (fromUrl) return fromUrl[1]
  const bare = trimmed.match(/^(\d+)$/)
  if (bare) return bare[1]
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lib/rwgps.test.ts -t "parseRwgpsRouteId"`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/rwgps.ts tests/unit/lib/rwgps.test.ts
git commit -m "Add parseRwgpsRouteId helper

Extracts a numeric route ID from a RideWithGPS URL (with or
without protocol or slug) or accepts a bare ID. Used by the
upcoming control-cards rwgps mode."
```

---

## Task 2: Extend `RwgpsRoute` interface and add `fetchRwgpsRoute`

**Files:**

- Modify: `lib/rwgps.ts`
- Test: `tests/unit/lib/rwgps.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/lib/rwgps.test.ts` (after the `parseRwgpsRouteId` describe block):

```typescript
describe('fetchRwgpsRoute', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns name, distanceKm, and controls from the RWGPS JSON', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'Toronto Loop 200',
        distance: 203_500,
        course_points: [
          { n: 'CTL Start', d: 0, t: 'Control' },
          { n: 'CTL Finish', d: 200_000, t: 'Control' },
        ],
      }),
    } as Response)

    const result = await fetchRwgpsRoute('47170397')
    expect(fetchMock).toHaveBeenCalledWith('https://ridewithgps.com/routes/47170397.json')
    expect(result.name).toBe('Toronto Loop 200')
    expect(result.distanceKm).toBeCloseTo(203.5, 1)
    expect(result.controls).toEqual([
      { name: 'Start', distance: '0.0' },
      { name: 'Finish', distance: '200.0' },
    ])
  })

  it('unwraps the nested `route` key when present', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        route: {
          name: 'Brevet Draft',
          distance: 100_000,
          course_points: [{ n: 'CTL Finish', d: 100_000, t: 'Control' }],
        },
      }),
    } as Response)

    const result = await fetchRwgpsRoute('1')
    expect(result.name).toBe('Brevet Draft')
    expect(result.distanceKm).toBeCloseTo(100, 1)
    expect(result.controls).toEqual([{ name: 'Finish', distance: '100.0' }])
  })

  it('throws a user-facing error on non-OK response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response)

    await expect(fetchRwgpsRoute('nope')).rejects.toThrow(/Failed to fetch route: 404 Not Found/)
  })

  it('throws when no controls are present', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'Empty Route',
        distance: 50_000,
        course_points: [{ n: 'Turn', d: 1000, t: 'Left' }],
      }),
    } as Response)

    await expect(fetchRwgpsRoute('1')).rejects.toThrow(/No control points found/)
  })

  it('falls back to "Untitled Route" when name is missing', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        distance: 50_000,
        course_points: [{ n: 'CTL Finish', d: 50_000, t: 'Control' }],
      }),
    } as Response)

    const result = await fetchRwgpsRoute('1')
    expect(result.name).toBe('Untitled Route')
  })

  it('returns 0 distanceKm when distance is missing', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'No Distance',
        course_points: [{ n: 'CTL Finish', d: 50_000, t: 'Control' }],
      }),
    } as Response)

    const result = await fetchRwgpsRoute('1')
    expect(result.distanceKm).toBe(0)
  })
})
```

Update the import at the top of the test file to include the new export:

```typescript
import {
  cleanControlName,
  extractControls,
  fetchRwgpsControls,
  fetchRwgpsRoute,
  parseRwgpsRouteId,
} from '@/lib/rwgps'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/rwgps.test.ts -t "fetchRwgpsRoute"`
Expected: All 6 tests fail with "fetchRwgpsRoute is not a function" or import error.

- [ ] **Step 3: Extend `RwgpsRoute` interface**

In `lib/rwgps.ts`, replace the `RwgpsRoute` interface:

```typescript
interface RwgpsRoute {
  name?: string
  distance?: number // meters
  course_points?: RwgpsCoursePoint[]
  points_of_interest?: RwgpsPoi[]
  track_points?: RwgpsTrackPoint[]
}
```

- [ ] **Step 4: Add `fetchRwgpsRoute`**

Add to `lib/rwgps.ts` immediately after the existing `fetchRwgpsControls` function:

```typescript
/**
 * Fetch an RWGPS route JSON and return its display name, total distance,
 * and parsed controls — used by the control-cards rwgps validation mode
 * for routes that aren't yet in the database. Throws Error with a
 * user-facing message on any failure.
 */
export async function fetchRwgpsRoute(
  rwgpsId: string
): Promise<{ name: string; distanceKm: number; controls: ParsedControl[] }> {
  const url = `https://ridewithgps.com/routes/${rwgpsId}.json`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch route: ${response.status} ${response.statusText}`)
  }
  const data: unknown = await response.json()
  const route = (data as { route?: RwgpsRoute }).route ?? (data as RwgpsRoute)
  const controls = extractControls(route)
  if (controls.length === 0) {
    throw new Error(
      'No control points found in the RWGPS route. Add controls as course points (type "Control") or waypoints (comment "control") in the RideWithGPS route editor.'
    )
  }
  return {
    name: route.name?.trim() || 'Untitled Route',
    distanceKm: typeof route.distance === 'number' ? route.distance / 1000 : 0,
    controls,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lib/rwgps.test.ts`
Expected: All tests pass (existing + new `fetchRwgpsRoute` tests + `parseRwgpsRouteId` tests).

- [ ] **Step 6: Commit**

```bash
git add lib/rwgps.ts tests/unit/lib/rwgps.test.ts
git commit -m "Add fetchRwgpsRoute returning route name + distance

Returns name, distanceKm, and parsed controls in one call so
the control-cards rwgps mode can populate all form fields from
a single fetch. Existing fetchRwgpsControls is unchanged."
```

---

## Task 3: Make `app/control-cards/page.tsx` rwgps-aware

**Files:**

- Modify: `app/control-cards/page.tsx`

- [ ] **Step 1: Replace the page implementation**

Replace the entire contents of `app/control-cards/page.tsx` with:

```tsx
import { PageShell } from '@/components/page-shell'
import { ControlCardForm } from '@/components/control-card-form'
import { getActiveRoutesWithRwgps } from '@/lib/data/routes'
import Link from 'next/link'

export const metadata = {
  title: 'Print Control Cards',
  description:
    'Generate and print BRM control cards for any active route. Control times are calculated automatically.',
}

interface ControlCardsPageProps {
  searchParams: Promise<{ rwgps?: string }>
}

export default async function ControlCardsPage({ searchParams }: ControlCardsPageProps) {
  const { rwgps } = await searchParams
  const isRwgpsMode = rwgps === 'true'
  const routes = isRwgpsMode ? [] : await getActiveRoutesWithRwgps()

  return (
    <PageShell>
      <div className="content-container-wide py-12 md:py-16">
        <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
          {/* Left Column - Information */}
          <div className="flex-1 min-w-0">
            <div className="mb-8">
              <p className="text-xs font-medium tracking-[0.2em] uppercase text-muted-foreground mb-3">
                Tools
              </p>
              <h1 className="font-serif text-4xl md:text-5xl tracking-tight">
                Print Control Cards
              </h1>
            </div>

            <div className="prose prose-neutral dark:prose-invert max-w-none">
              {isRwgpsMode ? (
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Validate a draft RideWithGPS route by pasting its URL. Control points, route name,
                  and distance are read live from RideWithGPS — nothing is saved.
                </p>
              ) : (
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Generate printable BRM control cards for any active route. Control opening and
                  closing times are calculated automatically from the route distance and your start
                  time.
                </p>
              )}

              <div className="mt-10 space-y-8">
                <div>
                  <h2 className="font-serif text-xl tracking-tight mb-3">How it works</h2>
                  <ol className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                        1
                      </span>
                      <span>
                        {isRwgpsMode
                          ? 'Paste a RideWithGPS route URL or ID and click Load'
                          : 'Select a route and set your start date and time'}
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                        2
                      </span>
                      <span>
                        Control points are imported automatically from RideWithGPS when available,
                        or you can add them manually
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                        3
                      </span>
                      <span>Edit control points as needed</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                        4
                      </span>
                      <span>
                        Generate and print your cards. Opening and closing times are calculated
                        using standard BRM rules.
                      </span>
                    </li>
                  </ol>
                </div>

                <div>
                  <h2 className="font-serif text-xl tracking-tight mb-3">Notes</h2>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {!isRwgpsMode && (
                      <li className="flex gap-2">
                        <span className="text-primary">&bull;</span>
                        <span>
                          You normally won’t need to print the cards yourself. The ride organizer
                          will distribute control cards at the event check-in.
                        </span>
                      </li>
                    )}
                    <li className="flex gap-2">
                      <span className="text-primary">&bull;</span>
                      <span>Cards are designed for double-sided printing on letter-size paper</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-primary">&bull;</span>
                      <span>Two cards print per sheet (front and back)</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-primary">&bull;</span>
                      <span>
                        Control times follow{' '}
                        <Link
                          href="https://www.audax-club-parisien.com/en/our-organization/our-rules/"
                          className="text-primary hover:underline underline-offset-2"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          ACP/BRM rules
                        </Link>
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Form */}
          <div className="lg:w-[480px] lg:shrink-0">
            <ControlCardForm routes={routes} mode={isRwgpsMode ? 'rwgps' : 'picker'} />
          </div>
        </div>
      </div>
    </PageShell>
  )
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: Will fail because `ControlCardForm` doesn't yet accept `mode`. That's fine — Task 4 fixes this. Continue without committing.

NOTE: Do NOT commit yet. Tasks 3 and 4 land together in Task 4's commit because the `mode` prop must exist on the form before this page typechecks.

---

## Task 4: Add rwgps mode to `ControlCardForm`

**Files:**

- Modify: `components/control-card-form.tsx`

- [ ] **Step 1: Add new imports and update the props interface**

In `components/control-card-form.tsx`, replace the `import { fetchRwgpsControls } from '@/lib/rwgps'` line with:

```typescript
import { fetchRwgpsControls, fetchRwgpsRoute, parseRwgpsRouteId } from '@/lib/rwgps'
```

Replace the `ControlCardFormProps` interface:

```typescript
interface ControlCardFormProps {
  routes: ActiveRouteWithRwgps[]
  mode?: 'picker' | 'rwgps'
}
```

Update the function signature:

```typescript
export function ControlCardForm({ routes, mode = 'picker' }: ControlCardFormProps) {
```

- [ ] **Step 2: Add rwgps-mode state**

Just below the existing `// RWGPS import state` block (the one that already declares `isLoadingRwgps` and `rwgpsError`), add:

```typescript
// RWGPS-mode state (only used when mode === 'rwgps')
const [rwgpsInput, setRwgpsInput] = useState('')
const [manualRouteName, setManualRouteName] = useState('')
const [manualDistanceKm, setManualDistanceKm] = useState('')
const [rwgpsLoadedId, setRwgpsLoadedId] = useState<string | null>(null)
```

- [ ] **Step 3: Add `effectiveRoute` memo and replace `selectedRoute` usage**

Find the line:

```typescript
const selectedRoute = routes.find((r) => r.id === routeId)
```

Replace it with:

```typescript
const pickedRoute = routes.find((r) => r.id === routeId)

const effectiveRoute = useMemo(() => {
  if (mode === 'rwgps') {
    const distance = parseFloat(manualDistanceKm)
    if (!manualRouteName || !rwgpsLoadedId || isNaN(distance) || distance <= 0) {
      return null
    }
    return {
      name: manualRouteName,
      distanceKm: distance,
      chapterName: null as string | null,
      rwgpsId: rwgpsLoadedId,
    }
  }
  if (!pickedRoute) return null
  return {
    name: pickedRoute.name,
    distanceKm: pickedRoute.distanceKm ?? 0,
    chapterName: pickedRoute.chapterName,
    rwgpsId: pickedRoute.rwgpsId,
  }
}, [mode, pickedRoute, manualRouteName, manualDistanceKm, rwgpsLoadedId])
```

- [ ] **Step 4: Update the `useEffect` that resets controls when the picked route changes**

Find the block starting with `// Reset controls when route changes`. Replace the whole block:

```typescript
// Reset controls when picker-mode route changes
useEffect(() => {
  if (mode !== 'picker') return
  if (pickedRoute) {
    setControls([
      { id: crypto.randomUUID(), name: 'Start', distance: '0' },
      {
        id: crypto.randomUUID(),
        name: 'Finish',
        distance: String(pickedRoute.distanceKm || ''),
      },
    ])
    setRwgpsError(null)
  }
}, [routeId, mode]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5: Update the picker-mode auto-import effect**

Find the block:

```typescript
  const rwgpsId = selectedRoute?.rwgpsId

  const importFromRwgps = useCallback(async () => {
    if (!rwgpsId) return
    ...
  }, [rwgpsId])

  // Auto-import controls from RWGPS when route changes
  useEffect(() => {
    if (selectedRoute?.rwgpsId) {
      importFromRwgps()
    }
  }, [routeId]) // eslint-disable-line react-hooks/exhaustive-deps
```

Replace with:

```typescript
const pickerRwgpsId = pickedRoute?.rwgpsId

const importFromRwgps = useCallback(async () => {
  if (!pickerRwgpsId) return

  setIsLoadingRwgps(true)
  setRwgpsError(null)

  try {
    const parsed = await fetchRwgpsControls(pickerRwgpsId)
    setControls(
      parsed.map((c) => ({
        id: crypto.randomUUID(),
        name: c.name,
        distance: c.distance,
      }))
    )
  } catch (error) {
    setRwgpsError(error instanceof Error ? error.message : 'Failed to fetch route data')
  } finally {
    setIsLoadingRwgps(false)
  }
}, [pickerRwgpsId])

// Auto-import controls from RWGPS when picker-mode route changes
useEffect(() => {
  if (mode !== 'picker') return
  if (pickedRoute?.rwgpsId) {
    importFromRwgps()
  }
}, [routeId, mode]) // eslint-disable-line react-hooks/exhaustive-deps

// RWGPS-mode load handler
const loadFromRwgpsUrl = useCallback(async () => {
  const id = parseRwgpsRouteId(rwgpsInput)
  if (!id) {
    setRwgpsError(
      "Couldn't read a RideWithGPS route ID from that input. Try a URL like https://ridewithgps.com/routes/12345 or a bare ID."
    )
    return
  }

  setIsLoadingRwgps(true)
  setRwgpsError(null)

  try {
    const result = await fetchRwgpsRoute(id)
    setManualRouteName(result.name)
    setManualDistanceKm(result.distanceKm.toFixed(1))
    setRwgpsLoadedId(id)
    setControls(
      result.controls.map((c) => ({
        id: crypto.randomUUID(),
        name: c.name,
        distance: c.distance,
      }))
    )
  } catch (error) {
    setRwgpsError(error instanceof Error ? error.message : 'Failed to fetch route data')
  } finally {
    setIsLoadingRwgps(false)
  }
}, [rwgpsInput])
```

- [ ] **Step 6: Replace `selectedRoute` references in `generatePrintUrl` and `isFormValid`**

Find the `generatePrintUrl` callback. Replace the entire callback with:

```typescript
const generatePrintUrl = useCallback(() => {
  if (!effectiveRoute || !eventDate) return '#'

  const params = new URLSearchParams()
  params.set('routeName', effectiveRoute.name)
  params.set('distance', String(effectiveRoute.distanceKm || 0))
  params.set('chapter', effectiveRoute.chapterName || 'Randonneurs Ontario')
  params.set('eventDate', format(eventDate, 'yyyy-MM-dd'))
  params.set('startTime', startTime)
  params.set('organizerName', organizerName)
  params.set('organizerPhone', organizerPhone)
  params.set('organizerEmail', organizerEmail)

  const sortedControls = [...controls].sort(
    (a, b) => parseFloat(a.distance || '0') - parseFloat(b.distance || '0')
  )
  params.set(
    'controls',
    JSON.stringify(
      sortedControls.map((c) => ({
        name: c.name,
        distance: parseFloat(c.distance || '0'),
      }))
    )
  )

  params.set(
    'riders',
    JSON.stringify(
      riders.map((r) => ({
        firstName: r.firstName,
        lastName: r.lastName,
      }))
    )
  )

  if (extraBlankCards > 0) {
    params.set('extraBlank', String(extraBlankCards))
  }

  if (effectiveRoute.rwgpsId) {
    params.set('rwgpsUrl', `https://ridewithgps.com/routes/${effectiveRoute.rwgpsId}`)
  }

  return `/control-cards/print?${params.toString()}`
}, [
  effectiveRoute,
  eventDate,
  startTime,
  organizerName,
  organizerPhone,
  organizerEmail,
  controls,
  riders,
  extraBlankCards,
])
```

Replace the `isFormValid` line:

```typescript
const isFormValid =
  effectiveRoute && eventDate && controls.every((c) => c.name && c.distance !== '')
```

- [ ] **Step 7: Replace the Route Card JSX**

Find the JSX block beginning with `{/* Route Selection */}` and ending at the matching closing `</Card>` (the first Card in the rendered output). Replace the whole block with:

```tsx
{
  /* Route Selection */
}
;<Card>
  <CardHeader>
    <CardTitle>Route</CardTitle>
    <CardDescription>
      {mode === 'rwgps'
        ? 'Paste a RideWithGPS route URL or ID, then set your start date and time'
        : 'Select a route and set the start date and time'}
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {mode === 'rwgps' ? (
      <>
        <div className="space-y-2">
          <Label htmlFor="rwgpsInput">RideWithGPS route URL or ID</Label>
          <div className="flex gap-2">
            <Input
              id="rwgpsInput"
              placeholder="https://ridewithgps.com/routes/12345"
              value={rwgpsInput}
              onChange={(e) => setRwgpsInput(e.target.value)}
              className="flex-1"
            />
            <Button
              type="button"
              onClick={loadFromRwgpsUrl}
              disabled={isLoadingRwgps || !rwgpsInput.trim()}
            >
              {isLoadingRwgps ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Load
            </Button>
          </div>
          {rwgpsLoadedId && (
            <p className="text-xs text-muted-foreground">
              Loaded from{' '}
              <a
                href={`https://ridewithgps.com/routes/${rwgpsLoadedId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline underline-offset-2"
              >
                ridewithgps.com/routes/{rwgpsLoadedId}
              </a>
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="manualRouteName">Route name</Label>
            <Input
              id="manualRouteName"
              placeholder="e.g. Toronto 200"
              value={manualRouteName}
              onChange={(e) => setManualRouteName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manualDistanceKm">Distance (km)</Label>
            <Input
              id="manualDistanceKm"
              type="number"
              min="0"
              step="0.1"
              placeholder="200"
              value={manualDistanceKm}
              onChange={(e) => setManualDistanceKm(e.target.value)}
            />
          </div>
        </div>
      </>
    ) : (
      <div className="space-y-2">
        <Label htmlFor="route">Route</Label>
        <Popover open={routePickerOpen} onOpenChange={setRoutePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={routePickerOpen}
              className="w-full justify-between font-normal h-12 sm:h-9"
            >
              {pickedRoute ? (
                <span className="truncate">
                  {pickedRoute.name} ({pickedRoute.distanceKm} km)
                </span>
              ) : (
                'Search routes…'
              )}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search by name, chapter, or distance…" />
              <CommandList>
                <CommandEmpty>No routes found.</CommandEmpty>
                {routesByChapter.map(([chapter, chapterRoutes]) => (
                  <CommandGroup key={chapter} heading={chapter}>
                    {chapterRoutes.map((route) => (
                      <CommandItem
                        key={route.id}
                        value={`${route.name} ${route.chapterName} ${route.distanceKm}`}
                        onSelect={() => {
                          setRouteId(route.id)
                          setRoutePickerOpen(false)
                        }}
                        data-checked={routeId === route.id}
                      >
                        <div className="flex flex-col">
                          <span>{route.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {route.distanceKm} km
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {pickedRoute && (
          <p className="text-xs text-muted-foreground">
            {pickedRoute.chapterName} &middot; {pickedRoute.distanceKm} km
            {pickedRoute.rwgpsId && (
              <>
                {' '}
                &middot;{' '}
                <a
                  href={`https://ridewithgps.com/routes/${pickedRoute.rwgpsId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline underline-offset-2"
                >
                  View on RWGPS
                </a>
              </>
            )}
          </p>
        )}
      </div>
    )}

    {/* Date and Time */}
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="date">Start Date</Label>
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              id="date"
              className="w-full justify-between font-normal h-12 sm:h-9"
            >
              {eventDate ? format(eventDate, 'EEEE, MMMM d, yyyy') : 'Select date'}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              selected={eventDate}
              onSelect={(date) => {
                setEventDate(date)
                setDatePickerOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="space-y-2">
        <Label htmlFor="time">Start Time</Label>
        <Input
          id="time"
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
      </div>
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 8: Update the "Import from RWGPS" button condition and the no-RWGPS hint in the Controls card**

Find the buttons inside the Controls card. Replace the `{selectedRoute?.rwgpsId && (...)}` block (the "Import from RWGPS" button) with:

```tsx
{
  mode === 'picker' && pickedRoute?.rwgpsId && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={importFromRwgps}
      disabled={isLoadingRwgps}
    >
      {isLoadingRwgps ? (
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
      ) : (
        <Download className="h-4 w-4 mr-1" />
      )}
      Import from RWGPS
    </Button>
  )
}
```

Find the `{selectedRoute && !selectedRoute.rwgpsId && (...)}` block (the "No RWGPS route linked" hint) and replace it with:

```tsx
{
  mode === 'picker' && pickedRoute && !pickedRoute.rwgpsId && (
    <p className="text-sm text-muted-foreground">
      No RWGPS route linked. Add control points manually.
    </p>
  )
}
```

- [ ] **Step 9: Update the validation hint at the bottom of the form**

Find the existing `{!isFormValid && (...)}` block at the bottom (next to the Generate button) and replace it with:

```tsx
{
  !isFormValid && (
    <p className="text-sm text-muted-foreground self-center">
      {mode === 'rwgps'
        ? 'Load a RideWithGPS route, set a date, and fill in control points.'
        : 'Please select a route, date, and fill in control points.'}
    </p>
  )
}
```

- [ ] **Step 10: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. (No more `selectedRoute` references; `mode` prop is consistent between page and form.)

- [ ] **Step 11: Run lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 12: Run the full test suite**

Run: `npm test`
Expected: All tests pass — no existing tests should regress.

- [ ] **Step 13: Manual UI check**

Check whether `npm run dev` is already running on port 3000 (per `CLAUDE.md`). If not, start it.

Visit:

1. `http://localhost:3000/control-cards` — confirm the route picker still works (pick any route, verify controls populate, verify Generate button is enabled with a date set).
2. `http://localhost:3000/control-cards?rwgps=true` — confirm:
   - The picker is gone, replaced by the URL input + Route name + Distance fields.
   - Pasting `https://ridewithgps.com/routes/47170397` (or any real RWGPS route from `getActiveRoutesWithRwgps()` — query the DB if you need an ID) and clicking Load populates name, distance, controls.
   - Pasting garbage shows the "Couldn't read a RideWithGPS route ID" error.
   - Generate button enables once date is set + controls are filled.
   - Clicking Generate opens `/control-cards/print` with the RWGPS-loaded data.

Use Playwright MCP if available to capture a screenshot of `/control-cards?rwgps=true` showing a successful load state. Save it to confirm visual layout.

- [ ] **Step 14: Commit**

```bash
git add app/control-cards/page.tsx components/control-card-form.tsx
git commit -m "Add ?rwgps=true mode to control cards page

Lets route designers paste a RideWithGPS URL/ID to validate
controls on a draft route. The page reads searchParams.rwgps,
the form swaps the picker for a URL input + editable route
name + distance fields, and downstream code reads route data
from a unified effectiveRoute memo so the print URL builder
is mode-agnostic."
```

---

## Task 5: Update documentation

**Files:**

- Modify: `docs/` (find the relevant doc; likely the control-cards doc if one exists)

- [ ] **Step 1: Locate the existing control-cards doc**

Run: `ls docs/ && grep -l -r "control-card\|control cards" docs/ 2>/dev/null`
Expected: One or more existing docs mentioning control cards. If none exists, skip to Step 3.

- [ ] **Step 2: Add a short subsection to the existing doc**

In the located doc, add a short subsection (3-5 sentences) under an appropriate heading:

```markdown
### Validating draft routes from RideWithGPS

Route designers can validate a draft route by visiting `/control-cards?rwgps=true`. The picker is replaced with a RideWithGPS URL input; pasting any route URL (or bare ID) and clicking Load fetches the route's name, distance, and control points live from RideWithGPS — nothing is saved. All form fields remain editable, and the Generate button produces the same printable cards as the regular flow.
```

- [ ] **Step 3: Skip if no doc exists**

If `grep` found nothing in Step 1, no docs change is needed; the spec already covers this.

- [ ] **Step 4: Commit (if a doc was edited)**

```bash
git add docs/
git commit -m "Document control-cards rwgps validation mode"
```

---

## Verification Checklist

Before declaring the work complete:

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes (full suite, including the new `parseRwgpsRouteId` and `fetchRwgpsRoute` tests).
- [ ] Manual check: `/control-cards` (regular mode) still works exactly as before.
- [ ] Manual check: `/control-cards?rwgps=true` loads a route from a pasted URL, populates name + distance + controls, and produces a working print URL.
- [ ] Playwright screenshot of `/control-cards?rwgps=true` captured (per project convention).
- [ ] Completion summary notes that the `ControlCardForm` component itself has no unit tests (existing limitation, out of scope).

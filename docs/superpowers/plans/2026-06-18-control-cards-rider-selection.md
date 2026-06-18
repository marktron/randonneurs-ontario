# Control Cards — Selectable Riders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin print control cards for a chosen subset of an event's registered riders, with "everyone" remaining the default.

**Architecture:** A mode toggle ("All registered riders" / "Choose individually") on the admin event control-cards form reveals per-rider checkboxes (all pre-checked). The form passes the chosen rider IDs to the print page via a `riderIds` query param only when in individual mode. The print page still re-fetches all registrations from the DB and filters them through a pure `selectRegistrations` helper; an absent param means everyone, preserving today's behavior and existing links.

**Tech Stack:** Next.js App Router (server + client components), TypeScript, Vitest + @testing-library/react (happy-dom), shadcn `Checkbox` / `RadioGroup` primitives.

## Global Constraints

- TypeScript must stay sound: `npm run typecheck` (`tsc --noEmit`) passes before completion.
- Lint passes: `npm run lint`.
- Full suite passes before commit: `npm test` (vitest).
- Default behavior is unchanged: when `riderIds` is absent, every `status='registered'` rider gets a card exactly as today.
- The print page never trusts the URL for rider identity — IDs are only a filter applied to freshly-fetched DB rows.
- Scope is limited to `app/admin/events/[id]/control-cards` and its print route. Do **not** touch the public `app/control-cards/` tool.

---

### Task 1: `selectRegistrations` pure helper

**Files:**

- Create: `lib/control-cards-selection.ts`
- Test: `tests/unit/lib/control-cards-selection.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `selectRegistrations<T extends { riders: { id: string } | null }>(registrations: T[], riderIdsParam: string | undefined): T[]` — returns all registrations when `riderIdsParam` is undefined/empty/whitespace; otherwise returns only those whose `riders.id` is in the comma-separated set, preserving input order. Rows with `riders === null` are dropped only when filtering.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { selectRegistrations } from '@/lib/control-cards-selection'

type Reg = { id: string; riders: { id: string } | null }

const regs: Reg[] = [
  { id: 'reg-a', riders: { id: 'rider-a' } },
  { id: 'reg-b', riders: { id: 'rider-b' } },
  { id: 'reg-c', riders: { id: 'rider-c' } },
]

describe('selectRegistrations', () => {
  it('returns all registrations when the param is undefined', () => {
    expect(selectRegistrations(regs, undefined)).toEqual(regs)
  })

  it('returns all registrations when the param is empty or whitespace', () => {
    expect(selectRegistrations(regs, '')).toEqual(regs)
    expect(selectRegistrations(regs, '   ')).toEqual(regs)
  })

  it('keeps only the selected riders, preserving original order', () => {
    const result = selectRegistrations(regs, 'rider-c,rider-a')
    expect(result.map((r) => r.id)).toEqual(['reg-a', 'reg-c'])
  })

  it('ignores unknown ids and trims whitespace around ids', () => {
    const result = selectRegistrations(regs, ' rider-b , rider-zzz ')
    expect(result.map((r) => r.id)).toEqual(['reg-b'])
  })

  it('drops registrations whose riders is null when filtering', () => {
    const withNull: Reg[] = [...regs, { id: 'reg-x', riders: null }]
    const result = selectRegistrations(withNull, 'rider-a')
    expect(result.map((r) => r.id)).toEqual(['reg-a'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/control-cards-selection.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/control-cards-selection"` / `selectRegistrations is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/control-cards-selection.ts

/** Parse a comma-separated `riderIds` query param into a Set, or null when empty. */
function parseRiderIds(param: string | undefined): Set<string> | null {
  if (!param) return null
  const ids = param
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return ids.length > 0 ? new Set(ids) : null
}

/**
 * Filter registrations to a selected set of rider IDs.
 *
 * When `riderIdsParam` is undefined/empty/whitespace, every registration is
 * returned unchanged (the "print for everyone" default). Otherwise only
 * registrations whose `riders.id` is in the set are returned, in their original
 * order; unknown IDs and `riders === null` rows are dropped.
 */
export function selectRegistrations<T extends { riders: { id: string } | null }>(
  registrations: T[],
  riderIdsParam: string | undefined
): T[] {
  const ids = parseRiderIds(riderIdsParam)
  if (!ids) return registrations
  return registrations.filter((r) => r.riders !== null && ids.has(r.riders.id))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/control-cards-selection.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/control-cards-selection.ts tests/unit/lib/control-cards-selection.test.ts
git commit -m "Add selectRegistrations helper for control-card rider filtering"
```

---

### Task 2: Filter registrations in the print page

**Files:**

- Modify: `app/admin/events/[id]/control-cards/print/page.tsx`

**Interfaces:**

- Consumes: `selectRegistrations` from Task 1.
- Produces: a `riderIds?: string` search param honored by the print route. No new exports.

- [ ] **Step 1: Add the import**

At the top of the file, alongside the existing imports, add:

```ts
import { selectRegistrations } from '@/lib/control-cards-selection'
```

- [ ] **Step 2: Add `riderIds` to the searchParams type**

In the `PrintPageProps` interface, extend the `searchParams` shape (currently `organizerName`, `organizerPhone`, `organizerEmail`, `controls`, `extraBlank`) with:

```ts
    riderIds?: string
```

- [ ] **Step 3: Filter the fetched registrations**

Immediately after the `if (!event) { notFound() }` block and before the organizer parsing, insert:

```ts
const selectedRegistrations = selectRegistrations(registrations, search.riderIds)
```

Then, in the rider-building section, change the two lines that read from `registrations` to read from `selectedRegistrations`:

```ts
const registeredRiderIds = selectedRegistrations.filter((r) => r.riders).map((r) => r.riders!.id)
const firstTimeRiderIdSet = new Set(await getFirstTimeRiderIds(id, registeredRiderIds))
const registeredRiders: CardRider[] = selectedRegistrations
  .filter((r) => r.riders)
  .map((r) => ({
    id: r.riders!.id,
    firstName: r.riders!.first_name,
    lastName: r.riders!.last_name,
    submissionUrl: r.management_token
      ? `${baseUrl}/registration/manage/${r.management_token}`
      : undefined,
    isFirstTimeRider: firstTimeRiderIdSet.has(r.riders!.id),
  }))
```

(Only the source array changes from `registrations` to `selectedRegistrations`; the rest is unchanged. The empty-roster fallback to 2 blank cards stays as-is and now also covers a selection that matches nobody.)

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/events/[id]/control-cards/print/page.tsx"
git commit -m "Honor riderIds filter on control-cards print page"
```

---

### Task 3: Rider selection UI in the admin form

**Files:**

- Modify: `components/admin/control-cards-form.tsx`
- Test: `tests/unit/components/control-cards-form.test.tsx` (create)

**Interfaces:**

- Consumes: `Checkbox` from `@/components/ui/checkbox`, `RadioGroup` + `RadioGroupItem` from `@/components/ui/radio-group`, the existing `riders: CardRider[]` prop.
- Produces: a print URL that includes `riderIds=<comma-separated ids>` only in individual mode; default ("All") behavior unchanged. No new exports.

- [ ] **Step 1: Write the failing component test**

Create `tests/unit/components/control-cards-form.test.tsx`:

```tsx
/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ControlCardsForm } from '@/components/admin/control-cards-form'
import type { CardRider } from '@/types/control-card'

// Avoid the on-mount RWGPS fetch firing during tests.
vi.mock('@/lib/rwgps', () => ({
  fetchRwgpsControls: vi.fn().mockResolvedValue([]),
}))

const event = {
  id: 'event-1',
  name: 'Test Brevet',
  routeName: 'Test Brevet',
  distance: 200,
  eventDate: '2026-05-15',
  startTime: '06:00',
  startLocation: 'Test Start',
  chapter: 'Toronto',
  rwgpsId: null,
  eventType: 'brevet',
}

const organizer = { name: 'Org Anizer', phone: '416-555-1212', email: 'org@example.com' }

const riders: CardRider[] = [
  { id: 'rider-a', firstName: 'Alice', lastName: 'Adams' },
  { id: 'rider-b', firstName: 'Bob', lastName: 'Brar' },
  { id: 'rider-c', firstName: 'Cy', lastName: 'Chen' },
]

function renderForm(props?: { riders?: CardRider[] }) {
  return render(
    <ControlCardsForm event={event} organizer={organizer} riders={props?.riders ?? riders} />
  )
}

/** The generate link href, decoded for assertions. */
function generateHref(): string {
  const link = screen.getByRole('link', { name: /Generate .* Control Card/i })
  return decodeURIComponent(link.getAttribute('href') || '')
}

describe('ControlCardsForm rider selection', () => {
  beforeEach(() => {
    // Provide control-point distances so the form is valid by default.
    // (Start=0, Finish=200 are seeded by the component.)
  })

  it('defaults to All mode and omits riderIds from the print URL', () => {
    renderForm()
    expect(generateHref()).not.toContain('riderIds')
  })

  it('shows the rider count for everyone in the generate button', () => {
    renderForm()
    expect(screen.getByRole('link', { name: 'Generate 3 Control Cards' })).toBeTruthy()
  })

  it('reveals checkboxes when Choose individually is selected, all pre-checked', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByLabelText('Choose individually'))
    const checks = screen.getAllByRole('checkbox')
    // 3 rider checkboxes + 1 select-all checkbox
    expect(checks).toHaveLength(4)
    expect(checks.every((c) => (c as HTMLInputElement).checked)).toBe(true)
  })

  it('adds only the checked rider ids to the print URL in individual mode', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByLabelText('Choose individually'))
    await user.click(screen.getByLabelText('Bob Brar')) // uncheck Bob
    const href = generateHref()
    expect(href).toContain('riderIds=rider-a,rider-c')
    expect(href).not.toContain('rider-b')
    expect(screen.getByRole('link', { name: 'Generate 2 Control Cards' })).toBeTruthy()
  })

  it('disables Generate when individual mode has zero riders selected', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByLabelText('Choose individually'))
    await user.click(screen.getByLabelText('Select all')) // toggles all off (all were on)
    const link = screen.getByRole('link', { name: /Generate/i })
    expect(link.className).toContain('pointer-events-none')
    expect(screen.getByText(/Select at least one rider/i)).toBeTruthy()
  })

  it('hides the Choose individually option when there are no registered riders', () => {
    renderForm({ riders: [] })
    expect(screen.queryByLabelText('Choose individually')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/components/control-cards-form.test.tsx`
Expected: FAIL — no "Choose individually" label / no count in the button name yet.

- [ ] **Step 3: Add imports and selection state**

In `components/admin/control-cards-form.tsx`, add to the imports:

```ts
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
```

After the `extraBlankCards` state declaration, add:

```ts
// Rider selection
const [selectionMode, setSelectionMode] = useState<'all' | 'individual'>('all')
const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(
  () => new Set(riders.map((r) => r.id))
)

const allRidersSelected = riders.length > 0 && riders.every((r) => selectedRiderIds.has(r.id))

const toggleRider = useCallback((id: string) => {
  setSelectedRiderIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    return next
  })
}, [])

const toggleSelectAll = useCallback(() => {
  setSelectedRiderIds((prev) => {
    const everyone = riders.every((r) => prev.has(r.id))
    return everyone ? new Set() : new Set(riders.map((r) => r.id))
  })
}, [riders])

const chosenRiderCount =
  selectionMode === 'individual'
    ? riders.filter((r) => selectedRiderIds.has(r.id)).length
    : riders.length

// The print page falls back to 2 blank cards when nothing else would print.
const cardCount = chosenRiderCount + extraBlankCards > 0 ? chosenRiderCount + extraBlankCards : 2

const individualSelectionValid = selectionMode === 'all' || chosenRiderCount > 0
```

- [ ] **Step 4: Add `riderIds` to the print URL**

In `generatePrintUrl`, after the `extraBlankCards` block (`if (extraBlankCards > 0) { ... }`) and before `return ...`, add:

```ts
if (selectionMode === 'individual') {
  const ids = riders.filter((r) => selectedRiderIds.has(r.id)).map((r) => r.id)
  params.set('riderIds', ids.join(','))
}
```

Then extend the `useCallback` dependency array for `generatePrintUrl` to include `selectionMode`, `selectedRiderIds`, and `riders`:

```ts
  }, [
    event.id,
    organizerName,
    organizerPhone,
    organizerEmail,
    controls,
    extraBlankCards,
    selectionMode,
    selectedRiderIds,
    riders,
  ])
```

- [ ] **Step 5: Gate form validity on the selection**

Change the `isFormValid` expression to also require a non-empty selection in individual mode:

```ts
const isFormValid =
  organizerName &&
  organizerPhone &&
  organizerEmail &&
  controls.every((c) => c.name && c.distance !== '') &&
  individualSelectionValid
```

- [ ] **Step 6: Replace the Registered Riders card body**

Replace the contents of the `<CardContent>` inside the "Registered Riders" card (the block that currently renders either the "no riders" paragraph or the 3-column read-only grid, followed by the extra-blank-cards row) with the version below. Keep the surrounding `<Card>` / `<CardHeader>` (title `Registered Riders ({riders.length})` and its description) unchanged.

```tsx
<CardContent className="space-y-4">
  {riders.length === 0 ? (
    <p className="text-muted-foreground text-sm">
      Two blank control cards will be printed for manual entry.
    </p>
  ) : (
    <div className="space-y-4">
      <RadioGroup
        value={selectionMode}
        onValueChange={(v) => setSelectionMode(v as 'all' | 'individual')}
        className="space-y-2"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="all" id="mode-all" />
          <Label htmlFor="mode-all" className="font-normal">
            All registered riders
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="individual" id="mode-individual" />
          <Label htmlFor="mode-individual" className="font-normal">
            Choose individually
          </Label>
        </div>
      </RadioGroup>

      {selectionMode === 'all' ? (
        <div className="grid gap-1 md:grid-cols-3">
          {riders.map((rider) => (
            <div key={rider.id} className="text-sm">
              {rider.firstName} {rider.lastName}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={allRidersSelected}
              onCheckedChange={toggleSelectAll}
            />
            <Label htmlFor="select-all" className="text-sm text-muted-foreground">
              Select all
            </Label>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {riders.map((rider) => {
              const label = `${rider.firstName} ${rider.lastName}`
              return (
                <div key={rider.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`rider-${rider.id}`}
                    checked={selectedRiderIds.has(rider.id)}
                    onCheckedChange={() => toggleRider(rider.id)}
                  />
                  <Label htmlFor={`rider-${rider.id}`} className="text-sm font-normal">
                    {label}
                  </Label>
                </div>
              )
            })}
          </div>
          {chosenRiderCount === 0 && (
            <p className="text-sm text-destructive">
              Select at least one rider, or switch to All registered riders.
            </p>
          )}
        </div>
      )}
    </div>
  )}

  <div className="flex items-center gap-3 pt-2 border-t">
    <Label htmlFor="extraBlank" className="text-sm whitespace-nowrap">
      Extra blank cards:
    </Label>
    <Input
      id="extraBlank"
      type="number"
      min="0"
      max="20"
      value={extraBlankCards}
      onChange={(e) => setExtraBlankCards(Math.max(0, parseInt(e.target.value) || 0))}
      className="w-20"
    />
    <span className="text-sm text-muted-foreground">for day-of registrations</span>
  </div>
</CardContent>
```

- [ ] **Step 7: Show the live count on the Generate button**

In the Actions section, replace the button's label text node `Generate Control Cards` with the dynamic count:

```tsx
            <Printer className="h-4 w-4 mr-2" />
            Generate {cardCount} Control Card{cardCount === 1 ? '' : 's'}
```

- [ ] **Step 8: Run the component test to verify it passes**

Run: `npx vitest run tests/unit/components/control-cards-form.test.tsx`
Expected: PASS (6 tests). If the "Select all" toggle assertion fails because the label resolves ambiguously, confirm the select-all `Label` text is exactly `Select all` and rider labels are `First Last`.

- [ ] **Step 9: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add components/admin/control-cards-form.tsx tests/unit/components/control-cards-form.test.tsx
git commit -m "Add per-rider selection to admin control-cards form"
```

---

### Task 4: Documentation

**Files:**

- Modify: `docs/control-cards.md`

**Interfaces:**

- Consumes: nothing. Docs-only.

- [ ] **Step 1: Read the existing doc**

Read `docs/control-cards.md` and locate the section describing the admin event control-cards page / registered riders.

- [ ] **Step 2: Document the selection option**

Add a short subsection (matching the doc's existing heading style) describing the new behavior on `app/admin/events/[id]/control-cards`:

- A "Print cards for" choice with two options: **All registered riders** (default) and **Choose individually**.
- Choosing individually reveals a checklist of registered riders, all checked by default; uncheck to exclude, or use "Select all" to clear/restore.
- The Generate button shows the live count of cards that will print (selected riders + extra blank cards).
- Under the hood, the selected rider IDs are passed to the print page as a `riderIds` query param; with no selection (the default) every registered rider gets a card, so existing links are unaffected.

- [ ] **Step 3: Commit**

```bash
git add docs/control-cards.md
git commit -m "Document rider selection on admin control cards"
```

---

## Final Verification

- [ ] Run the full suite: `npm test` — all pass.
- [ ] `npm run typecheck` — clean.
- [ ] `npm run lint` — clean.
- [ ] Manually confirm in the running app (admin event → Control Cards) that toggling to "Choose individually", unchecking a rider, and clicking Generate opens a print page with only the chosen riders. (The print page is admin- and seeded-DB-gated, so the Playwright screenshot requirement is waived per CLAUDE.md; note this in the completion summary.)

## Self-Review Notes

- **Spec coverage:** §1 form UI → Task 3; §2 URL plumbing → Task 3 (URL) + Task 2 (consume); §3 print filtering → Task 2; §4 helper → Task 1; §5 validation/edge cases → Task 3 (zero-selected disable, empty-roster hide) + Task 2 (stale IDs dropped); Testing → Tasks 1 & 3; Docs → Task 4. No gaps.
- **Type consistency:** `selectRegistrations` signature identical in Task 1 (definition) and Task 2 (use); `RegistrationForControlCardsWithToken` already satisfies `{ riders: { id: string } | null }`. State names (`selectionMode`, `selectedRiderIds`, `chosenRiderCount`, `cardCount`, `individualSelectionValid`) used consistently across Task 3 steps.

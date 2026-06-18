# Control Cards — Selectable Riders Design

**Date:** 2026-06-18
**Status:** Approved (design)
**Scope:** `app/admin/events/[id]/control-cards` (admin, event-scoped)

## Problem

The admin event control-cards tool always prints a card for every registered
rider. Organizers sometimes need cards for only a subset (e.g. a rider who lost
their card, or a small group). Printing for everyone must remain the default and
behave exactly as it does today.

## Current behavior (baseline)

- `app/admin/events/[id]/control-cards/page.tsx` loads the event and its
  `status='registered'` registrations and passes the riders to
  `ControlCardsForm`.
- `ControlCardsForm` (`components/admin/control-cards-form.tsx`) shows the roster
  in a **read-only** 3-column list and builds a print URL carrying only
  organizer details, controls, and `extraBlank`. **Rider identity is not passed
  in the URL.**
- `app/admin/events/[id]/control-cards/print/page.tsx` **re-fetches** all
  `registered` registrations from the DB, enriches each with a management token
  and a first-time-rider flag, and renders one card per rider (or two blank
  cards when there are no registrations).

## Goal

Let the organizer optionally choose individual riders, while keeping "print for
everyone" the zero-effort default. Interaction model: **mode toggle, then
checkboxes** (option B).

## Design

### 1. Form UI & state — `components/admin/control-cards-form.tsx`

The "Registered Riders" card gains a radio toggle at the top:

```
Print cards for:
  (•) All registered riders          ← default
  ( ) Choose individually
─────────────────────────────────────
(individual mode only:)
   [✓ Select all / none]
   [✓] Alice Adams   [✓] Bob Brar
   [✓] Cy Chen       [✓] Dee Diaz   ...
─────────────────────────────────────
Extra blank cards: [0]
```

New state:

- `selectionMode: 'all' | 'individual'` — defaults to `'all'`.
- `selectedRiderIds: Set<string>` — the checked rider IDs in individual mode.

Behavior:

- **All mode:** roster renders read-only exactly as today.
- **Switching to individual:** all riders start **checked**; the user unchecks to
  exclude. A "Select all / none" control toggles every checkbox.
- The Generate button shows a **live count**: `Generate N Control Cards`, where
  `N = (chosen riders) + extraBlankCards`. "Chosen riders" = all registered
  riders in All mode, or the checked subset in individual mode. When the roster
  is empty and there are no extra blanks, the print page emits 2 blank cards, so
  the count reflects that (`2`).
- When there are **no registrations**, the "Choose individually" option is
  hidden/disabled — there is nothing to choose.

### 2. URL plumbing (form → print)

`generatePrintUrl` appends `riderIds=<comma-separated ids>` **only** in
individual mode. In All mode the param is omitted, so the default — and every
existing bookmarked/print link — behaves identically to today.

### 3. Print page filtering — `.../control-cards/print/page.tsx`

The page continues to re-fetch all `registered` registrations from the DB; the
URL is never trusted for rider identity, only as a filter. After fetching:

- `riderIds` **absent** → use all registrations (current behavior, untouched).
- `riderIds` **present** → keep only registrations whose `riders.id` is in the
  set. IDs that no longer match a current registration are silently dropped
  (defensive against stale links / cancelled registrations).

First-time-rider flags and management tokens are computed over the **filtered**
set, preserving the DB order (`registered_at` ascending).

### 4. Selection helper (pure, unit-tested)

Extract the filter as a small pure function so the server component stays thin
and the logic is directly testable:

```ts
// e.g. lib/control-cards-selection.ts
export function selectRegistrations<T extends { riders: { id: string } | null }>(
  registrations: T[],
  riderIdsParam: string | undefined
): T[]
```

- `riderIdsParam` undefined/empty → return all registrations unchanged.
- otherwise parse comma-separated IDs into a set and return registrations whose
  `riders.id` is in the set, original order preserved.

The print page calls this immediately after fetching, before computing
first-time IDs and building `CardRider[]`.

### 5. Validation & edge cases

- **Individual mode, zero selected:** Generate is disabled with a hint ("Select
  at least one rider, or switch to All registered riders"). Extra blanks alone do
  not satisfy it — choosing individually implies wanting specific riders.
- **No registrations at all:** toggle hidden; behaves as today (2 blank cards).
- **Stale `riderIds`:** unknown IDs are dropped by `selectRegistrations`. If that
  leaves zero matches and `extraBlank=0`, the existing fallback prints 2 blank
  cards (acceptable defensive behavior; the form prevents producing such links).
- **Selection is not persisted** across navigation — fresh on each visit. Fine
  for a print tool.

## Testing

- Unit-test `selectRegistrations`: absent param → all; subset → filtered with
  order preserved; unknown IDs → dropped; empty/whitespace param → all.
- The print page is admin-gated and reachable only via seeded DB state, so per
  the repo CLAUDE.md the Playwright screenshot requirement is **waived**; rely on
  the unit coverage above. This will be noted in the completion summary.
- Run `npm test` and `npm run typecheck` before completion.

## Documentation

- Update `docs/control-cards.md` to describe the new "Print cards for: All /
  Choose individually" option on the admin event control-cards page.

## Out of scope

- The public generic tool at `app/control-cards/` (no event roster there).
- Persisting rider selection.
- Any change to BRM time calculation, control points, or card rendering.

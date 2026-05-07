# Control Cards: `?rwgps=true` URL-input mode

## Purpose

Route designers working in RideWithGPS need to validate how their draft route will print on a BRM control card before the route is published into our database. Today the control-cards page only lets you pick from `getActiveRoutesWithRwgps()` — a draft route isn't there yet.

This spec adds a query-param-gated mode (`/control-cards?rwgps=true`) that swaps the route picker for a RideWithGPS URL input. The user pastes any RWGPS route URL or ID; the form fetches the route's name, distance, and controls live from RWGPS, populates the form, and lets the user generate the same printable cards as the regular flow.

Nothing is persisted; the entire control-cards tool already produces a print URL with all data passed in querystring, so no schema or storage changes are needed.

## User flow

1. User visits `/control-cards?rwgps=true`.
2. The "Route" card shows a single text input ("Paste RideWithGPS route URL or ID") and a "Load" button instead of the usual route combobox.
3. User pastes one of:
   - `https://ridewithgps.com/routes/12345`
   - `https://ridewithgps.com/routes/12345-some-slug`
   - `ridewithgps.com/routes/12345`
   - `12345`
4. User clicks "Load." Spinner shows. We fetch `https://ridewithgps.com/routes/{id}.json`.
5. On success the form populates:
   - **Route name** field (editable) — from RWGPS route name.
   - **Distance (km)** field (editable) — from RWGPS route total distance.
   - **Control points** list — from the same parser the regular flow uses.
6. User edits date, organizer, controls, riders as usual and clicks "Generate Control Cards" — same downstream `/control-cards/print?...` URL.
7. On failure (bad ID, network error, no controls in the route) we show an inline error in the same place RWGPS errors already render.

The regular `/control-cards` page (without the query param) is unchanged.

## Components and data flow

### `lib/rwgps.ts`

- **Add** `parseRwgpsRouteId(input: string): string | null`. Single regex: capture digits after `/routes/` if present; otherwise match a bare numeric input. Trims whitespace. Returns `null` for unrecognized input.
- **Add** `fetchRwgpsRoute(id: string): Promise<{ name: string; distanceKm: number; controls: ParsedControl[] }>`. Performs the same `/routes/{id}.json` fetch the existing flow does, but returns metadata in addition to controls. Reuses `extractControls()`. Surfaces user-facing errors via `Error.message` (same convention as `fetchRwgpsControls`).
- Keep `fetchRwgpsControls` unchanged — the existing route-picker flow keeps using it. (Could be refactored to delegate to `fetchRwgpsRoute`, but that's outside scope.)

### `app/control-cards/page.tsx`

- Becomes aware of `searchParams.rwgps`.
- When `rwgps` is truthy, skip `getActiveRoutesWithRwgps()` (we don't need the routes list) and pass `mode="rwgps"` to `ControlCardForm`.
- Otherwise behaves exactly as today.
- The "How it works" copy on the left gets a small variant in rwgps mode noting the URL is read live and nothing is saved. This is a minor copy change in the same file.

### `components/control-card-form.tsx`

- New optional prop `mode?: 'picker' | 'rwgps'` (default `'picker'`). When `'rwgps'`, `routes` is unused and may be passed as `[]`.
- New state in rwgps mode:
  - `rwgpsInput: string` — the raw text in the URL input.
  - `manualRouteName: string` — the editable route name field.
  - `manualDistanceKm: string` — the editable distance field (string for input control parity with existing fields).
- Reuse the existing `isLoadingRwgps` and `rwgpsError` state for the load button's spinner and any fetch-time error message — same UX as the picker-mode "Import from RWGPS" button.
- The `selectedRoute` derivation is replaced/augmented so that downstream code (`generatePrintUrl`, `isFormValid`, etc.) reads route name + distance from a single source. Cleanest shape: a memoized `effectiveRoute` that returns either the picked DB route (picker mode) or `{ name: manualRouteName, distanceKm: parseFloat(manualDistanceKm), chapterName: null, rwgpsId: <fetched id> }` (rwgps mode). All downstream code uses `effectiveRoute`.
- `chapterName` falls through to the print page's existing default ("Randonneurs Ontario"), no change needed.
- Auto-import of controls when route changes: in rwgps mode, controls are populated by the explicit "Load" button, not by an effect.

### Validation rules

Form is valid in rwgps mode when:

- `manualRouteName` is non-empty.
- `manualDistanceKm` parses to a positive number.
- All controls have name + distance (same as today).
- Date is selected (same as today).

`isFormValid` is updated to read from `effectiveRoute`.

## Tests

- **`parseRwgpsRouteId`**: cover full URL, slugged URL, host-less URL, bare ID, leading/trailing whitespace, garbage input, empty string. Goes in a new `lib/rwgps.test.ts` if one doesn't exist, otherwise extends it.
- **`fetchRwgpsRoute`**: mock `fetch` and verify it returns `{ name, distanceKm, controls }` from a representative RWGPS JSON shape; verify it throws a user-facing message on non-OK response and on missing controls.
- Component-level integration test for `ControlCardForm` is **out of scope** — there are no existing tests for this component, and adding one would require non-trivial test scaffolding for shadcn Popover/Command/Calendar interactions. Will note this explicitly in the completion summary.
- Manual verification: Playwright screenshot of `/control-cards?rwgps=true` per project convention.

## Discoverability

The `?rwgps=true` entry point is intentionally undocumented in user-facing UI. It's a route-designer tool, linkable but not surfaced. No nav change.

## Out of scope

- Persisting fetched RWGPS routes back into the database.
- Sharing pre-filled URLs (the rwgps-mode page itself does not encode form state in the query string beyond `rwgps=true`).
- Refactoring `fetchRwgpsControls` to delegate to `fetchRwgpsRoute`.
- Surfacing rwgps mode in any nav.

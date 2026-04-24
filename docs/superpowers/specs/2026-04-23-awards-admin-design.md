# Awards Admin Page — Design

**Date:** 2026-04-23
**Status:** Approved for planning
**Owner:** Mark Allen

## Goal

Give full admins a UI to assign awards to riders. Today, awards are populated only by the SQLite import script (`scripts/import-sqlite.ts`); there is no admin path for ongoing assignments. Without this, every new SR batch, PBP finisher, or Granite Anvil completion requires a database write by hand.

The page is **assign-only** — no list, no edit, no delete. Mistakes get fixed in the database. Scope creep is explicitly avoided.

## Scope

In:

- New page at `/admin/awards` for assigning a single award to a single rider per submission.
- Two server actions for the two storage paths (`result_awards`, `rider_awards`).
- Sidebar entry under the Management group.
- Audit log entry per assignment.
- Cache invalidation for `/awards`, `/records`, and the affected rider's profile.

Out:

- Listing existing assignments.
- Editing or deleting assignments.
- Bulk assignment in a single submission.
- Course Record (calculated, not stored).
- Chapter-admin access.

## Background

`awards.award_type` is a discriminator that determines which junction table holds the assignment:

- `'result'` → `result_awards (result_id, award_id)` with `PRIMARY KEY (result_id, award_id)`.
- `'season'` → `rider_awards (rider_id, award_id, season, note)` with **no** unique constraint (intentional — a rider can earn the same season award twice in one season).

RLS on `rider_awards` is `is_admin()` (full admin only, not chapter_admin) because season awards may span chapters. We apply the same gate to the page and to both server actions for consistency.

## Architecture

```
app/admin/awards/
  page.tsx                   # Server: requireAdmin (full), loads awards list, renders form
components/admin/
  award-assign-form.tsx      # Client: conditional form, calls server actions
lib/actions/
  awards.ts                  # NEW: assignResultAward, assignSeasonAward, searchRiderResults
docs/awards.md               # Updated: document admin UI under "Adding New Awards"
```

- `app/admin/awards/page.tsx` is a server component. It calls `requireAdmin()`, redirects non-full-admins (matching the pattern in `app/admin/riders/page.tsx`), fetches the awards list (`id, slug, title, award_type, description`) ordered by title, and renders the form. Course Record is not stored in the `awards` table at all (it is computed on the route page from the `award-badge.tsx` defaults), so no exclusion logic is needed — if the row appears later, exclude by `slug = 'course-record'`.
- `components/admin/award-assign-form.tsx` is a client component holding the form state, conditional rendering, and submit handlers. Uses shadcn `Select`, `Input`, `Textarea`, `Label`, plus the existing rider search pattern from `components/admin/add-rider-dialog.tsx` (debounced 300 ms `searchRiders` call).
- `lib/actions/awards.ts` is new. Exports `assignResultAward`, `assignSeasonAward`, and `searchRiderResults`. All call `requireAdmin()` and check `isFullAdmin(admin.role)`; both write actions call `logAuditEvent` and revalidate caches.
- Sidebar: append to `managementNavItems` in `components/admin/sidebar.tsx`. Icon: `Award` from `lucide-react`. `requiresSuperAdmin: false` (the parent `Management` group already gates on `isFullAdmin`).

## Data flow

The form has three states driven by the selected award:

### State A — no award selected

Only the award `<Select>` is visible. Options listed alphabetically by title with a small `(season)` / `(result)` suffix so admins can see scope at a glance.

### State B — result-scoped award selected

Reveals: rider search field, then a result picker.

- Rider search calls `searchRiders` (existing) with 300 ms debounce; results render as a button list (mirroring `add-rider-dialog.tsx`).
- On rider select, the client immediately calls `searchRiderResults(riderId)` which returns `{ result_id, event_name, event_date, distance_km, chapter_name, status, finish_time }[]` ordered by `event_date desc`.
- Result picker is a single `<Select>`. Each option is formatted: `2024-08-15 · Granite Anvil · 1200 km · Toronto · finished`. No additional filtering UI — most riders have under 100 results.
- Submit: `assignResultAward({ awardId, resultId })` → insert into `result_awards (result_id, award_id)`.

### State C — season-scoped award selected

Reveals: rider search field, season number input, optional note textarea.

- Season is a number input defaulting to `new Date().getFullYear()`. Stored as INT to match the rest of the schema.
- Note (`<Textarea>`, optional) maps to `rider_awards.note`.
- Submit: `assignSeasonAward({ awardId, riderId, season, note })` → insert into `rider_awards`.

### Post-submit behaviour

Toast success on the green path; reset rider/result/season/note but keep the award selected so consecutive entries for the same award are fast. No `router.refresh()` (no list to update on the page itself).

On failure: `toast.error(res.error)` from the `ActionResult` envelope (existing pattern from `lib/actions/results.ts`).

## Validation and edge cases

1. **Duplicate `result_awards` row** — `PRIMARY KEY (result_id, award_id)` rejects the second insert with Postgres code `23505`. The action catches this and returns: _"This rider already has the {award title} for that result."_ Other errors fall through to the standard `handleSupabaseError`.
2. **Duplicate `rider_awards` row** — no unique constraint by design. We do not pre-check and we do not warn. The note field is the right place for context if it matters.
3. **Wrong scope guard** — both server actions re-fetch the award and verify `award.award_type` matches the action being called. Defence in depth against a tampered client request.
4. **Result/rider mismatch** — `assignResultAward` re-fetches the result and confirms `result.rider_id === riderId`. Prevents UI desync where the rider was switched after results were loaded.
5. **Season range** — clamp to `[1980, currentYear + 1]`. Anything outside is rejected with: _"Season must be between 1980 and {currentYear + 1}."_
6. **Award not found at submit time** — if the lookup returns nothing (e.g., deleted between page load and submit), return: _"Award no longer exists. Reload the page."_
7. **Audit log** — both actions write a `logAuditEvent` entry with `entityType: 'award'`, `entityId` set to the inserted row id (or the composite `${awardId}:${resultId}` for `result_awards` since it lacks a single PK), and a description like `Assigned {award title} to {rider name} for {2024 season|Granite Anvil 2024-08-15}`.
8. **Cache invalidation** — after a successful insert, call `revalidateTag('awards', { expire: 0 })` so `/awards` and `/records` refresh, and `revalidatePath('/riders/{slug}')` so the rider's profile updates. The slug is fetched as part of the rider lookup the action already does for the audit log.

## Server actions API

```ts
// lib/actions/awards.ts

export interface AssignResultAwardData {
  awardId: string
  resultId: string
}

export async function assignResultAward(data: AssignResultAwardData): Promise<ActionResult>

export interface AssignSeasonAwardData {
  awardId: string
  riderId: string
  season: number
  note?: string | null
}

export async function assignSeasonAward(data: AssignSeasonAwardData): Promise<ActionResult>

export interface RiderResultOption {
  resultId: string
  eventName: string
  eventDate: string // ISO yyyy-mm-dd
  distanceKm: number
  chapterName: string | null
  status: string
  finishTime: string | null
}

export async function searchRiderResults(riderId: string): Promise<RiderResultOption[]>
```

Both write actions return the existing `ActionResult` envelope and follow the same pattern as `lib/actions/results.ts`: `requireAdmin`, validate, mutate, audit log, revalidate, return.

## Permissions

- Page-level: server component calls `requireAdmin()` and redirects to `/admin` if `!isFullAdmin(admin.role)` — same shape as `app/admin/riders/page.tsx`.
- Sidebar visibility: lives in `managementNavItems`, which is already gated by `isFullAdmin(admin.role)` in `components/admin/sidebar.tsx`.
- Server-action level: each action calls `requireAdmin()` and checks `isFullAdmin(admin.role)` so a chapter admin who somehow finds the action cannot succeed.

## Testing

### Unit — `tests/unit/lib/awards-actions.test.ts` (new)

No existing unit tests cover server actions in `lib/actions/`, so this is a new precedent. Place alongside `tests/unit/lib/awards.test.ts` (which covers the read library) and disambiguate via the file name.

Mocks `getSupabaseAdmin`, `requireAdmin`, `logAuditEvent`.

- `assignResultAward` happy path inserts into `result_awards` and revalidates tags.
- `assignResultAward` rejects when the award's `award_type !== 'result'`.
- `assignResultAward` rejects when `result.rider_id !== riderId`.
- `assignResultAward` returns the friendly message on Postgres `23505`.
- `assignSeasonAward` happy path inserts into `rider_awards`, no duplicate precheck.
- `assignSeasonAward` allows the same rider+award+season twice.
- `assignSeasonAward` rejects when the award's `award_type !== 'season'`.
- `assignSeasonAward` rejects season < 1980 or > currentYear + 1.
- Both actions reject when `requireAdmin` throws (covered by harness pattern).

### Component — `tests/unit/components/award-assign-form.test.tsx` (new)

- Pre-award-selection: only the award select is visible.
- Pick result-scoped award → rider field appears; season/note do not.
- Pick season-scoped award → season + note appear; result picker does not.
- After successful submit, award stays selected and rider/result/season/note reset.

### Out of scope

No `integration-real` test for the awards admin path. Unit + component coverage exercises the Supabase shape and the conditional UI; we add an integration test only if a regression slips through.

## Documentation

Update `docs/awards.md` "Adding New Awards" section to point at the admin UI and document the assign-only scope. No new docs file.

## Open questions

None at design time. Surface anything that comes up during implementation in the plan doc.

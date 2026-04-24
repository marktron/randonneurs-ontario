# Awards Admin Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/admin/awards`, an assign-only form that lets full admins attach a single award to a single rider per submission, branching by `awards.award_type` to write either `result_awards` or `rider_awards`.

**Architecture:** Server component loads the awards list and renders a client form. Form is conditional on the selected award's `award_type`. Two server actions handle the two storage paths (plus a helper to fetch a rider's results). Audit log + cache invalidation per assignment. Full-admin gated at every layer (page, sidebar, server action).

**Tech Stack:** Next.js App Router (server components + server actions), Supabase, shadcn UI (`Select`, `Input`, `Textarea`, `Label`, `Card`, `Button`), `sonner` toasts, Vitest + Testing Library (`happy-dom`).

**Spec:** `docs/superpowers/specs/2026-04-23-awards-admin-design.md`

---

## File Plan

- **Create** `lib/actions/awards.ts` — three server actions: `searchRiderResults`, `assignResultAward`, `assignSeasonAward`. All gated by `requireAdmin` + `isFullAdmin`. Both writes do audit log + cache invalidation.
- **Modify** `lib/audit-log.ts` — add `'award'` to the `AuditEntityType` union.
- **Create** `app/admin/awards/page.tsx` — server component. Fetches awards list, gates on `isFullAdmin`, renders `AwardAssignForm`.
- **Create** `components/admin/award-assign-form.tsx` — client component. Award select drives which subform renders.
- **Modify** `components/admin/sidebar.tsx` — append nav entry to `managementNavItems`.
- **Create** `tests/unit/lib/awards-actions.test.ts` — unit tests for the three server actions.
- **Create** `tests/unit/components/award-assign-form.test.tsx` — component tests for the form's conditional UI and post-submit behavior.
- **Modify** `docs/awards.md` — point "Adding New Awards" at the admin UI.

---

## Task 1: Add `'award'` to audit log entity types

**Files:**

- Modify: `lib/audit-log.ts:4-13`

The audit log enforces a fixed list of entity types via the `AuditEntityType` union. We need `'award'` for the assignment audit entries written in Tasks 3 and 4. No test coverage needed for this change directly — Tasks 3 and 4 will exercise it through their action tests.

- [ ] **Step 1: Add `'award'` to the union**

Edit `lib/audit-log.ts`. The current union:

```ts
export type AuditEntityType =
  | 'event'
  | 'route'
  | 'rider'
  | 'result'
  | 'registration'
  | 'page'
  | 'admin_user'
  | 'news'
  | 'navigation'
```

becomes:

```ts
export type AuditEntityType =
  | 'event'
  | 'route'
  | 'rider'
  | 'result'
  | 'registration'
  | 'page'
  | 'admin_user'
  | 'news'
  | 'navigation'
  | 'award'
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/audit-log.ts
git commit -m "Add 'award' to AuditEntityType union"
```

---

## Task 2: Server action — `searchRiderResults`

**Files:**

- Create: `lib/actions/awards.ts`
- Create: `tests/unit/lib/awards-actions.test.ts`

`searchRiderResults` is a read-only helper called from the client form when the admin picks a rider for a result-scoped award. Returns the rider's results most-recent-first. No mutations, no audit log.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lib/awards-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Track Supabase calls
type FromCall = { table: string; ops: string[] }
const fromCalls: FromCall[] = []

// Per-test response state
let resultsResponse: { data: unknown; error: unknown } = { data: [], error: null }

const mockFrom = vi.fn((table: string) => {
  const call: FromCall = { table, ops: [] }
  fromCalls.push(call)

  const builder = {
    select: vi.fn(() => {
      call.ops.push('select')
      return builder
    }),
    eq: vi.fn(() => {
      call.ops.push('eq')
      return builder
    }),
    order: vi.fn(() => {
      call.ops.push('order')
      return Promise.resolve(resultsResponse)
    }),
  }
  return builder
})

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn(async () => ({ id: 'admin-1', role: 'admin' })),
}))

vi.mock('@/lib/auth/roles', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/roles')>('@/lib/auth/roles')
  return actual
})

vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
}))

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

import { searchRiderResults } from '@/lib/actions/awards'

describe('searchRiderResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromCalls.length = 0
    resultsResponse = { data: [], error: null }
  })

  it('returns the rider’s results sorted by event_date desc', async () => {
    resultsResponse = {
      data: [
        {
          id: 'r-2',
          status: 'finished',
          finish_time: '13:30:00',
          distance_km: 600,
          events: {
            name: 'Lake Ontario 600',
            event_date: '2024-08-15',
            chapters: { name: 'Toronto' },
          },
        },
        {
          id: 'r-1',
          status: 'dnf',
          finish_time: null,
          distance_km: 400,
          events: {
            name: 'Niagara 400',
            event_date: '2024-06-01',
            chapters: { name: 'Niagara' },
          },
        },
      ],
      error: null,
    }

    const result = await searchRiderResults('rider-123')

    expect(result).toEqual([
      {
        resultId: 'r-2',
        eventName: 'Lake Ontario 600',
        eventDate: '2024-08-15',
        distanceKm: 600,
        chapterName: 'Toronto',
        status: 'finished',
        finishTime: '13:30:00',
      },
      {
        resultId: 'r-1',
        eventName: 'Niagara 400',
        eventDate: '2024-06-01',
        distanceKm: 400,
        chapterName: 'Niagara',
        status: 'dnf',
        finishTime: null,
      },
    ])

    const resultsCall = fromCalls.find((c) => c.table === 'results')
    expect(resultsCall).toBeDefined()
    expect(resultsCall!.ops).toEqual(['select', 'eq', 'order'])
  })

  it('returns [] when supabase returns an error', async () => {
    resultsResponse = { data: null, error: { message: 'boom' } }
    const result = await searchRiderResults('rider-123')
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/lib/awards-actions.test.ts`
Expected: FAIL with "Cannot find module '@/lib/actions/awards'"

- [ ] **Step 3: Create the action file**

Create `lib/actions/awards.ts`:

```ts
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { isFullAdmin } from '@/lib/auth/roles'
import { logAuditEvent } from '@/lib/audit-log'
import {
  handleActionError,
  handleSupabaseError,
  handleDataError,
  createActionResult,
} from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

export interface RiderResultOption {
  resultId: string
  eventName: string
  eventDate: string
  distanceKm: number
  chapterName: string | null
  status: string
  finishTime: string | null
}

interface RiderResultRow {
  id: string
  status: string | null
  finish_time: string | null
  distance_km: number | null
  events: {
    name: string | null
    event_date: string | null
    chapters: { name: string | null } | null
  } | null
}

export async function searchRiderResults(riderId: string): Promise<RiderResultOption[]> {
  await requireAdmin()

  const { data, error } = await getSupabaseAdmin()
    .from('results')
    .select(
      `
        id,
        status,
        finish_time,
        distance_km,
        events (name, event_date, chapters (name))
      `
    )
    .eq('rider_id', riderId)
    .order('events(event_date)', { ascending: false })

  if (error) {
    return handleDataError(error, { operation: 'searchRiderResults', context: { riderId } }, [])
  }

  return ((data as RiderResultRow[] | null) ?? []).map((row) => ({
    resultId: row.id,
    eventName: row.events?.name ?? '',
    eventDate: row.events?.event_date ?? '',
    distanceKm: row.distance_km ?? 0,
    chapterName: row.events?.chapters?.name ?? null,
    status: row.status ?? 'pending',
    finishTime: row.finish_time,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/lib/awards-actions.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/actions/awards.ts tests/unit/lib/awards-actions.test.ts
git commit -m "Add searchRiderResults helper for awards admin"
```

---

## Task 3: Server action — `assignResultAward`

**Files:**

- Modify: `lib/actions/awards.ts`
- Modify: `tests/unit/lib/awards-actions.test.ts`

This is the write path for result-scoped awards. Validates: `award_type === 'result'`, `result.rider_id === riderId`, dedupe via Postgres `23505`. On success: insert, audit log, revalidate `awards` tag and the rider profile tag.

- [ ] **Step 1: Extend the test mocks to support multiple table responses**

Replace the `resultsResponse` block at the top of `tests/unit/lib/awards-actions.test.ts` with a per-table response map. Update the `mockFrom` factory to dispatch by table and to support the additional builder methods we'll need (`single`, `insert`, `update` is not used here). Replace the existing top-of-file mock setup with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

type FromCall = { table: string; ops: string[]; insertPayload?: unknown }
const fromCalls: FromCall[] = []

interface TableState {
  selectResponse?: { data: unknown; error: unknown }
  insertResponse?: { data: unknown; error: unknown }
}

let tables: Record<string, TableState> = {}

const mockFrom = vi.fn((table: string) => {
  const call: FromCall = { table, ops: [] }
  fromCalls.push(call)
  const state = tables[table] ?? {}

  const builder = {
    select: vi.fn(() => {
      call.ops.push('select')
      return builder
    }),
    eq: vi.fn(() => {
      call.ops.push('eq')
      return builder
    }),
    order: vi.fn(() => {
      call.ops.push('order')
      return Promise.resolve(state.selectResponse ?? { data: [], error: null })
    }),
    single: vi.fn(() => {
      call.ops.push('single')
      return Promise.resolve(state.selectResponse ?? { data: null, error: null })
    }),
    insert: vi.fn((payload: unknown) => {
      call.ops.push('insert')
      call.insertPayload = payload
      return {
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(state.insertResponse ?? { data: null, error: null })),
        })),
      }
    }),
  }
  return builder
})

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}))

const mockRequireAdmin = vi.fn(async () => ({ id: 'admin-1', role: 'admin' }))
vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: () => mockRequireAdmin(),
}))

const mockLogAuditEvent = vi.fn(async () => undefined)
vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}))

const mockRevalidateTag = vi.fn()
const mockRevalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}))

import { searchRiderResults, assignResultAward } from '@/lib/actions/awards'
```

Then update the existing `searchRiderResults` describe block to populate `tables.results.selectResponse` instead of `resultsResponse`. The two existing tests become:

```ts
describe('searchRiderResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromCalls.length = 0
    tables = {}
    mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' })
  })

  it('returns the rider’s results sorted by event_date desc', async () => {
    tables.results = {
      selectResponse: {
        data: [
          {
            id: 'r-2',
            status: 'finished',
            finish_time: '13:30:00',
            distance_km: 600,
            events: {
              name: 'Lake Ontario 600',
              event_date: '2024-08-15',
              chapters: { name: 'Toronto' },
            },
          },
          {
            id: 'r-1',
            status: 'dnf',
            finish_time: null,
            distance_km: 400,
            events: {
              name: 'Niagara 400',
              event_date: '2024-06-01',
              chapters: { name: 'Niagara' },
            },
          },
        ],
        error: null,
      },
    }

    const result = await searchRiderResults('rider-123')
    expect(result.map((r) => r.resultId)).toEqual(['r-2', 'r-1'])
    expect(result[0].chapterName).toBe('Toronto')
  })

  it('returns [] when supabase returns an error', async () => {
    tables.results = { selectResponse: { data: null, error: { message: 'boom' } } }
    expect(await searchRiderResults('rider-123')).toEqual([])
  })
})
```

- [ ] **Step 2: Add the failing tests for `assignResultAward`**

Append to `tests/unit/lib/awards-actions.test.ts`:

```ts
describe('assignResultAward', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromCalls.length = 0
    tables = {}
    mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' })
  })

  function setupHappyPath() {
    tables.awards = {
      selectResponse: {
        data: { id: 'award-pbp', title: 'Paris-Brest-Paris', award_type: 'result' },
        error: null,
      },
    }
    tables.results = {
      selectResponse: {
        data: {
          id: 'res-1',
          rider_id: 'rider-1',
          riders: { first_name: 'Jane', last_name: 'Doe', slug: 'jane-doe' },
          events: { name: 'Paris-Brest-Paris', event_date: '2023-08-20' },
        },
        error: null,
      },
    }
    tables.result_awards = {
      insertResponse: { data: { result_id: 'res-1', award_id: 'award-pbp' }, error: null },
    }
  }

  it('inserts into result_awards on the happy path and revalidates caches', async () => {
    setupHappyPath()

    const res = await assignResultAward({ awardId: 'award-pbp', resultId: 'res-1' })

    expect(res).toEqual({ success: true })
    const insertCall = fromCalls.find((c) => c.table === 'result_awards')
    expect(insertCall?.insertPayload).toEqual({ result_id: 'res-1', award_id: 'award-pbp' })
    expect(mockRevalidateTag).toHaveBeenCalledWith('awards', { expire: 0 })
    expect(mockRevalidateTag).toHaveBeenCalledWith('rider-jane-doe', { expire: 0 })
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'create',
        entityType: 'award',
        description: expect.stringContaining('Paris-Brest-Paris'),
      })
    )
  })

  it('rejects when the award is season-scoped', async () => {
    tables.awards = {
      selectResponse: {
        data: { id: 'award-sr', title: 'Super Randonneur', award_type: 'season' },
        error: null,
      },
    }

    const res = await assignResultAward({ awardId: 'award-sr', resultId: 'res-1' })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/season-scoped/i)
    expect(fromCalls.find((c) => c.table === 'result_awards')).toBeUndefined()
  })

  it('returns the friendly duplicate message on Postgres 23505', async () => {
    setupHappyPath()
    tables.result_awards = {
      insertResponse: { data: null, error: { code: '23505', message: 'dup' } },
    }

    const res = await assignResultAward({ awardId: 'award-pbp', resultId: 'res-1' })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/already has the Paris-Brest-Paris/i)
  })

  it('returns "Award no longer exists" if award lookup is empty', async () => {
    tables.awards = { selectResponse: { data: null, error: null } }

    const res = await assignResultAward({ awardId: 'missing', resultId: 'res-1' })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/no longer exists/i)
  })
})
```

Note: spec validation #4 ("Result/rider mismatch") is moot here — `assignResultAward` derives the rider from the result row itself, so there is no separate `riderId` to mismatch. The audit log description still uses the rider's name pulled from that lookup.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/awards-actions.test.ts`
Expected: FAIL — `assignResultAward` is not exported.

- [ ] **Step 4: Implement `assignResultAward`**

Append to `lib/actions/awards.ts`:

```ts
export interface AssignResultAwardData {
  awardId: string
  resultId: string
}

interface AwardRow {
  id: string
  title: string
  award_type: 'result' | 'season'
}

interface ResultLookupRow {
  id: string
  rider_id: string
  riders: { first_name: string; last_name: string; slug: string } | null
  events: { name: string; event_date: string } | null
}

export async function assignResultAward(data: AssignResultAwardData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    if (!isFullAdmin(admin.role)) {
      return { success: false, error: 'Only full admins can assign awards' }
    }

    const { data: awardRaw } = await getSupabaseAdmin()
      .from('awards')
      .select('id, title, award_type')
      .eq('id', data.awardId)
      .single()
    const award = awardRaw as AwardRow | null

    if (!award) {
      return { success: false, error: 'Award no longer exists. Reload the page.' }
    }
    if (award.award_type !== 'result') {
      return { success: false, error: 'This award is season-scoped — use the season form.' }
    }

    const { data: resultRaw } = await getSupabaseAdmin()
      .from('results')
      .select('id, rider_id, riders (first_name, last_name, slug), events (name, event_date)')
      .eq('id', data.resultId)
      .single()
    const result = resultRaw as ResultLookupRow | null

    if (!result) {
      return { success: false, error: 'Result not found.' }
    }

    const { error } = await getSupabaseAdmin()
      .from('result_awards')
      .insert({ result_id: data.resultId, award_id: data.awardId })

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return {
          success: false,
          error: `This rider already has the ${award.title} for that result.`,
        }
      }
      return handleSupabaseError(
        error,
        { operation: 'assignResultAward' },
        'Failed to assign award'
      )
    }

    const riderName = result.riders
      ? `${result.riders.first_name} ${result.riders.last_name}`
      : 'unknown rider'
    const eventLabel = result.events
      ? `${result.events.name} ${result.events.event_date}`
      : data.resultId

    await logAuditEvent({
      adminId: admin.id,
      action: 'create',
      entityType: 'award',
      entityId: `${data.awardId}:${data.resultId}`,
      description: `Assigned ${award.title} to ${riderName} for ${eventLabel}`,
    })

    revalidateTag('awards', { expire: 0 })
    if (result.riders?.slug) {
      revalidateTag(`rider-${result.riders.slug}`, { expire: 0 })
    }

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'assignResultAward' }, 'Failed to assign award')
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/lib/awards-actions.test.ts`
Expected: PASS (2 from `searchRiderResults` + 3 from `assignResultAward` = 5)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/actions/awards.ts tests/unit/lib/awards-actions.test.ts
git commit -m "Add assignResultAward server action"
```

---

## Task 4: Server action — `assignSeasonAward`

**Files:**

- Modify: `lib/actions/awards.ts`
- Modify: `tests/unit/lib/awards-actions.test.ts`

Write path for season-scoped awards. Validates: `award_type === 'season'`, season in `[1980, currentYear+1]`. No duplicate precheck (intentional). On success: insert, audit log, revalidate caches.

- [ ] **Step 1: Add failing tests for `assignSeasonAward`**

Append to `tests/unit/lib/awards-actions.test.ts`:

```ts
describe('assignSeasonAward', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromCalls.length = 0
    tables = {}
    mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' })
  })

  function setupHappyPath() {
    tables.awards = {
      selectResponse: {
        data: { id: 'award-sr', title: 'Super Randonneur', award_type: 'season' },
        error: null,
      },
    }
    tables.riders = {
      selectResponse: {
        data: { first_name: 'Jane', last_name: 'Doe', slug: 'jane-doe' },
        error: null,
      },
    }
    tables.rider_awards = {
      insertResponse: { data: { id: 'ra-1' }, error: null },
    }
  }

  it('inserts into rider_awards on the happy path', async () => {
    setupHappyPath()

    const res = await assignSeasonAward({
      awardId: 'award-sr',
      riderId: 'rider-1',
      season: 2024,
      note: 'Earned at RM 600',
    })

    expect(res).toEqual({ success: true })
    const insertCall = fromCalls.find((c) => c.table === 'rider_awards')
    expect(insertCall?.insertPayload).toEqual({
      rider_id: 'rider-1',
      award_id: 'award-sr',
      season: 2024,
      note: 'Earned at RM 600',
    })
    expect(mockRevalidateTag).toHaveBeenCalledWith('awards', { expire: 0 })
    expect(mockRevalidateTag).toHaveBeenCalledWith('rider-jane-doe', { expire: 0 })
  })

  it('does not pre-check for duplicates (allows same rider+award+season twice)', async () => {
    setupHappyPath()

    await assignSeasonAward({ awardId: 'award-sr', riderId: 'rider-1', season: 2024 })
    await assignSeasonAward({ awardId: 'award-sr', riderId: 'rider-1', season: 2024 })

    const inserts = fromCalls.filter((c) => c.table === 'rider_awards')
    expect(inserts.length).toBe(2)
    // No SELECT-then-INSERT pattern — no prior `select` call against rider_awards
    const selects = fromCalls.filter((c) => c.table === 'rider_awards' && c.ops.includes('select'))
    expect(selects.length).toBe(0)
  })

  it('rejects when the award is result-scoped', async () => {
    tables.awards = {
      selectResponse: {
        data: { id: 'award-pbp', title: 'Paris-Brest-Paris', award_type: 'result' },
        error: null,
      },
    }

    const res = await assignSeasonAward({ awardId: 'award-pbp', riderId: 'rider-1', season: 2024 })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/result-scoped/i)
  })

  it('rejects season < 1980', async () => {
    tables.awards = {
      selectResponse: {
        data: { id: 'a', title: 'X', award_type: 'season' },
        error: null,
      },
    }

    const res = await assignSeasonAward({ awardId: 'a', riderId: 'r', season: 1979 })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/season must be between 1980/i)
  })

  it('rejects season > currentYear + 1', async () => {
    tables.awards = {
      selectResponse: {
        data: { id: 'a', title: 'X', award_type: 'season' },
        error: null,
      },
    }
    const tooFar = new Date().getFullYear() + 2

    const res = await assignSeasonAward({ awardId: 'a', riderId: 'r', season: tooFar })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/season must be between 1980/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/lib/awards-actions.test.ts -t assignSeasonAward`
Expected: FAIL — `assignSeasonAward` is not exported.

- [ ] **Step 3: Implement `assignSeasonAward`**

Append to `lib/actions/awards.ts`:

```ts
export interface AssignSeasonAwardData {
  awardId: string
  riderId: string
  season: number
  note?: string | null
}

interface RiderLookupRow {
  first_name: string
  last_name: string
  slug: string
}

export async function assignSeasonAward(data: AssignSeasonAwardData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    if (!isFullAdmin(admin.role)) {
      return { success: false, error: 'Only full admins can assign awards' }
    }

    const maxSeason = new Date().getFullYear() + 1
    if (data.season < 1980 || data.season > maxSeason) {
      return { success: false, error: `Season must be between 1980 and ${maxSeason}.` }
    }

    const { data: awardRaw } = await getSupabaseAdmin()
      .from('awards')
      .select('id, title, award_type')
      .eq('id', data.awardId)
      .single()
    const award = awardRaw as AwardRow | null

    if (!award) {
      return { success: false, error: 'Award no longer exists. Reload the page.' }
    }
    if (award.award_type !== 'season') {
      return { success: false, error: 'This award is result-scoped — use the result form.' }
    }

    const { data: riderRaw } = await getSupabaseAdmin()
      .from('riders')
      .select('first_name, last_name, slug')
      .eq('id', data.riderId)
      .single()
    const rider = riderRaw as RiderLookupRow | null

    if (!rider) {
      return { success: false, error: 'Rider not found.' }
    }

    const { error } = await getSupabaseAdmin()
      .from('rider_awards')
      .insert({
        rider_id: data.riderId,
        award_id: data.awardId,
        season: data.season,
        note: data.note ?? null,
      })

    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'assignSeasonAward' },
        'Failed to assign award'
      )
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'create',
      entityType: 'award',
      entityId: data.awardId,
      description: `Assigned ${award.title} to ${rider.first_name} ${rider.last_name} for ${data.season} season`,
    })

    revalidateTag('awards', { expire: 0 })
    revalidateTag(`rider-${rider.slug}`, { expire: 0 })

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'assignSeasonAward' }, 'Failed to assign award')
  }
}
```

- [ ] **Step 4: Update the test import**

At the top of `tests/unit/lib/awards-actions.test.ts`, add `assignSeasonAward` to the import:

```ts
import { searchRiderResults, assignResultAward, assignSeasonAward } from '@/lib/actions/awards'
```

- [ ] **Step 5: Run all tests to verify they pass**

Run: `npx vitest run tests/unit/lib/awards-actions.test.ts`
Expected: PASS (2 + 3 + 5 = 10)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/actions/awards.ts tests/unit/lib/awards-actions.test.ts
git commit -m "Add assignSeasonAward server action"
```

---

## Task 5: Admin page (server component)

**Files:**

- Create: `app/admin/awards/page.tsx`

Server component that gates on full-admin, fetches the awards list (excluding `slug = 'course-record'` defensively), and renders the form. No tests needed — trivial render.

- [ ] **Step 1: Create the page**

Create `app/admin/awards/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/get-admin'
import { isFullAdmin } from '@/lib/auth/roles'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { AwardAssignForm, type AwardOption } from '@/components/admin/award-assign-form'

export default async function AdminAwardsPage() {
  const admin = await requireAdmin()
  if (!isFullAdmin(admin.role)) {
    redirect('/admin')
  }

  const { data } = await getSupabaseAdmin()
    .from('awards')
    .select('id, slug, title, award_type, description')
    .neq('slug', 'course-record')
    .order('title', { ascending: true })

  const awards = ((data as AwardOption[] | null) ?? []).filter(
    (a) => a.award_type === 'result' || a.award_type === 'season'
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Assign Award</h1>
        <p className="text-muted-foreground">
          Attach a single award to a single rider. Pick the award first — the form adapts based on
          whether it is result-scoped or season-scoped.
        </p>
      </div>

      <AwardAssignForm awards={awards} />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck (will fail until form exists)**

Run: `npm run typecheck`
Expected: FAIL — `AwardAssignForm` does not exist. This is fine; Task 6 creates it.

Skip the commit until Task 6 is done — no point committing a broken build.

---

## Task 6: Client form component

**Files:**

- Create: `components/admin/award-assign-form.tsx`
- Create: `tests/unit/components/award-assign-form.test.tsx`

Conditional form: pick award → reveal either result-scoped fields (rider search + result picker) or season-scoped fields (rider search + season + note). Calls the server actions.

- [ ] **Step 1: Write the failing component test**

Create `tests/unit/components/award-assign-form.test.tsx`:

```tsx
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AwardAssignForm, type AwardOption } from '@/components/admin/award-assign-form'

const mockAssignResultAward = vi.fn(async () => ({ success: true }))
const mockAssignSeasonAward = vi.fn(async () => ({ success: true }))
const mockSearchRiderResults = vi.fn(async () => [])
const mockSearchRiders = vi.fn(async () => [])

vi.mock('@/lib/actions/awards', () => ({
  assignResultAward: (...args: unknown[]) => mockAssignResultAward(...args),
  assignSeasonAward: (...args: unknown[]) => mockAssignSeasonAward(...args),
  searchRiderResults: (...args: unknown[]) => mockSearchRiderResults(...args),
}))

vi.mock('@/lib/actions/riders', () => ({
  searchRiders: (...args: unknown[]) => mockSearchRiders(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const awards: AwardOption[] = [
  {
    id: 'a-pbp',
    slug: 'paris-brest-paris',
    title: 'Paris-Brest-Paris',
    award_type: 'result',
    description: null,
  },
  {
    id: 'a-sr',
    slug: 'super-randonneur',
    title: 'Super Randonneur',
    award_type: 'season',
    description: null,
  },
]

describe('AwardAssignForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssignResultAward.mockResolvedValue({ success: true })
    mockAssignSeasonAward.mockResolvedValue({ success: true })
  })

  it('shows only the award select before an award is picked', () => {
    render(<AwardAssignForm awards={awards} />)
    expect(screen.getByLabelText(/award/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/rider/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/season/i)).not.toBeInTheDocument()
  })

  it('reveals rider + result picker when a result-scoped award is chosen', async () => {
    const user = userEvent.setup()
    render(<AwardAssignForm awards={awards} />)

    await user.selectOptions(screen.getByLabelText(/award/i), 'a-pbp')

    expect(await screen.findByLabelText(/rider/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/season/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/note/i)).not.toBeInTheDocument()
  })

  it('reveals season + note when a season-scoped award is chosen', async () => {
    const user = userEvent.setup()
    render(<AwardAssignForm awards={awards} />)

    await user.selectOptions(screen.getByLabelText(/award/i), 'a-sr')

    expect(await screen.findByLabelText(/rider/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/season/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/note/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/result/i)).not.toBeInTheDocument()
  })

  it('keeps the award selected and resets other fields after a successful season submit', async () => {
    const user = userEvent.setup()
    mockSearchRiders.mockResolvedValue([
      { id: 'rider-1', first_name: 'Jane', last_name: 'Doe', email: null },
    ])

    render(<AwardAssignForm awards={awards} />)

    await user.selectOptions(screen.getByLabelText(/award/i), 'a-sr')
    await user.type(screen.getByPlaceholderText(/search.*rider/i), 'jane')

    await waitFor(() => expect(mockSearchRiders).toHaveBeenCalled())
    await user.click(await screen.findByText('Jane Doe'))

    const seasonInput = screen.getByLabelText(/season/i) as HTMLInputElement
    await user.clear(seasonInput)
    await user.type(seasonInput, '2024')

    await user.click(screen.getByRole('button', { name: /assign/i }))

    await waitFor(() => expect(mockAssignSeasonAward).toHaveBeenCalled())

    // Award still selected
    expect((screen.getByLabelText(/award/i) as HTMLSelectElement).value).toBe('a-sr')
    // Rider search reset (no chosen rider chip / pre-fill)
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/award-assign-form.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the form**

Create `components/admin/award-assign-form.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  assignResultAward,
  assignSeasonAward,
  searchRiderResults,
  type RiderResultOption,
} from '@/lib/actions/awards'
import { searchRiders, type RiderSearchResult } from '@/lib/actions/riders'

export interface AwardOption {
  id: string
  slug: string
  title: string
  award_type: 'result' | 'season'
  description: string | null
}

interface Props {
  awards: AwardOption[]
}

export function AwardAssignForm({ awards }: Props) {
  const [awardId, setAwardId] = useState('')
  const [riderQuery, setRiderQuery] = useState('')
  const [riderResults, setRiderResults] = useState<RiderSearchResult[]>([])
  const [isSearchingRiders, setIsSearchingRiders] = useState(false)
  const [selectedRider, setSelectedRider] = useState<RiderSearchResult | null>(null)

  const [riderResultOptions, setRiderResultOptions] = useState<RiderResultOption[]>([])
  const [resultId, setResultId] = useState('')

  const [season, setSeason] = useState<number>(new Date().getFullYear())
  const [note, setNote] = useState('')

  const [isPending, startTransition] = useTransition()

  const award = useMemo(() => awards.find((a) => a.id === awardId) ?? null, [awards, awardId])

  // Debounced rider search
  useEffect(() => {
    if (!award) return
    if (selectedRider) return
    if (riderQuery.length < 2) {
      setRiderResults([])
      return
    }
    const t = setTimeout(async () => {
      setIsSearchingRiders(true)
      const found = await searchRiders(riderQuery)
      setRiderResults(found)
      setIsSearchingRiders(false)
    }, 300)
    return () => clearTimeout(t)
  }, [riderQuery, selectedRider, award])

  // When a rider is picked for a result-scoped award, fetch their results.
  useEffect(() => {
    if (!award || award.award_type !== 'result' || !selectedRider) {
      setRiderResultOptions([])
      setResultId('')
      return
    }
    let cancelled = false
    ;(async () => {
      const opts = await searchRiderResults(selectedRider.id)
      if (!cancelled) setRiderResultOptions(opts)
    })()
    return () => {
      cancelled = true
    }
  }, [award, selectedRider])

  function resetExceptAward() {
    setRiderQuery('')
    setRiderResults([])
    setSelectedRider(null)
    setRiderResultOptions([])
    setResultId('')
    setNote('')
    setSeason(new Date().getFullYear())
  }

  function pickRider(r: RiderSearchResult) {
    setSelectedRider(r)
    setRiderQuery(`${r.first_name} ${r.last_name}`)
    setRiderResults([])
  }

  function handleSubmit() {
    if (!award) return

    if (award.award_type === 'result') {
      if (!resultId) {
        toast.error('Pick a result first')
        return
      }
      startTransition(async () => {
        const res = await assignResultAward({ awardId: award.id, resultId })
        if (res.success) {
          toast.success(`Assigned ${award.title}`)
          resetExceptAward()
        } else {
          toast.error(res.error || 'Failed to assign award')
        }
      })
      return
    }

    // season
    if (!selectedRider) {
      toast.error('Pick a rider first')
      return
    }
    startTransition(async () => {
      const res = await assignSeasonAward({
        awardId: award.id,
        riderId: selectedRider.id,
        season,
        note: note.trim() || null,
      })
      if (res.success) {
        toast.success(`Assigned ${award.title}`)
        resetExceptAward()
      } else {
        toast.error(res.error || 'Failed to assign award')
      }
    })
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-2">
        <Label htmlFor="award">Award</Label>
        <select
          id="award"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={awardId}
          onChange={(e) => {
            setAwardId(e.target.value)
            resetExceptAward()
          }}
        >
          <option value="">Select an award…</option>
          {awards.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title} ({a.award_type})
            </option>
          ))}
        </select>
      </div>

      {award && (
        <div className="space-y-2">
          <Label htmlFor="rider">Rider</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="rider"
              className="pl-8"
              placeholder="Search by name or email…"
              value={riderQuery}
              onChange={(e) => {
                setRiderQuery(e.target.value)
                setSelectedRider(null)
              }}
            />
          </div>
          {isSearchingRiders && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}
          {riderResults.length > 0 && (
            <div className="rounded-md border max-h-48 overflow-y-auto">
              {riderResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pickRider(r)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-b-0"
                >
                  <p className="font-medium">
                    {r.first_name} {r.last_name}
                  </p>
                  {r.email && <p className="text-xs text-muted-foreground">{r.email}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {award && award.award_type === 'result' && selectedRider && (
        <div className="space-y-2">
          <Label htmlFor="result">Result</Label>
          <select
            id="result"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={resultId}
            onChange={(e) => setResultId(e.target.value)}
          >
            <option value="">Select a result…</option>
            {riderResultOptions.map((opt) => (
              <option key={opt.resultId} value={opt.resultId}>
                {opt.eventDate} · {opt.eventName} · {opt.distanceKm} km
                {opt.chapterName ? ` · ${opt.chapterName}` : ''} · {opt.status}
              </option>
            ))}
          </select>
          {riderResultOptions.length === 0 && (
            <p className="text-sm text-muted-foreground">This rider has no results yet.</p>
          )}
        </div>
      )}

      {award && award.award_type === 'season' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="season">Season</Label>
            <Input
              id="season"
              type="number"
              min={1980}
              max={new Date().getFullYear() + 1}
              value={season}
              onChange={(e) => setSeason(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Earned at RM 600 in Quebec"
            />
          </div>
        </>
      )}

      {award && (
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Assigning…
            </>
          ) : (
            'Assign'
          )}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run component tests**

Run: `npx vitest run tests/unit/components/award-assign-form.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck (now resolves Task 5's import too)**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit page + form together**

```bash
git add app/admin/awards/page.tsx components/admin/award-assign-form.tsx tests/unit/components/award-assign-form.test.tsx
git commit -m "Add admin awards assignment page"
```

---

## Task 7: Sidebar nav entry

**Files:**

- Modify: `components/admin/sidebar.tsx:30-35,89-125`

Append `Awards` to `managementNavItems`. Already gated by `isFullAdmin` at the group level.

- [ ] **Step 1: Add the icon import**

Edit `components/admin/sidebar.tsx`. Find the `lucide-react` import block (lines 20-35) and add `Award`:

```ts
import {
  LayoutDashboard,
  Users,
  UserCog,
  Calendar,
  Route,
  Trophy,
  LogOut,
  FileText,
  ScrollText,
  Settings,
  Megaphone,
  Navigation,
  BookOpen,
  BarChart3,
  Award,
} from 'lucide-react'
```

- [ ] **Step 2: Append the nav item**

In `managementNavItems` (the array starting around line 89), append (place above `Admin Users` so it sits between Pages/Navigation and the super-admin items):

```ts
  {
    title: 'Awards',
    href: '/admin/awards',
    icon: Award,
    testId: 'nav-awards',
    requiresSuperAdmin: false,
  },
```

The exact final order:

```ts
const managementNavItems = [
  {
    title: 'Pages',
    href: '/admin/pages',
    icon: FileText,
    testId: 'nav-pages',
    requiresSuperAdmin: false,
  },
  {
    title: 'Navigation',
    href: '/admin/navigation',
    icon: Navigation,
    testId: 'nav-navigation',
    requiresSuperAdmin: false,
  },
  {
    title: 'Awards',
    href: '/admin/awards',
    icon: Award,
    testId: 'nav-awards',
    requiresSuperAdmin: false,
  },
  {
    title: 'Admin Users',
    href: '/admin/users',
    icon: UserCog,
    testId: 'nav-users',
    requiresSuperAdmin: true,
  },
  {
    title: 'Audit Log',
    href: '/admin/logs',
    icon: ScrollText,
    testId: 'nav-logs',
    requiresSuperAdmin: false,
  },
  {
    title: 'Guide',
    href: '/admin/guide',
    icon: BookOpen,
    testId: 'nav-guide',
    requiresSuperAdmin: false,
  },
]
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/admin/sidebar.tsx
git commit -m "Add Awards entry to admin sidebar"
```

---

## Task 8: Update awards docs

**Files:**

- Modify: `docs/awards.md` (the "Adding New Awards" section near the bottom)

- [ ] **Step 1: Update "Adding New Awards"**

In `docs/awards.md`, replace the `## Adding New Awards` section with:

```markdown
## Adding New Awards

To add a brand-new award type to the catalogue:

1. Insert the award into the `awards` table with the appropriate `award_type`:
   - `'result'` — earned for a specific event (linked via `result_awards`)
   - `'season'` — earned across a season (linked via `rider_awards`)
2. Add color classes to `colorClassesMap` in `components/award-badge.tsx`
3. Add a default description to `defaultDescriptions` in `components/award-badge.tsx`

To assign an existing award to a rider:

- Use the admin page at **`/admin/awards`** (full admins only). Pick the award; the form
  adapts to the award's scope:
  - **Result-scoped**: pick a rider, then a specific result. The result must already
    exist; if it doesn't, create it from the event admin page first.
  - **Season-scoped**: pick a rider, the season (year), and an optional note.
- The page is assign-only. Mistakes are corrected directly in the database.
```

- [ ] **Step 2: Commit**

```bash
git add docs/awards.md
git commit -m "Document admin awards UI in awards.md"
```

---

## Task 9: Full verification

**Files:** none modified

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS (all suites)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Manual smoke test (skip per CLAUDE.md exception for `app/admin/`)**

Per `CLAUDE.md`, the screenshot/Playwright requirement does not apply inside `app/admin/`. Optional: visit `/admin/awards` while logged in as a full admin and assign a low-stakes award (e.g., a season SR for a test rider) to confirm the green path. Roll back the test row in the DB afterwards.

---

## Self-review notes

- **Spec coverage:** Goal/scope/architecture/data-flow/validation/server-actions/permissions/testing/docs all map to Tasks 1-8. Task 9 covers the verification gates from `CLAUDE.md`.
- **Type consistency:** `AwardOption`, `RiderResultOption`, `AssignResultAwardData`, `AssignSeasonAwardData` are defined once in their respective files and re-exported as needed. `AwardRow`, `ResultLookupRow`, `RiderLookupRow` are local to `lib/actions/awards.ts`.
- **TDD discipline:** Tasks 2, 3, 4, 6 follow red-green-refactor. Tasks 1, 5, 7, 8 are trivial type/config/doc changes with no test gain.
- **No placeholders.** Every code step shows the code; every command shows expected output.

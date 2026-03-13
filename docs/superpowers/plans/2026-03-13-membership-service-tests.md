# Phase 3.2: Membership Service Tests — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-database integration tests for `getMembershipForRider` and `isTrialUsed` in `lib/memberships/service.ts`.

**Architecture:** Tests hit local Supabase for all DB operations; the external CCN API is mocked at the module level. A separate Vitest config isolates these tests from the mock-based test suite.

**Tech Stack:** Vitest, @supabase/supabase-js, @next/env, vi.mock

**Spec:** `docs/superpowers/specs/2026-03-13-membership-service-tests-design.md`

---

## File Map

| File                                                            | Purpose                                               |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| `vitest.config.integration-real.mts`                            | Vitest config for real-DB tests (separate process)    |
| `tests/integration-real/setup.ts`                               | Loads real env vars, mocks next/cache and react cache |
| `tests/integration-real/helpers/supabase.ts`                    | Test helper: `getTestSupabase()` and `checked()`      |
| `tests/integration-real/memberships/membership-service.test.ts` | 13 test cases for the membership service              |
| `vitest.config.mts`                                             | Add `tests/integration-real` to exclude array         |
| `package.json`                                                  | Add `test:integration-real` script                    |
| `docs/test-suite-audit.md`                                      | Mark Phase 3.2 complete                               |

---

## Task 1: Test Infrastructure

**Files:**

- Create: `vitest.config.integration-real.mts`
- Create: `tests/integration-real/setup.ts`
- Create: `tests/integration-real/helpers/supabase.ts`
- Modify: `vitest.config.mts` (add exclude)
- Modify: `package.json` (add script)

- [ ] **Step 1: Create the Vitest config**

```typescript
// vitest.config.integration-real.mts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['tests/integration-real/**/*.test.ts'],
    exclude: ['node_modules'],
    environment: 'node',
    setupFiles: ['./tests/integration-real/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

- [ ] **Step 2: Create the setup file**

```typescript
// tests/integration-real/setup.ts
import { vi } from 'vitest'
import { loadEnvConfig } from '@next/env'

// Load real env vars from .env.development.local
loadEnvConfig(process.cwd(), true /* development */)

// Mock Next.js cache module (pass-through, no caching in tests)
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn) => fn),
}))

// Mock React cache (pass-through, no deduplication in tests)
vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return {
    ...actual,
    cache: (fn: unknown) => fn,
  }
})
```

- [ ] **Step 3: Create the test helper**

```typescript
// tests/integration-real/helpers/supabase.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * Get a Supabase admin client for test data setup/teardown.
 * Uses real env vars loaded by the setup file.
 */
export function getTestSupabase(): SupabaseClient {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('[integration-real] Missing SUPABASE env vars. Is local Supabase running?')
  }

  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return client
}

/** Run a Supabase query and throw if it returns an error. */
export async function checked<T>(
  operation: PromiseLike<{ data: T; error: { message: string } | null }>,
  label: string
): Promise<T> {
  const { data, error } = await operation
  if (error) {
    throw new Error(`[integration-real] ${label}: ${error.message}`)
  }
  return data
}
```

- [ ] **Step 4: Add `tests/integration-real` to main config exclude**

In `vitest.config.mts`, add `'tests/integration-real'` to the `exclude` array:

```typescript
exclude: ['node_modules', 'tests/e2e', 'tests/integration-real'],
```

- [ ] **Step 5: Add npm script**

In `package.json`, add to `scripts`:

```json
"test:integration-real": "vitest run --config vitest.config.integration-real.mts"
```

- [ ] **Step 6: Verify infrastructure works**

Create a minimal smoke test to confirm the config, setup, and DB connection work:

```typescript
// tests/integration-real/memberships/membership-service.test.ts
import { describe, it, expect } from 'vitest'
import { getTestSupabase } from '../helpers/supabase'

describe('integration-real infrastructure', () => {
  it('can connect to local Supabase', async () => {
    const supabase = getTestSupabase()
    const { data, error } = await supabase.from('riders').select('id').limit(1)
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
})
```

Run: `npm run test:integration-real`
Expected: 1 test passes.

- [ ] **Step 7: Commit**

```
git add vitest.config.integration-real.mts tests/integration-real/ vitest.config.mts package.json
git commit -m "Add integration-real test infrastructure for real-DB tests"
```

---

## Task 2: Test Data Seeding and Teardown

**Files:**

- Modify: `tests/integration-real/memberships/membership-service.test.ts`

Replace the smoke test with the full test scaffold including seed data and teardown.

- [ ] **Step 1: Write the seed/teardown scaffold**

Replace the contents of `tests/integration-real/memberships/membership-service.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'

vi.mock('@/lib/ccn/client')

const TORONTO_CHAPTER_ID = 'ad83d0b9-4d25-472b-9d3e-5732730d761c'

const IDS = {
  rider: '00000000-1a10-4000-a000-000000000001',
  route: '00000000-1a10-4000-a000-000000000002',
  completedEvent: '00000000-1a10-4000-a000-000000000003',
  scheduledEvent: '00000000-1a10-4000-a000-000000000004',
  finishedResult: '00000000-1a10-4000-a000-000000000005',
  dnsResult: '00000000-1a10-4000-a000-000000000006',
  registration: '00000000-1a10-4000-a000-000000000007',
  membership: '00000000-1a10-4000-a000-000000000008',
  pendingResult: '00000000-1a10-4000-a000-000000000009',
  dnfResult: '00000000-1a10-4000-a000-00000000000a',
  pastRegistration: '00000000-1a10-4000-a000-00000000000b',
}

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

describe('membership service (real DB)', () => {
  const supabase = getTestSupabase()
  const pastDate = daysFromNow(-7)
  const futureDate = daysFromNow(30)

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CURRENT_SEASON = '2026'

    // Clean up any leftover test data (in case a previous run crashed)
    const eventIds = [IDS.completedEvent, IDS.scheduledEvent]
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    await supabase.from('results').delete().in('event_id', eventIds)
    await supabase.from('registrations').delete().in('event_id', eventIds)
    await supabase.from('events').delete().in('id', eventIds)
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().eq('id', IDS.rider)

    // Seed in dependency order
    await checked(
      supabase.from('riders').insert({
        id: IDS.rider,
        slug: 'inttest-rider',
        first_name: 'IntTest',
        last_name: 'Rider',
      }),
      'insert rider'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-route',
        name: 'IntTest Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'insert route'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.completedEvent,
        slug: `inttest-completed-200km-${pastDate}`,
        name: 'IntTest Completed',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: pastDate,
        status: 'completed',
      }),
      'insert completed event'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.scheduledEvent,
        slug: `inttest-scheduled-200km-${futureDate}`,
        name: 'IntTest Scheduled',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: futureDate,
        status: 'scheduled',
      }),
      'insert scheduled event'
    )
  })

  afterAll(async () => {
    const eventIds = [IDS.completedEvent, IDS.scheduledEvent]
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    await supabase.from('results').delete().in('event_id', eventIds)
    await supabase.from('registrations').delete().in('event_id', eventIds)
    await supabase.from('events').delete().in('id', eventIds)
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().eq('id', IDS.rider)
  })

  it('placeholder — seed data exists', async () => {
    const { data } = await supabase.from('riders').select('first_name').eq('id', IDS.rider).single()
    expect(data?.first_name).toBe('IntTest')
  })
})
```

- [ ] **Step 2: Run to verify seeding works**

Run: `npm run test:integration-real`
Expected: 1 test passes, seed data created and cleaned up.

- [ ] **Step 3: Commit**

```
git add tests/integration-real/memberships/membership-service.test.ts
git commit -m "Add test data seeding for membership service integration tests"
```

---

## Task 3: getMembershipForRider Tests

**Files:**

- Modify: `tests/integration-real/memberships/membership-service.test.ts`

- [ ] **Step 1: Add the getMembershipForRider describe block with all 6 tests**

Remove the placeholder test. Add this inside the outer `describe`:

```typescript
describe('getMembershipForRider', () => {
  let searchCCNMembership: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    const mod = await import('@/lib/ccn/client')
    searchCCNMembership = vi.mocked(mod.searchCCNMembership)
  })

  afterEach(async () => {
    // Clean up any memberships created during tests
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    vi.resetAllMocks()
  })

  it('returns cached membership from DB', async () => {
    // Seed a membership row
    await checked(
      supabase.from('memberships').insert({
        id: IDS.membership,
        rider_id: IDS.rider,
        season: 2026,
        membership_id: 42,
        type: 'Individual Membership',
      }),
      'insert membership'
    )

    const { getMembershipForRider } = await import('@/lib/memberships/service')
    const result = await getMembershipForRider(IDS.rider, 'IntTest', 'Rider')

    expect(result).toEqual({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
    })
    expect(searchCCNMembership).not.toHaveBeenCalled()
  })

  it('fetches from CCN when not cached, caches in DB', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 99,
      type: 'Individual Membership',
    })

    const { getMembershipForRider } = await import('@/lib/memberships/service')
    const result = await getMembershipForRider(IDS.rider, 'IntTest', 'Rider')

    expect(result).toEqual({
      found: true,
      membershipId: 99,
      type: 'Individual Membership',
    })
    expect(searchCCNMembership).toHaveBeenCalledWith('IntTest', 'Rider')

    // Verify the membership was cached in DB
    const { data } = await supabase
      .from('memberships')
      .select('membership_id, type, season')
      .eq('rider_id', IDS.rider)
      .eq('season', 2026)
      .single()

    expect(data).toMatchObject({
      membership_id: 99,
      type: 'Individual Membership',
      season: 2026,
    })
  })

  it('second call uses DB cache, not CCN', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 99,
      type: 'Individual Membership',
    })

    const { getMembershipForRider } = await import('@/lib/memberships/service')

    // First call — hits CCN, caches in DB
    const result1 = await getMembershipForRider(IDS.rider, 'IntTest', 'Rider')
    expect(result1.found).toBe(true)
    expect(searchCCNMembership).toHaveBeenCalledTimes(1)

    // Second call — should use DB cache
    const result2 = await getMembershipForRider(IDS.rider, 'IntTest', 'Rider')
    expect(result2).toEqual(result1)
    expect(searchCCNMembership).toHaveBeenCalledTimes(1) // still 1
  })

  it('returns found:false when CCN has no match', async () => {
    searchCCNMembership.mockResolvedValue({ found: false })

    const { getMembershipForRider } = await import('@/lib/memberships/service')
    const result = await getMembershipForRider(IDS.rider, 'IntTest', 'Rider')

    expect(result).toEqual({ found: false })

    // Verify nothing was cached
    const { data } = await supabase
      .from('memberships')
      .select('id')
      .eq('rider_id', IDS.rider)
      .eq('season', 2026)

    expect(data).toEqual([])
  })

  it('propagates CCN API error', async () => {
    searchCCNMembership.mockRejectedValue(new Error('CCN API error: 500'))

    const { getMembershipForRider } = await import('@/lib/memberships/service')

    await expect(getMembershipForRider(IDS.rider, 'IntTest', 'Rider')).rejects.toThrow(
      'CCN API error'
    )

    // Verify nothing was cached
    const { data } = await supabase
      .from('memberships')
      .select('id')
      .eq('rider_id', IDS.rider)
      .eq('season', 2026)

    expect(data).toEqual([])
  })

  it('throws when CCN_ENDPOINT not set', async () => {
    searchCCNMembership.mockRejectedValue(new Error('CCN_ENDPOINT environment variable not set'))

    const { getMembershipForRider } = await import('@/lib/memberships/service')

    await expect(getMembershipForRider(IDS.rider, 'IntTest', 'Rider')).rejects.toThrow(
      'CCN_ENDPOINT'
    )
  })
})
```

Note: The `searchCCNMembership` mock is set up in `beforeAll` via dynamic import because `describe` callbacks cannot be async.

- [ ] **Step 2: Run the getMembershipForRider tests**

Run: `npm run test:integration-real`
Expected: 6 tests pass (all getMembershipForRider tests).

If any test fails due to module import/mock issues, adjust the import strategy (e.g., move `vi.mocked` into individual tests, or use `beforeEach` for dynamic imports).

- [ ] **Step 3: Commit**

```
git add tests/integration-real/memberships/membership-service.test.ts
git commit -m "Add getMembershipForRider integration tests (6 tests, real DB)"
```

---

## Task 4: isTrialUsed Tests

**Files:**

- Modify: `tests/integration-real/memberships/membership-service.test.ts`

- [ ] **Step 1: Add the isTrialUsed describe block with all 7 tests**

Add this inside the outer `describe`, after the `getMembershipForRider` block:

```typescript
describe('isTrialUsed', () => {
  afterEach(async () => {
    // Clean up results and registrations created during tests
    const eventIds = [IDS.completedEvent, IDS.scheduledEvent]
    await supabase.from('results').delete().in('event_id', eventIds)
    await supabase.from('registrations').delete().in('event_id', eventIds)
  })

  it('returns true when rider has finished result', async () => {
    await checked(
      supabase.from('results').insert({
        id: IDS.finishedResult,
        rider_id: IDS.rider,
        event_id: IDS.completedEvent,
        status: 'finished',
        season: 2026,
        distance_km: 200,
      }),
      'insert finished result'
    )

    const { isTrialUsed } = await import('@/lib/memberships/service')
    const result = await isTrialUsed(IDS.rider)
    expect(result).toBe(true)
  })

  it('returns true when rider has DNF result', async () => {
    await checked(
      supabase.from('results').insert({
        id: IDS.dnfResult,
        rider_id: IDS.rider,
        event_id: IDS.completedEvent,
        status: 'dnf',
        season: 2026,
        distance_km: 200,
      }),
      'insert dnf result'
    )

    const { isTrialUsed } = await import('@/lib/memberships/service')
    const result = await isTrialUsed(IDS.rider)
    expect(result).toBe(true)
  })

  it('returns true when rider has upcoming registration', async () => {
    await checked(
      supabase.from('registrations').insert({
        id: IDS.registration,
        rider_id: IDS.rider,
        event_id: IDS.scheduledEvent,
        status: 'registered',
      }),
      'insert registration'
    )

    const { isTrialUsed } = await import('@/lib/memberships/service')
    const result = await isTrialUsed(IDS.rider)
    expect(result).toBe(true)
  })

  it('returns false when rider has no results or registrations', async () => {
    const { isTrialUsed } = await import('@/lib/memberships/service')
    const result = await isTrialUsed(IDS.rider)
    expect(result).toBe(false)
  })

  it('returns false when rider has only DNS result', async () => {
    await checked(
      supabase.from('results').insert({
        id: IDS.dnsResult,
        rider_id: IDS.rider,
        event_id: IDS.completedEvent,
        status: 'dns',
        season: 2026,
        distance_km: 200,
      }),
      'insert dns result'
    )

    const { isTrialUsed } = await import('@/lib/memberships/service')
    const result = await isTrialUsed(IDS.rider)
    expect(result).toBe(false)
  })

  it('returns false when rider has only pending result', async () => {
    await checked(
      supabase.from('results').insert({
        id: IDS.pendingResult,
        rider_id: IDS.rider,
        event_id: IDS.completedEvent,
        status: 'pending',
        season: 2026,
        distance_km: 200,
      }),
      'insert pending result'
    )

    const { isTrialUsed } = await import('@/lib/memberships/service')
    const result = await isTrialUsed(IDS.rider)
    expect(result).toBe(false)
  })

  it('returns false when rider has registration for past event only', async () => {
    await checked(
      supabase.from('registrations').insert({
        id: IDS.pastRegistration,
        rider_id: IDS.rider,
        event_id: IDS.completedEvent, // past date
        status: 'registered',
      }),
      'insert past registration'
    )

    const { isTrialUsed } = await import('@/lib/memberships/service')
    const result = await isTrialUsed(IDS.rider)
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `npm run test:integration-real`
Expected: 13 tests pass (6 getMembershipForRider + 7 isTrialUsed).

- [ ] **Step 3: Commit**

```
git add tests/integration-real/memberships/membership-service.test.ts
git commit -m "Add isTrialUsed integration tests (7 tests, real DB)"
```

---

## Task 5: Update Docs and Final Verification

**Files:**

- Modify: `docs/test-suite-audit.md`

- [ ] **Step 1: Verify all existing tests still pass**

Run: `npm run test:run`
Expected: All existing unit/integration tests pass (the new tests are excluded from the main config).

- [ ] **Step 2: Run integration-real tests one more time**

Run: `npm run test:integration-real`
Expected: 13 tests pass.

- [ ] **Step 3: Update test-suite-audit.md**

In the Priority Order table, mark Phase 3.2 as completed:

```
| 4 | 3.2 | Yes | Membership service tests | Critical business gate with zero coverage |
```

- [ ] **Step 4: Commit**

```
git add docs/test-suite-audit.md
git commit -m "Mark Phase 3.2 (membership service tests) as complete in audit doc"
```

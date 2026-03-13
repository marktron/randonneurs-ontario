# Registration Flow Integration Tests — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~38 real-database integration tests for the three registration server actions (`registerForEvent`, `registerForPermanent`, `completeRegistrationWithRider`).

**Architecture:** Three test files under `tests/integration-real/registration/`, one per entry point, plus a shared helpers file. Each file seeds its own data with isolated deterministic UUIDs, mocks SendGrid/CCN/rider-search, and runs against local Supabase. Follows the established pattern from `tests/integration-real/memberships/`.

**Tech Stack:** Vitest, `@supabase/supabase-js`, existing `integration-real` infrastructure (setup.ts, helpers/supabase.ts)

**Spec:** `docs/superpowers/specs/2026-03-13-registration-flow-tests-design.md`

---

## File Structure

| File                                                                 | Action | Responsibility                                                                                                                |
| -------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration-real/registration/helpers.ts`                     | CREATE | Data builders for `RegistrationData`, `PermanentRegistrationData`, `CompleteRegistrationData`; email payload assertion helper |
| `tests/integration-real/registration/register-for-event.test.ts`     | CREATE | ~15 tests for `registerForEvent`                                                                                              |
| `tests/integration-real/registration/register-for-permanent.test.ts` | CREATE | ~12 tests for `registerForPermanent`                                                                                          |
| `tests/integration-real/registration/complete-registration.test.ts`  | CREATE | ~11 tests for `completeRegistrationWithRider`                                                                                 |
| `docs/test-suite-audit.md`                                           | MODIFY | Mark Phase 3.1 complete                                                                                                       |

No existing files are modified (except the audit doc). No new dependencies.

---

## Chunk 1: Shared Helpers + registerForEvent Tests

### Task 1: Create shared helpers

**Files:**

- Create: `tests/integration-real/registration/helpers.ts`

- [ ] **Step 1: Create the helpers file**

```typescript
import { expect } from 'vitest'
import type { RegistrationData } from '@/lib/actions/register'
import type { PermanentRegistrationData } from '@/lib/actions/register'
import type { CompleteRegistrationData } from '@/lib/actions/register'

export const TORONTO_CHAPTER_ID = 'ad83d0b9-4d25-472b-9d3e-5732730d761c'

export function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function buildRegistrationData(
  overrides: Partial<RegistrationData> & { eventId: string }
): RegistrationData {
  return {
    firstName: 'Test',
    lastName: 'Rider',
    email: 'test-rider@example.com',
    gender: 'X',
    shareRegistration: false,
    emergencyContactName: 'Emergency Contact',
    emergencyContactPhone: '555-0100',
    ...overrides,
  }
}

export function buildPermanentRegistrationData(
  overrides: Partial<PermanentRegistrationData> & { routeId: string }
): PermanentRegistrationData {
  return {
    eventDate: daysFromNow(30),
    startTime: '08:00',
    direction: 'as_posted',
    firstName: 'Test',
    lastName: 'Rider',
    email: 'test-rider@example.com',
    gender: 'X',
    shareRegistration: false,
    emergencyContactName: 'Emergency Contact',
    emergencyContactPhone: '555-0100',
    ...overrides,
  }
}

export function buildCompleteRegistrationData(
  overrides: Partial<CompleteRegistrationData> & { eventId: string }
): CompleteRegistrationData {
  return {
    selectedRiderId: null,
    firstName: 'Test',
    lastName: 'Rider',
    email: 'test-rider@example.com',
    gender: 'X',
    shareRegistration: false,
    emergencyContactName: 'Emergency Contact',
    emergencyContactPhone: '555-0100',
    ...overrides,
  }
}

/**
 * Assert that sendRegistrationConfirmationEmail was called with expected fields.
 * Pass the vi.mocked sendEmail function and an object of fields to check.
 */
export function assertEmailPayload(
  sendEmail: { mock: { calls: unknown[][] } },
  expected: Record<string, unknown>
) {
  expect(sendEmail.mock.calls.length).toBeGreaterThan(0)
  const payload = sendEmail.mock.calls[0][0] as Record<string, unknown>
  for (const [key, value] of Object.entries(expected)) {
    expect(payload[key]).toEqual(value)
  }
}

/**
 * Assert that the email management URL matches the expected pattern.
 */
export function assertManagementUrl(sendEmail: { mock: { calls: unknown[][] } }) {
  expect(sendEmail.mock.calls.length).toBeGreaterThan(0)
  const payload = sendEmail.mock.calls[0][0] as Record<string, unknown>
  expect(payload.managementUrl).toBeDefined()
  // Management URL should contain a UUID-like token
  expect(payload.managementUrl).toMatch(/\/registration\/manage\/[a-f0-9-]+/)
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit tests/integration-real/registration/helpers.ts 2>&1 | head -20`

If there are import path issues (the types are exported from the `'use server'` module), adjust the imports. The types `RegistrationData`, `PermanentRegistrationData`, and `CompleteRegistrationData` are all exported interfaces from `lib/actions/register.ts`, so direct import should work in Vitest (the `'use server'` directive is ignored).

- [ ] **Step 3: Commit**

```bash
git add tests/integration-real/registration/helpers.ts
git commit -m "test: add shared helpers for registration integration tests"
```

---

### Task 2: registerForEvent — happy path and membership flows

**Files:**

- Create: `tests/integration-real/registration/register-for-event.test.ts`

**Context for implementer:**

- `registerForEvent` is defined at `lib/actions/register.ts:328`
- It takes `RegistrationData` (typed object, NOT FormData)
- Returns `RegistrationResult` with `success`, optional `error`, `needsRiderMatch`, `matchCandidates`, `pendingData`, `membershipError`
- The function is in a `'use server'` module — in Vitest this directive is ignored
- Email is fire-and-forget (`.catch()` only, no `await`) — mock resolves synchronously so it's called before assertions
- `findOrCreateRider` calls `searchRiderCandidates` internally — must be mocked to avoid unpredictable fuzzy matches
- Membership flow: `getMembershipForRider` is called after rider creation. If `found: false` → creates `'incomplete: membership'` registration + sends email with `membershipStatus: 'none'`. If trial member with used trial → same but `membershipStatus: 'trial-used'`.
- `createRegistrationRecord` uses upsert on `(event_id, rider_id)` — so an incomplete registration gets overwritten if re-registered

- [ ] **Step 1: Write the test file skeleton with seed data and first 4 tests**

```typescript
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import {
  TORONTO_CHAPTER_ID,
  daysFromNow,
  buildRegistrationData,
  assertEmailPayload,
  assertManagementUrl,
} from './helpers'

vi.mock('@/lib/email/send-registration-email')
vi.mock('@/lib/ccn/client')
vi.mock('@/lib/actions/rider-match')

const IDS = {
  rider: '00000000-1a20-4000-a000-000000000001',
  route: '00000000-1a20-4000-a000-000000000002',
  scheduledEvent: '00000000-1a20-4000-a000-000000000003',
  completedEvent: '00000000-1a20-4000-a000-000000000004',
  membership: '00000000-1a20-4000-a000-000000000005',
}

describe('registerForEvent (real DB)', () => {
  const supabase = getTestSupabase()
  const futureDate = daysFromNow(30)
  const pastDate = daysFromNow(-7)

  let sendEmail: ReturnType<typeof vi.fn>
  let searchCCNMembership: ReturnType<typeof vi.fn>
  let searchRiderCandidates: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CURRENT_SEASON = '2026'

    // Set up mocks
    const emailMod = await import('@/lib/email/send-registration-email')
    sendEmail = vi.mocked(emailMod.sendRegistrationConfirmationEmail)

    const ccnMod = await import('@/lib/ccn/client')
    searchCCNMembership = vi.mocked(ccnMod.searchCCNMembership)

    const matchMod = await import('@/lib/actions/rider-match')
    searchRiderCandidates = vi.mocked(matchMod.searchRiderCandidates)
    searchRiderCandidates.mockResolvedValue({ candidates: [] })

    // Clean up leftover test data
    await supabase.from('rider_merges').delete().eq('rider_id', IDS.rider)
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    await supabase
      .from('registrations')
      .delete()
      .in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('events').delete().in('id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().eq('id', IDS.rider)

    // Seed
    await checked(
      supabase.from('riders').insert({
        id: IDS.rider,
        slug: 'inttest-reg-rider',
        first_name: 'Test',
        last_name: 'Rider',
        email: 'test-rider@example.com',
      }),
      'insert rider'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-reg-route',
        name: 'IntTest Reg Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'insert route'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.scheduledEvent,
        slug: `inttest-reg-brevet-200km-${futureDate}`,
        name: 'IntTest Reg Brevet',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: futureDate,
        start_time: '08:00',
        start_location: 'Test Start',
        status: 'scheduled',
      }),
      'insert scheduled event'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.completedEvent,
        slug: `inttest-reg-completed-200km-${pastDate}`,
        name: 'IntTest Completed Event',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: pastDate,
        status: 'completed',
      }),
      'insert completed event'
    )
  })

  afterEach(async () => {
    // Clean up per-test data
    await supabase.from('rider_merges').delete().eq('rider_id', IDS.rider)
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    await supabase
      .from('registrations')
      .delete()
      .in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    // Delete riders created during tests (but not the seeded rider)
    await supabase.from('riders').delete().eq('email', 'new-rider@example.com')
    await supabase.from('riders').delete().eq('email', 'other@example.com')
    vi.resetAllMocks()
    // Re-establish default mock for searchRiderCandidates after reset
    searchRiderCandidates.mockResolvedValue({ candidates: [] })
  })

  afterAll(async () => {
    await supabase.from('rider_merges').delete().eq('rider_id', IDS.rider)
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    await supabase
      .from('registrations')
      .delete()
      .in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('events').delete().in('id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().eq('id', IDS.rider)
    await supabase.from('riders').delete().eq('email', 'new-rider@example.com')
    await supabase.from('riders').delete().eq('email', 'other@example.com')
  })

  it('registers with valid membership — success, email with membershipStatus valid', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
    })

    const { registerForEvent } = await import('@/lib/actions/register')
    const result = await registerForEvent(buildRegistrationData({ eventId: IDS.scheduledEvent }))

    expect(result.success).toBe(true)

    // Verify registration in DB
    const { data: reg } = await supabase
      .from('registrations')
      .select('status, rider_id')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('registered')

    // Verify email
    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, {
      membershipStatus: 'valid',
      registrantName: 'Test Rider',
      eventName: 'IntTest Reg Brevet',
      eventDistance: 200,
    })
    assertManagementUrl(sendEmail)
  })

  it('CCN returns not-found — incomplete membership, email with none', async () => {
    searchCCNMembership.mockResolvedValue({ found: false })

    const { registerForEvent } = await import('@/lib/actions/register')
    const result = await registerForEvent(buildRegistrationData({ eventId: IDS.scheduledEvent }))

    expect(result.success).toBe(false)
    expect(result.membershipError).toBe('no-membership')

    // Verify incomplete registration in DB
    const { data: reg } = await supabase
      .from('registrations')
      .select('status')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('incomplete: membership')

    // Email still sent
    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, { membershipStatus: 'none' })
  })

  it('trial member with trial used — incomplete membership, email with trial-used', async () => {
    // Set up: rider has a Trial Member membership
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 99,
      type: 'Trial Member',
    })
    // And a prior finished result (trial used)
    await checked(
      supabase.from('results').insert({
        id: '00000000-1a20-4000-a000-000000000010',
        rider_id: IDS.rider,
        event_id: IDS.completedEvent,
        status: 'finished',
        season: 2026,
        distance_km: 200,
      }),
      'insert finished result for trial'
    )

    const { registerForEvent } = await import('@/lib/actions/register')
    const result = await registerForEvent(buildRegistrationData({ eventId: IDS.scheduledEvent }))

    expect(result.success).toBe(false)
    expect(result.membershipError).toBe('trial-used')

    const { data: reg } = await supabase
      .from('registrations')
      .select('status')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('incomplete: membership')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, { membershipStatus: 'trial-used' })

    // Clean up the result
    await supabase.from('results').delete().eq('id', '00000000-1a20-4000-a000-000000000010')
  })

  it('CCN API throws — returns Registration failed, no registration created', async () => {
    searchCCNMembership.mockRejectedValue(new Error('CCN API error: 500'))

    const { registerForEvent } = await import('@/lib/actions/register')
    const result = await registerForEvent(buildRegistrationData({ eventId: IDS.scheduledEvent }))

    expect(result.success).toBe(false)
    expect(result.error).toBe('Registration failed')

    // No registration should exist
    const { data: regs } = await supabase
      .from('registrations')
      .select('id')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
    expect(regs).toEqual([])

    // No email sent
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the 4 tests**

Run: `npx vitest run --config vitest.config.integration-real.mts tests/integration-real/registration/register-for-event.test.ts`
Expected: 4 tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/integration-real/registration/register-for-event.test.ts
git commit -m "test: add registerForEvent happy path and membership flow tests"
```

---

### Task 3: registerForEvent — validation, rider, and edge case tests

**Files:**

- Modify: `tests/integration-real/registration/register-for-event.test.ts`

**Context for implementer:**

- Add these tests inside the existing `describe('registerForEvent (real DB)')` block, after the 4 existing tests
- Rider match flow: when `searchRiderCandidates` returns candidates, `findOrCreateRider` returns `{ success: false, needsRiderMatch: true, matchCandidates: [...] }`
- Duplicate check: `checkDuplicateRegistration` looks for `status: 'registered'` only — an `'incomplete: membership'` registration does NOT count as duplicate
- Team name duplicate: checked when `trimmedTeamName && isTeamCaptain` — case-insensitive match
- Email match rider: `findOrCreateRider` finds by email, creates `rider_merges` audit entry, updates gender/emergency contact (NOT name)
- New rider: when no email match and no fuzzy match, creates rider with slug from `createRiderSlug(email)`

- [ ] **Step 1: Add validation and edge case tests**

Append these tests inside the existing describe block:

```typescript
it('returns needsRiderMatch when searchRiderCandidates finds candidates', async () => {
  searchRiderCandidates.mockResolvedValue({
    candidates: [
      {
        id: '00000000-1a20-4000-a000-000000000020',
        first_name: 'Test',
        last_name: 'Rider',
        city: 'Toronto',
      },
    ],
  })

  const { registerForEvent } = await import('@/lib/actions/register')
  const result = await registerForEvent(
    buildRegistrationData({
      eventId: IDS.scheduledEvent,
      email: 'unknown@example.com', // no email match → triggers fuzzy search
    })
  )

  expect(result.success).toBe(false)
  expect(result.needsRiderMatch).toBe(true)
  expect(result.matchCandidates).toHaveLength(1)

  // No registration created
  const { data: regs } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', IDS.scheduledEvent)
  expect(regs).toEqual([])
})

it('duplicate registration returns error', async () => {
  searchCCNMembership.mockResolvedValue({
    found: true,
    membershipId: 42,
    type: 'Individual Membership',
  })

  const { registerForEvent } = await import('@/lib/actions/register')

  // First registration succeeds
  const result1 = await registerForEvent(buildRegistrationData({ eventId: IDS.scheduledEvent }))
  expect(result1.success).toBe(true)

  // Second registration returns duplicate error
  const result2 = await registerForEvent(buildRegistrationData({ eventId: IDS.scheduledEvent }))
  expect(result2.success).toBe(false)
  expect(result2.error).toContain('already registered')
})

it('event not found returns error', async () => {
  const { registerForEvent } = await import('@/lib/actions/register')
  const result = await registerForEvent(
    buildRegistrationData({ eventId: '00000000-0000-0000-0000-000000000000' })
  )

  expect(result.success).toBe(false)
  expect(result.error).toBeTruthy()
})

it('completed event returns error', async () => {
  const { registerForEvent } = await import('@/lib/actions/register')
  const result = await registerForEvent(buildRegistrationData({ eventId: IDS.completedEvent }))

  expect(result.success).toBe(false)
  expect(result.error).toBe('Registration is not open for this event')
})

it('missing required fields returns error', async () => {
  const { registerForEvent } = await import('@/lib/actions/register')
  const result = await registerForEvent(
    buildRegistrationData({ eventId: IDS.scheduledEvent, firstName: '' })
  )

  expect(result.success).toBe(false)
  expect(result.error).toBe('Missing required fields')
})

it('duplicate team name as captain returns error', async () => {
  searchCCNMembership.mockResolvedValue({
    found: true,
    membershipId: 42,
    type: 'Individual Membership',
  })

  const { registerForEvent } = await import('@/lib/actions/register')

  // First captain registration
  await registerForEvent(
    buildRegistrationData({
      eventId: IDS.scheduledEvent,
      teamName: 'Speed Demons',
      isTeamCaptain: true,
    })
  )

  // Second captain with same team name (case-insensitive)
  const result = await registerForEvent(
    buildRegistrationData({
      eventId: IDS.scheduledEvent,
      email: 'other@example.com',
      firstName: 'Other',
      teamName: 'speed demons',
      isTeamCaptain: true,
    })
  )

  expect(result.success).toBe(false)
  expect(result.error).toContain('Speed Demons')
  expect(result.error).toContain('already exists')
})

it('new rider created when no email match and no fuzzy match', async () => {
  searchCCNMembership.mockResolvedValue({
    found: true,
    membershipId: 42,
    type: 'Individual Membership',
  })

  const { registerForEvent } = await import('@/lib/actions/register')
  const result = await registerForEvent(
    buildRegistrationData({
      eventId: IDS.scheduledEvent,
      email: 'new-rider@example.com',
      firstName: 'New',
      lastName: 'Person',
    })
  )

  expect(result.success).toBe(true)

  // Verify new rider exists in DB
  const { data: rider } = await supabase
    .from('riders')
    .select('first_name, last_name, email, slug')
    .eq('email', 'new-rider@example.com')
    .single()

  expect(rider).toBeTruthy()
  expect(rider!.first_name).toBe('New')
  expect(rider!.last_name).toBe('Person')
  expect(rider!.slug).toMatch(/^new-rider-[a-z0-9]+$/)
})

it('existing rider found by email — reuses rider, creates audit entry', async () => {
  searchCCNMembership.mockResolvedValue({
    found: true,
    membershipId: 42,
    type: 'Individual Membership',
  })

  const { registerForEvent } = await import('@/lib/actions/register')
  const result = await registerForEvent(
    buildRegistrationData({
      eventId: IDS.scheduledEvent,
      // Same email as seeded rider but different name
      email: 'test-rider@example.com',
      firstName: 'Different',
      lastName: 'Name',
    })
  )

  expect(result.success).toBe(true)

  // Verify rider_merges audit entry was created
  const { data: merges } = await supabase
    .from('rider_merges')
    .select('submitted_first_name, submitted_last_name, previous_first_name, previous_last_name')
    .eq('rider_id', IDS.rider)

  expect(merges).toHaveLength(1)
  expect(merges![0]).toMatchObject({
    submitted_first_name: 'Different',
    submitted_last_name: 'Name',
    previous_first_name: 'Test',
    previous_last_name: 'Rider',
  })

  // Registration should be linked to the existing rider
  const { data: reg } = await supabase
    .from('registrations')
    .select('rider_id')
    .eq('event_id', IDS.scheduledEvent)
    .single()
  expect(reg?.rider_id).toBe(IDS.rider)
})
```

- [ ] **Step 2: Run all registerForEvent tests**

Run: `npx vitest run --config vitest.config.integration-real.mts tests/integration-real/registration/register-for-event.test.ts`
Expected: 12 tests pass (4 existing + 8 new)

- [ ] **Step 3: Commit**

```bash
git add tests/integration-real/registration/register-for-event.test.ts
git commit -m "test: add registerForEvent validation, rider, and edge case tests"
```

---

## Chunk 2: registerForPermanent Tests

### Task 4: registerForPermanent — all tests

**Files:**

- Create: `tests/integration-real/registration/register-for-permanent.test.ts`

**Context for implementer:**

- `registerForPermanent` is defined at `lib/actions/register.ts:589`
- Takes `PermanentRegistrationData` with `routeId`, `eventDate`, `startTime`, `direction`, plus rider fields
- Creates an event dynamically for route+date if one doesn't exist. Slug is `permanent-{route.slug}-{eventDate}` — direction is NOT part of the slug
- Event name is `route.name` or `route.name (Reversed)` based on direction
- If an event with that slug already exists, it reuses it
- Date validation: must be >= 14 days in the future (`eventDateObj < twoWeeksFromNow` where `twoWeeksFromNow` is today+14 at midnight)
- Route lookup uses `.eq('is_active', true)` — inactive or missing returns `'Record not found'` via PGRST116 error handler
- Duplicate check returns `'You are already registered for this permanent ride'`
- Same membership flow as `registerForEvent`
- Same `findOrCreateRider` flow with `searchRiderCandidates`
- Has outer try/catch that returns `'Registration failed'` on unhandled errors

- [ ] **Step 1: Write the complete test file**

```typescript
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import {
  TORONTO_CHAPTER_ID,
  daysFromNow,
  buildPermanentRegistrationData,
  assertEmailPayload,
  assertManagementUrl,
} from './helpers'

vi.mock('@/lib/email/send-registration-email')
vi.mock('@/lib/ccn/client')
vi.mock('@/lib/actions/rider-match')

const IDS = {
  rider: '00000000-1a21-4000-a000-000000000001',
  route: '00000000-1a21-4000-a000-000000000002',
  inactiveRoute: '00000000-1a21-4000-a000-000000000003',
}

describe('registerForPermanent (real DB)', () => {
  const supabase = getTestSupabase()

  let sendEmail: ReturnType<typeof vi.fn>
  let searchCCNMembership: ReturnType<typeof vi.fn>
  let searchRiderCandidates: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CURRENT_SEASON = '2026'

    const emailMod = await import('@/lib/email/send-registration-email')
    sendEmail = vi.mocked(emailMod.sendRegistrationConfirmationEmail)

    const ccnMod = await import('@/lib/ccn/client')
    searchCCNMembership = vi.mocked(ccnMod.searchCCNMembership)

    const matchMod = await import('@/lib/actions/rider-match')
    searchRiderCandidates = vi.mocked(matchMod.searchRiderCandidates)
    searchRiderCandidates.mockResolvedValue({ candidates: [] })

    // Clean up
    await supabase.from('rider_merges').delete().eq('rider_id', IDS.rider)
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    // Delete any registrations/events created by permanent tests (slug prefix match)
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .like('slug', 'permanent-inttest-perm-route%')
    if (events && events.length > 0) {
      const eventIds = events.map((e: { id: string }) => e.id)
      await supabase.from('registrations').delete().in('event_id', eventIds)
      await supabase.from('events').delete().in('id', eventIds)
    }
    await supabase.from('routes').delete().in('id', [IDS.route, IDS.inactiveRoute])
    await supabase.from('riders').delete().eq('id', IDS.rider)

    // Seed
    await checked(
      supabase.from('riders').insert({
        id: IDS.rider,
        slug: 'inttest-perm-rider',
        first_name: 'Test',
        last_name: 'Rider',
        email: 'test-rider@example.com',
      }),
      'insert rider'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-perm-route',
        name: 'IntTest Perm Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'insert route'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.inactiveRoute,
        slug: 'inttest-perm-inactive',
        name: 'IntTest Inactive Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 100,
        is_active: false,
      }),
      'insert inactive route'
    )
  })

  afterEach(async () => {
    await supabase.from('rider_merges').delete().eq('rider_id', IDS.rider)
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    // Clean up dynamically created events and their registrations
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .like('slug', 'permanent-inttest-perm-route%')
    if (events && events.length > 0) {
      const eventIds = events.map((e: { id: string }) => e.id)
      await supabase.from('registrations').delete().in('event_id', eventIds)
      await supabase.from('events').delete().in('id', eventIds)
    }
    await supabase.from('riders').delete().eq('email', 'new-rider@example.com')
    vi.resetAllMocks()
    searchRiderCandidates.mockResolvedValue({ candidates: [] })
  })

  afterAll(async () => {
    await supabase.from('rider_merges').delete().eq('rider_id', IDS.rider)
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .like('slug', 'permanent-inttest-perm-route%')
    if (events && events.length > 0) {
      const eventIds = events.map((e: { id: string }) => e.id)
      await supabase.from('registrations').delete().in('event_id', eventIds)
      await supabase.from('events').delete().in('id', eventIds)
    }
    await supabase.from('routes').delete().in('id', [IDS.route, IDS.inactiveRoute])
    await supabase.from('riders').delete().eq('id', IDS.rider)
    await supabase.from('riders').delete().eq('email', 'new-rider@example.com')
  })

  // --- Happy path ---

  it('registers with valid route and future date — creates event and registration', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
    })

    const eventDate = daysFromNow(30)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )

    expect(result.success).toBe(true)

    // Verify event was created
    const expectedSlug = `permanent-inttest-perm-route-${eventDate}`
    const { data: event } = await supabase
      .from('events')
      .select('id, slug, name, distance_km, event_type, status')
      .eq('slug', expectedSlug)
      .single()

    expect(event).toBeTruthy()
    expect(event!.name).toBe('IntTest Perm Route')
    expect(event!.distance_km).toBe(200)
    expect(event!.event_type).toBe('permanent')
    expect(event!.status).toBe('scheduled')

    // Verify registration
    const { data: reg } = await supabase
      .from('registrations')
      .select('status, rider_id')
      .eq('event_id', event!.id)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('registered')

    // Verify email
    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, {
      membershipStatus: 'valid',
      registrantName: 'Test Rider',
      eventDistance: 200,
      eventType: 'Permanent',
    })
    assertManagementUrl(sendEmail)
  })

  it('second registration for same route+date reuses existing event', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
    })

    const eventDate = daysFromNow(31)
    const { registerForPermanent } = await import('@/lib/actions/register')

    // First registration creates the event
    const result1 = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )
    expect(result1.success).toBe(true)

    // Get event ID
    const expectedSlug = `permanent-inttest-perm-route-${eventDate}`
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('slug', expectedSlug)
      .single()

    // Second registration (different rider email) reuses event
    const result2 = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        email: 'new-rider@example.com',
        firstName: 'Another',
        lastName: 'Person',
      })
    )
    expect(result2.success).toBe(true)

    // Only one event with this slug
    const { data: events } = await supabase.from('events').select('id').eq('slug', expectedSlug)
    expect(events).toHaveLength(1)
    expect(events![0].id).toBe(event!.id)
  })

  // --- Validation ---

  it('date less than 14 days in future returns error', async () => {
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate: daysFromNow(13),
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('2 weeks')
  })

  it('invalid route ID returns error', async () => {
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: '00000000-0000-0000-0000-000000000000',
      })
    )

    expect(result.success).toBe(false)
  })

  it('inactive route returns error', async () => {
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.inactiveRoute })
    )

    expect(result.success).toBe(false)
  })

  it('missing required fields returns error', async () => {
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, firstName: '' })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Missing required fields')
  })

  // --- Event creation ---

  it('reversed direction creates event with (Reversed) in name', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
    })

    const eventDate = daysFromNow(32)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        direction: 'reversed',
      })
    )

    expect(result.success).toBe(true)

    const expectedSlug = `permanent-inttest-perm-route-${eventDate}`
    const { data: event } = await supabase
      .from('events')
      .select('name')
      .eq('slug', expectedSlug)
      .single()

    expect(event!.name).toBe('IntTest Perm Route (Reversed)')
  })

  it('reversed registration reuses event created by as_posted (same slug)', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
    })

    const eventDate = daysFromNow(36)
    const { registerForPermanent } = await import('@/lib/actions/register')

    // First: as_posted
    const result1 = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate, direction: 'as_posted' })
    )
    expect(result1.success).toBe(true)

    // Second: reversed, same date — should reuse the event (slug has no direction)
    const result2 = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        direction: 'reversed',
        email: 'new-rider@example.com',
        firstName: 'Another',
        lastName: 'Person',
      })
    )
    expect(result2.success).toBe(true)

    const expectedSlug = `permanent-inttest-perm-route-${eventDate}`
    const { data: events } = await supabase.from('events').select('id').eq('slug', expectedSlug)
    expect(events).toHaveLength(1) // Only one event, reused
  })

  // --- Membership flows ---

  it('no membership — incomplete registration with none email status', async () => {
    searchCCNMembership.mockResolvedValue({ found: false })

    const eventDate = daysFromNow(33)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )

    expect(result.success).toBe(false)
    expect(result.membershipError).toBe('no-membership')

    const expectedSlug = `permanent-inttest-perm-route-${eventDate}`
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('slug', expectedSlug)
      .single()

    const { data: reg } = await supabase
      .from('registrations')
      .select('status')
      .eq('event_id', event!.id)
      .single()
    expect(reg?.status).toBe('incomplete: membership')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, { membershipStatus: 'none' })
  })

  it('trial used — incomplete registration with trial-used email status', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 99,
      type: 'Trial Member',
    })
    // We need a completed event to hold a prior result — create a temporary one
    const tempEventId = '00000000-1a21-4000-a000-000000000010'
    await checked(
      supabase.from('events').insert({
        id: tempEventId,
        slug: 'inttest-perm-trial-check',
        name: 'Temp',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'permanent',
        distance_km: 200,
        event_date: daysFromNow(-7),
        status: 'completed',
      }),
      'insert temp completed event'
    )
    await checked(
      supabase.from('results').insert({
        id: '00000000-1a21-4000-a000-000000000011',
        rider_id: IDS.rider,
        event_id: tempEventId,
        status: 'finished',
        season: 2026,
        distance_km: 200,
      }),
      'insert finished result for trial'
    )

    const eventDate = daysFromNow(34)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )

    expect(result.success).toBe(false)
    expect(result.membershipError).toBe('trial-used')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, { membershipStatus: 'trial-used' })

    // Clean up temp event and result
    await supabase.from('results').delete().eq('id', '00000000-1a21-4000-a000-000000000011')
    await supabase.from('registrations').delete().eq('event_id', tempEventId)
    await supabase.from('events').delete().eq('id', tempEventId)
  })

  // --- Duplicate ---

  it('duplicate registration returns permanent-specific error', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
    })

    const eventDate = daysFromNow(35)
    const { registerForPermanent } = await import('@/lib/actions/register')

    const result1 = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )
    expect(result1.success).toBe(true)

    const result2 = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )
    expect(result2.success).toBe(false)
    expect(result2.error).toContain('already registered')
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run --config vitest.config.integration-real.mts tests/integration-real/registration/register-for-permanent.test.ts`
Expected: 12 tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/integration-real/registration/register-for-permanent.test.ts
git commit -m "test: add registerForPermanent integration tests"
```

---

## Chunk 3: completeRegistrationWithRider Tests + Audit Doc Update

### Task 5: completeRegistrationWithRider — all tests

**Files:**

- Create: `tests/integration-real/registration/complete-registration.test.ts`

**Context for implementer:**

- `completeRegistrationWithRider` is defined at `lib/actions/register.ts:914`
- Takes `CompleteRegistrationData` with `eventId`, `selectedRiderId` (null = create new), plus rider fields
- Does NOT call `findOrCreateRider` — it handles rider creation/update inline
- When `selectedRiderId` provided: fetches current rider data, creates `rider_merges` entry, updates rider name/email/gender/emergency contact
- When `selectedRiderId` is null: creates new rider with slug from `createRiderSlug(email)`
- Has duplicate check that returns `'You are already registered for this event'`
- Membership flow: same as other two functions BUT no outer try/catch around `getMembershipForRider` — CCN error propagates as unhandled rejection
- Does NOT call `searchRiderCandidates` — no need to mock `@/lib/actions/rider-match` (but mock it anyway as a module-level declaration to be safe)

- [ ] **Step 1: Write the complete test file**

```typescript
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import {
  TORONTO_CHAPTER_ID,
  daysFromNow,
  buildCompleteRegistrationData,
  assertEmailPayload,
  assertManagementUrl,
} from './helpers'

vi.mock('@/lib/email/send-registration-email')
vi.mock('@/lib/ccn/client')
vi.mock('@/lib/actions/rider-match')

const IDS = {
  rider: '00000000-1a22-4000-a000-000000000001',
  route: '00000000-1a22-4000-a000-000000000002',
  scheduledEvent: '00000000-1a22-4000-a000-000000000003',
  completedEvent: '00000000-1a22-4000-a000-000000000004',
}

describe('completeRegistrationWithRider (real DB)', () => {
  const supabase = getTestSupabase()
  const futureDate = daysFromNow(30)
  const pastDate = daysFromNow(-7)

  let sendEmail: ReturnType<typeof vi.fn>
  let searchCCNMembership: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CURRENT_SEASON = '2026'

    const emailMod = await import('@/lib/email/send-registration-email')
    sendEmail = vi.mocked(emailMod.sendRegistrationConfirmationEmail)

    const ccnMod = await import('@/lib/ccn/client')
    searchCCNMembership = vi.mocked(ccnMod.searchCCNMembership)

    const matchMod = await import('@/lib/actions/rider-match')
    vi.mocked(matchMod.searchRiderCandidates).mockResolvedValue({ candidates: [] })

    // Clean up
    const riderIds = [IDS.rider]
    await supabase.from('rider_merges').delete().in('rider_id', riderIds)
    await supabase.from('memberships').delete().in('rider_id', riderIds)
    await supabase
      .from('registrations')
      .delete()
      .in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('events').delete().in('id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().in('id', riderIds)

    // Seed
    await checked(
      supabase.from('riders').insert({
        id: IDS.rider,
        slug: 'inttest-complete-rider',
        first_name: 'Existing',
        last_name: 'Rider',
        email: null, // No email — simulates rider found by fuzzy match
      }),
      'insert rider'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-complete-route',
        name: 'IntTest Complete Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'insert route'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.scheduledEvent,
        slug: `inttest-complete-brevet-${futureDate}`,
        name: 'IntTest Complete Brevet',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: futureDate,
        start_time: '08:00',
        start_location: 'Test Start',
        status: 'scheduled',
      }),
      'insert scheduled event'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.completedEvent,
        slug: `inttest-complete-completed-${pastDate}`,
        name: 'IntTest Completed Event',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: pastDate,
        status: 'completed',
      }),
      'insert completed event'
    )
  })

  afterEach(async () => {
    await supabase.from('rider_merges').delete().in('rider_id', [IDS.rider])
    // Also clean merges for any newly created riders
    const { data: newRiders } = await supabase
      .from('riders')
      .select('id')
      .eq('email', 'completer@example.com')
    if (newRiders && newRiders.length > 0) {
      await supabase
        .from('rider_merges')
        .delete()
        .in(
          'rider_id',
          newRiders.map((r: { id: string }) => r.id)
        )
    }
    await supabase.from('memberships').delete().in('rider_id', [IDS.rider])
    await supabase.from('results').delete().in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase
      .from('registrations')
      .delete()
      .in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('riders').delete().eq('email', 'completer@example.com')
    // Restore seeded rider to original state (tests mutate it via selectedRiderId)
    await supabase
      .from('riders')
      .update({
        first_name: 'Existing',
        last_name: 'Rider',
        email: null,
        gender: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
      })
      .eq('id', IDS.rider)
    vi.resetAllMocks()
  })

  afterAll(async () => {
    await supabase.from('rider_merges').delete().in('rider_id', [IDS.rider])
    await supabase.from('memberships').delete().in('rider_id', [IDS.rider])
    await supabase
      .from('registrations')
      .delete()
      .in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('events').delete().in('id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().in('id', [IDS.rider])
    await supabase.from('riders').delete().eq('email', 'completer@example.com')
  })

  // --- Update existing rider ---

  it('selectedRiderId provided — updates rider, creates registration', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
    })

    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: IDS.rider,
        email: 'completer@example.com',
        firstName: 'Updated',
        lastName: 'Name',
      })
    )

    expect(result.success).toBe(true)

    // Rider should be updated
    const { data: rider } = await supabase
      .from('riders')
      .select('first_name, last_name, email')
      .eq('id', IDS.rider)
      .single()

    expect(rider).toMatchObject({
      first_name: 'Updated',
      last_name: 'Name',
      email: 'completer@example.com',
    })

    // Registration created
    const { data: reg } = await supabase
      .from('registrations')
      .select('status, rider_id')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('registered')

    // Email sent
    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, {
      membershipStatus: 'valid',
      registrantName: 'Updated Name',
    })
    assertManagementUrl(sendEmail)
  })

  it('creates rider_merges audit entry with before/after fields', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
    })

    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: IDS.rider,
        email: 'completer@example.com',
        firstName: 'Updated',
        lastName: 'Name',
      })
    )

    const { data: merges } = await supabase
      .from('rider_merges')
      .select(
        'submitted_first_name, submitted_last_name, submitted_email, previous_first_name, previous_last_name, previous_email, merge_source'
      )
      .eq('rider_id', IDS.rider)

    expect(merges).toHaveLength(1)
    expect(merges![0]).toMatchObject({
      submitted_first_name: 'Updated',
      submitted_last_name: 'Name',
      submitted_email: 'completer@example.com',
      previous_first_name: 'Existing',
      previous_last_name: 'Rider',
      previous_email: null,
      merge_source: 'registration',
    })
  })

  // --- Create new rider ---

  it('selectedRiderId null — creates new rider and registration', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
    })

    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: null,
        email: 'completer@example.com',
        firstName: 'Brand',
        lastName: 'New',
      })
    )

    expect(result.success).toBe(true)

    // New rider should exist
    const { data: rider } = await supabase
      .from('riders')
      .select('first_name, last_name, email, slug')
      .eq('email', 'completer@example.com')
      .single()

    expect(rider).toBeTruthy()
    expect(rider!.first_name).toBe('Brand')
    expect(rider!.last_name).toBe('New')
    expect(rider!.slug).toMatch(/^completer-[a-z0-9]+$/)

    // Verify registration exists for this event
    const { data: allRegs } = await supabase
      .from('registrations')
      .select('status, rider_id')
      .eq('event_id', IDS.scheduledEvent)
    expect(allRegs).toHaveLength(1)
    expect(allRegs![0].status).toBe('registered')
  })

  // --- Membership handling ---

  it('no membership — incomplete registration', async () => {
    searchCCNMembership.mockResolvedValue({ found: false })

    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: IDS.rider,
        email: 'completer@example.com',
      })
    )

    expect(result.success).toBe(false)
    expect(result.membershipError).toBe('no-membership')

    const { data: reg } = await supabase
      .from('registrations')
      .select('status')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('incomplete: membership')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, { membershipStatus: 'none' })
  })

  it('trial used — incomplete registration with trial-used email status', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 99,
      type: 'Trial Member',
    })
    // Seed a prior finished result to mark trial as used
    await checked(
      supabase.from('results').insert({
        id: '00000000-1a22-4000-a000-000000000010',
        rider_id: IDS.rider,
        event_id: IDS.completedEvent,
        status: 'finished',
        season: 2026,
        distance_km: 200,
      }),
      'insert finished result for trial'
    )

    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: IDS.rider,
        email: 'completer@example.com',
      })
    )

    expect(result.success).toBe(false)
    expect(result.membershipError).toBe('trial-used')

    const { data: reg } = await supabase
      .from('registrations')
      .select('status')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('incomplete: membership')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, { membershipStatus: 'trial-used' })
  })

  it('CCN error — throws unhandled rejection', async () => {
    searchCCNMembership.mockRejectedValue(new Error('CCN API error: 500'))

    const { completeRegistrationWithRider } = await import('@/lib/actions/register')

    await expect(
      completeRegistrationWithRider(
        buildCompleteRegistrationData({
          eventId: IDS.scheduledEvent,
          selectedRiderId: IDS.rider,
          email: 'completer@example.com',
        })
      )
    ).rejects.toThrow('CCN API error')
  })

  // --- Validation ---

  it('event not found returns error', async () => {
    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: '00000000-0000-0000-0000-000000000000',
        email: 'completer@example.com',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Event not found')
  })

  it('completed event returns error', async () => {
    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.completedEvent,
        email: 'completer@example.com',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Registration is not open for this event')
  })

  it('invalid selectedRiderId returns error', async () => {
    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: '00000000-0000-0000-0000-000000000000',
        email: 'completer@example.com',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Selected rider not found')
  })

  it('missing required fields returns error', async () => {
    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        firstName: '',
        email: 'completer@example.com',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Missing required fields')
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run --config vitest.config.integration-real.mts tests/integration-real/registration/complete-registration.test.ts`
Expected: 11 tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/integration-real/registration/complete-registration.test.ts
git commit -m "test: add completeRegistrationWithRider integration tests"
```

---

### Task 6: Run full suite and update audit doc

**Files:**

- Modify: `docs/test-suite-audit.md`

- [ ] **Step 1: Run all integration-real tests together**

Run: `npx vitest run --config vitest.config.integration-real.mts`
Expected: All tests pass (17 membership + ~35 registration = ~52 total)

- [ ] **Step 2: Run the standard test suite to verify no regressions**

Run: `npm test`
Expected: All existing tests still pass

- [ ] **Step 3: Update audit doc**

In `docs/test-suite-audit.md`, find the Phase 3.1 row in the priority table and mark it as completed. Add a section documenting the tests added:

```markdown
### Phase 3.1: Registration flow (integration-real)

**Tests added:** ~35 across 3 files + 1 helpers file

- `register-for-event.test.ts` — 12 tests covering happy path, membership flows, validation, rider creation/matching, email payloads
- `register-for-permanent.test.ts` — 12 tests covering event creation, direction/reuse, validation, membership flows, duplicates
- `complete-registration.test.ts` — 11 tests covering rider update/create, audit logging, membership handling (including trial-used), validation

**What's mocked:** SendGrid email, CCN membership API, rider search (fuzzy match)
**What's real:** All Supabase database operations
```

- [ ] **Step 4: Commit**

```bash
git add docs/test-suite-audit.md
git commit -m "docs: mark Phase 3.1 registration flow tests complete in audit"
```

# Test Suite Audit: False Confidence Analysis

Date: 2026-03-13

## Executive Summary

The test suite has 65+ unit/integration test files and 5 E2E spec files. Coverage thresholds are set at 60% lines/functions and 50% branches. On the surface this looks healthy. In practice, the tests would not stop most categories of broken code from shipping.

The root cause is structural: integration tests mock Supabase so aggressively that they only test input validation. E2E tests that should catch real behavior are gated behind environment variables and silently skip. The result is a green CI that proves almost nothing about whether the application actually works.

**Overall confidence level: LOW**

---

## Findings

### 1. The Supabase Mock Void

**Severity: Critical** | Affects: every integration test file

Every integration test replaces `@/lib/supabase-server` with a hand-rolled mock that returns canned responses. These mocks **do not validate**:

- Which table is queried
- Which columns are selected
- Which filter conditions are applied
- What data is inserted or updated

Example from `tests/integration/actions/register.test.ts:12-22`:

```ts
getSupabaseAdmin: vi.fn(() => ({
  from: vi.fn(() => ({
    // ignores table name
    select: vi.fn(() => ({
      // ignores column list
      eq: vi.fn(() => ({
        // ignores filter field and value
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      })),
    })),
  })),
}))
```

**What would pass with wrong code**: `registerForEvent` could query table `'cats'` instead of `'events'`, filter by `'color'` instead of `'id'`, and every test still goes green.

**Affected files** (all follow the same pattern):

- `register.test.ts`
- `events.test.ts`
- `rider-results.test.ts`
- `results.test.ts`
- `manage-registration.test.ts`
- `auth.test.ts`
- `my-rides.test.ts`
- `routes.test.ts`
- `riders.test.ts`
- `navigation.test.ts`
- `complete-events.test.ts`
- `images.test.ts`
- `news.test.ts`
- `rider-match.test.ts`
- `admin-users.test.ts`
- `pages.test.ts`

### 2. Integration Tests Only Cover Input Validation

The integration tests for server actions test that empty/invalid inputs return errors. They do not test the actual business logic paths.

`**register.test.ts`\*\*: 6 tests — all are "returns error for missing/empty X". Zero tests for a successful registration that verifies the right data was written, the right email was sent, or the right cache was revalidated.

`**manage-registration.test.ts**`: 3 tests — all are "returns error for non-existent token". Zero tests for successful cancellation, early result creation, or cancellation email delivery.

`**rider-results.test.ts**`: Validation tests (empty token, invalid status, missing time) plus a success test that only asserts `result.success === true` — never checks what was written.

### 3. Success Paths Assert Only the Return Code

When integration tests do cover success paths, they check `success: true` and nothing else.

`events.test.ts:461-464` — was the update applied with the right data?

```ts
const result = await updateEvent('event-1', { name: 'Updated Name', startTime: '09:00' })
expect(result.success).toBe(true) // entire assertion
```

`results.test.ts:155-174` — was the right data inserted?

```ts
const result = await createResult({ eventId: 'event-1', riderId: 'rider-1', status: 'finished' })
expect(result.success).toBe(true) // doesn't verify what was written
```

`rider-results.test.ts:240-254` — negative assertion only:

```ts
const result = await submitRiderResult({ token: 'valid-token', status: 'dnf' })
expect(result.error).not.toBe('Finish time is required') // doesn't verify result saved
```

### 4. E2E Tests Silently Skip

E2E tests are gated behind environment variables and database state. Without them, tests skip and CI reports green.

| E2E file                          | `test.skip()` calls | Gate condition                 |
| --------------------------------- | ------------------- | ------------------------------ |
| `admin-workflows.spec.ts`         | 7                   | `E2E_ADMIN_EMAIL` not set      |
| `result-submission.spec.ts`       | 11                  | `E2E_SUBMISSION_TOKEN` not set |
| `registration-flow.spec.ts`       | 5                   | No events in database          |
| `membership-verification.spec.ts` | 14                  | No events in database          |
| `registration.spec.ts`            | 2                   | `E2E_ADMIN_EMAIL` not set      |

**Total**: 39 `test.skip()` calls across 5 files. Unless CI has all env vars set and a seeded database, most E2E tests never run.

### 5. Tautological E2E Assertions

Several E2E tests pass regardless of what happens.

`registration-flow.spec.ts:197` — failure is explicitly accepted:

```ts
} else {
  // Registration didn't succeed (dialog, error, etc.)
  expect(true).toBe(true)
}
```

`registration-flow.spec.ts:97` — any of four outcomes is "success":

```ts
expect(hasSuccess || hasDialog || hasError || buttonReset).toBeTruthy()
```

`admin-workflows.spec.ts:147-151` — if element doesn't exist, no assertion runs:

```ts
if ((await createButton.count()) > 0) {
  await createButton.click()
  await expect(page).toHaveURL(/\/admin\/events\/new/)
}
// silent pass if button is missing
```

### 6. Membership Service Has Zero Behavioral Tests

`tests/unit/lib/membership-service.test.ts` only verifies the module exports functions:

```ts
it('exports getMembershipForRider function', async () => {
  const { getMembershipForRider } = await import('@/lib/memberships/service')
  expect(typeof getMembershipForRider).toBe('function')
})
```

This is a critical business gate — membership verification blocks non-members from registering. A function returning `{ found: false }` unconditionally would pass these tests. There are no tests for:

- Valid membership lookup
- Expired membership handling
- Trial usage tracking (`isTrialUsed`)
- Membership type differentiation

### 7. Admin Authorization Is Universally Mocked

Every integration test for admin actions auto-approves authorization:

```ts
vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' }),
}))
```

No test verifies that an unauthenticated or non-admin user is actually blocked. If `requireAdmin` were changed to always succeed, no test would catch it.

### 8. The "Covered in E2E" Circular Dependency

Integration test files contain 10+ comments deferring complex behavior to E2E:

- `register.test.ts:118`: _"Tests for event status validation require more sophisticated Supabase mocking. These are covered by E2E tests."_
- `register.test.ts:170`: _"Tests for dates 14+ days out require route/chapter DB calls... covered by E2E tests."_
- `result-submission-form.test.tsx:104`: _"Radix UI Select interactions are difficult to test in happy-dom. Full status selection is covered by E2E tests."_
- `result-submission-form.test.tsx:129`: _"Full form submission flows... are covered by E2E tests."_

But as documented in findings 4 and 5, the E2E tests that are supposed to cover these behaviors either skip or have tautological assertions. This creates a circular dependency of hope.

### 9. Registration Flow Has 13 Steps; Tests Cover 1

The registration flow in `lib/actions/register.ts` performs:

1. Validate input
2. Look up event
3. Check event status (scheduled, not cancelled)
4. Check membership
5. Find rider by email
6. Search fuzzy name matches
7. Create new rider (or update existing)
8. Log rider merge
9. Check duplicate registration
10. Create registration record
11. Create pending result (for completed events)
12. Send confirmation email
13. Revalidate cache

Integration tests cover **step 1 only**. Steps 2-13 are entirely mocked away.

### 10. Unused Mock Infrastructure

`tests/mocks/supabase.ts` has sophisticated features that are never used:

- `assertCalled(tableName)` — verifies a table was queried
- `getRequests(tableName)` — returns all queries to a table
- Request tracking with method, chain, and args

`tests/utils/supabase-mock.ts` has similar unused capabilities. These were built for assertion purposes but no test calls them.

---

## What's Missing: Module-by-Module

| Module                   | Critical behavior                     | What tests verify             | What a broken implementation could do and still pass                    |
| ------------------------ | ------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `register.ts`            | Full registration flow end-to-end     | Empty field rejection         | Query wrong table, skip email, create duplicate registration            |
| `manage-registration.ts` | Cancellation with email + cleanup     | "Not found" error             | Skip cancellation email, leave result records, skip status update       |
| `events.ts`              | Status transitions trigger cascades   | Status update returns success | Skip pending result creation, skip cancellation cleanup, skip audit log |
| `memberships/service.ts` | Membership gates registration         | Module exports exist          | Return wrong membership status, skip trial tracking                     |
| `rider-results.ts`       | Result submission persists data       | Validation + `success: true`  | Write to wrong table, skip file storage, corrupt finish time            |
| `auth.ts` (middleware)   | Non-admins blocked from admin routes  | Login validation only         | Allow any user to access admin                                          |
| `complete-event.ts`      | Cron creates pending results + emails | Auth check + empty result set | Skip email sending, create results with wrong data                      |
| `email/templates.ts`     | HTML escaping prevents XSS            | Template escaping (good)      | — (this is actually well-tested)                                        |
| `errors.ts`              | Error propagation + Sentry logging    | Error handler behavior (good) | — (this is actually well-tested)                                        |

---

## Implementation Plan

### Phase 1: Fix the Foundation (High Impact, Moderate Effort)

**Goal**: Make existing integration tests actually verify behavior, not just return codes.

#### 1.1 Add Query Verification to Existing Mocks

Use the existing `getRequests()` and `assertCalled()` infrastructure in `tests/mocks/supabase.ts` that was built but never used.

For each integration test that checks `success: true`, add assertions about what Supabase operations were performed:

```ts
// After calling createEvent(...)
expect(result.success).toBe(true)

// NEW: Verify the right operations happened
const insertRequests = mockSupabase.getRequests('events').filter((r) => r.method === 'insert')
expect(insertRequests).toHaveLength(1)
```

**Files to update**:

- `tests/integration/actions/events.test.ts` — verify insert/update calls for createEvent, updateEvent, deleteEvent
- `tests/integration/actions/results.test.ts` — verify insert/update/delete calls
- `tests/integration/actions/rider-results.test.ts` — verify update calls for submitRiderResult
- `tests/integration/actions/routes.test.ts` — verify insert/update/delete calls
- `tests/integration/actions/riders.test.ts` — verify update calls

**Estimated scope**: ~50 additional assertions across existing test files. No new test files needed.

#### 1.2 Fix Tautological E2E Assertions

Replace every `expect(true).toBe(true)` and "any outcome passes" pattern with deterministic assertions.

- `registration-flow.spec.ts:197` — remove the `else` branch that accepts failure. If the test can't guarantee success, it should skip with a clear reason, not silently pass.
- `registration-flow.spec.ts:97` — pick one expected outcome. If the test depends on DB state, use a `beforeAll` to seed the state.
- `admin-workflows.spec.ts:147-151` — add an `else` with `expect.fail('Create button not found')` or skip the test explicitly.

**Files to update**:

- `tests/e2e/registration-flow.spec.ts`
- `tests/e2e/admin-workflows.spec.ts`
- `tests/e2e/result-submission.spec.ts`

**Estimated scope**: ~15 assertion fixes.

### Phase 2: E2E Tests That Actually Run (High Impact, Moderate Effort)

**Goal**: Make E2E tests unconditionally runnable in CI.

#### 2.1 Create a Test Data Seeding Script

Create `tests/e2e/seed-test-data.ts` that:

1. Creates a test admin user in Supabase Auth
2. Creates an admin record in the `admins` table
3. Creates a test chapter, a test route, and a test event (scheduled, future date)
4. Creates a test rider with a registration
5. Creates a completed event with a pending result (for result submission tests)
6. Outputs the created tokens/credentials to a `.env.test` file

#### 2.2 Add a Global Setup to Playwright

In `playwright.config.ts`, add a `globalSetup` that runs the seed script before tests:

```ts
export default defineConfig({
  globalSetup: './tests/e2e/global-setup.ts',
  // ...
})
```

The global setup should:

1. Run the seed script
2. Set environment variables for the test run
3. Clean up test data in a `globalTeardown`

#### 2.3 Remove Environment Variable Gates

Once seeding is in place, replace every `if (!process.env.X) { test.skip() }` with a `test.beforeAll` that reads from the seeded data.

**New files**:

- `tests/e2e/seed-test-data.ts`
- `tests/e2e/global-setup.ts`
- `tests/e2e/global-teardown.ts`

**Files to update**:

- `playwright.config.ts`
- `tests/e2e/admin-workflows.spec.ts`
- `tests/e2e/result-submission.spec.ts`
- `tests/e2e/registration-flow.spec.ts`
- `tests/e2e/membership-verification.spec.ts`
- `tests/e2e/registration.spec.ts`

### Phase 3: Test Critical Business Logic (High Impact, High Effort)

**Goal**: Add integration tests for the behavior that matters most.

#### 3.1 Registration Flow Integration Tests

Add tests to `tests/integration/actions/register.test.ts` that use properly structured mocks to verify the full registration path:

- **Successful registration**: Mock returns a valid event, no existing rider, no duplicate → verify `insert` was called on `registrations` table with the right data
- **Duplicate registration blocked**: Mock returns existing registration → verify error message and no insert
- **Event not open**: Mock returns event with status `cancelled` → verify rejection
- **Membership check failure**: Mock membership service to return `{ found: false }` → verify `membershipError` is returned
- **Rider matching triggered**: Mock no email match + fuzzy name matches → verify `needsRiderMatch` response

**New tests**: ~8-10 test cases.

#### 3.2 Membership Service Tests

Replace the "exports exist" tests in `tests/unit/lib/membership-service.test.ts` with real behavioral tests. Since the membership service queries an external CCN API and Supabase, mock both and test:

- Valid membership found → returns `{ found: true, type: 'Regular', ... }`
- No membership found → returns `{ found: false }`
- Expired membership → returns appropriate status
- Trial already used → `isTrialUsed` returns true
- First trial → `isTrialUsed` returns false
- API error → graceful fallback

**Scope**: Rewrite `membership-service.test.ts` with ~8 test cases.

#### 3.3 Event Status Transition Tests

Add tests to `tests/integration/actions/events.test.ts` for the completion cascade:

- **Scheduled → Completed**: Verify `createPendingResultsAndSendEmails` is called with the right event data
- **Scheduled → Cancelled**: Verify results are deleted before status update
- **Completed → Submitted**: Verify email is sent with spreadsheet attachment (already partially tested, needs assertion on attachment content)
- **Invalid transitions**: Verify that already-submitted events can't be re-submitted

**New tests**: ~5 test cases.

#### 3.4 Authorization Tests

Add a new test file `tests/integration/auth/authorization.test.ts` that tests admin actions **without** mocking `requireAdmin`:

- Call `createEvent` without auth → verify rejection
- Call `deleteEvent` without auth → verify rejection
- Call `updateEventStatus` without auth → verify rejection

This requires a different mock strategy: mock Supabase auth to return no user, but don't mock `requireAdmin` itself.

**New file**: `tests/integration/auth/authorization.test.ts` with ~5 test cases.

### Phase 4: Strengthen Existing Tests (Medium Impact, Low Effort)

**Goal**: Quick wins to reduce false confidence in existing tests.

#### 4.1 Add Data Shape Assertions to Success Paths

For every test that only checks `success: true`, add at least one assertion about the returned data shape or content.

Example upgrade for `events.test.ts`:

```ts
// Before
expect(result.success).toBe(true)

// After
expect(result.success).toBe(true)
if (result.success) {
  expect(result.data?.id).toBe('new-event-id')
}
```

**Scope**: ~20 assertion additions across existing files.

#### 4.2 Add Email Side-Effect Verification

Several actions send emails. Add assertions that the mocked email function was called with the right arguments:

- `register.test.ts`: Verify `sendRegistrationConfirmationEmail` called with rider name, event details
- `manage-registration.test.ts`: Verify `sendCancellationConfirmationEmail` called on successful cancellation
- `events.test.ts`: Verify `createPendingResultsAndSendEmails` called with correct event data

**Scope**: ~8 assertion additions.

#### 4.3 Add Cache Revalidation Verification

Server actions call `revalidatePath` and `revalidateTag` after mutations. Add assertions:

```ts
import { revalidatePath } from 'next/cache'

// After calling createEvent(...)
expect(revalidatePath).toHaveBeenCalledWith('/admin/events')
```

**Scope**: ~10 assertion additions.

### Phase 5: Long-Term — Real Database Tests (Highest Impact, Highest Effort)

**Goal**: Eliminate the mock void entirely for critical paths.

#### 5.1 Integration Tests Against Local Supabase

The project already uses local Supabase for development. Create a test helper that:

1. Connects to the local Supabase instance
2. Wraps each test in a transaction that rolls back (or uses a test-specific schema)
3. Provides the real `getSupabaseAdmin()` client

This would let tests like `createEvent` → `getEvent` → `deleteEvent` run against the real schema, catching:

- Column name mismatches
- Missing foreign keys
- Constraint violations
- Query builder chain errors

**New files**:

- `tests/utils/real-supabase.ts` — test helper for real DB connection
- `tests/integration-real/` — new directory for real-DB integration tests

**Scope**: Start with the 3 most critical flows (registration, event status change, result submission). Expand over time.

#### 5.2 CI Pipeline for Real DB Tests

Add a GitHub Actions job that:

1. Starts Supabase locally via `supabase start`
2. Runs migrations
3. Seeds minimal test data
4. Runs integration-real tests

**Completed 2026-06-02 (issue #80).** Added an `integration-real` job to
`.github/workflows/ci.yml` that installs the Supabase CLI, runs `supabase start`
(migrations + `seed.sql`), maps the generated keys into the env vars the tests
read, and runs `npm run test:integration-real`. It gates every PR alongside the
existing `verify` job. The mock-void `tests/unit/lib/membership-service.test.ts`
tautology was deleted (superseded by the 15 real-DB membership tests).

Wiring the suite into CI immediately surfaced behaviour drift that the
mock-based suite had never caught — three changes landed between 03-16 and 03-18
(just after the Phase 3 green baseline) and silently broke the real tests, which
CI never ran:

1. **Rate-limiter state leaked across tests** (`lib/rate-limit.ts`, added
   2026-03-18). The module-level store accumulated per-email attempts across
   registration tests that reuse one email, tripping the limiter. Fixed by a
   test-only `resetRateLimitStores()` called in the integration-real
   `beforeEach`.
2. **Fuzzy name-match gate** (`findOrCreateRider`, 2026-03-16) means an email
   match now only reuses a rider when the name scores ≥ 0.8. The "reuses rider"
   test submitted a wholly different name, so on a clean DB it created a new
   rider and logged no merge. Updated to a near-match name ("Test Ryder").
3. **Reversed permanent rides get a distinct `-reverse` slug** (2026-03-18). Two
   tests still assumed the old shared-slug behaviour. Updated to assert the
   separate-event behaviour.

Playwright E2E in CI remains a follow-up.

---

## Priority Order

| Priority | Phase        | Completed? | What                                                  | Why                                                                           |
| -------- | ------------ | ---------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1        | 1.2          | Yes        | Fix tautological E2E assertions                       | Tests that always pass are worse than no tests — they create false confidence |
| 1b       | 1.2 deferred | Partial    | Remaining E2E assertion weaknesses (see notes below)  | Found during post-implementation review; deferred to Phase 2+                 |
| 2        | 1.1          | Yes        | Add query verification to existing mocks              | Highest ratio of value to effort — adds real assertions to existing tests     |
| 3        | 2            | Yes        | E2E seeding + remove skip gates + fix broken locators | Makes E2E tests actually run in CI                                            |
| 4        | 3.2          | Yes        | Membership service tests                              | Critical business gate with zero coverage                                     |
| 5        | 3.1          | Yes        | Registration flow integration tests                   | Most important user-facing flow                                               |
| 6        | 4.1-4.3      | Yes        | Strengthen existing assertions                        | Quick wins across the board                                                   |
| 7        | 3.3          | Yes        | Event status transition tests                         | Complex cascade logic with high risk                                          |
| 8        | 3.4          |            | Authorization tests                                   | Security boundary                                                             |
| 9        | 5            | Yes        | Real database integration tests + CI gate (issue #80) | Eliminates mock void permanently                                              |

---

## Phase 1.2 Deferred Issues

Completed 2026-03-13. Post-implementation review identified these remaining weaknesses in the E2E assertion fixes. None are regressions — all are pre-existing issues that were out of scope or require Phase 2 infrastructure to resolve.

### Deferred to Phase 2 (requires test data seeding)

1. ~~`**disables form when results already submitted` always skips in practice.\*\*~~ **Fixed 2026-03-13 (Phase 2).** globalSetup now seeds a separate submitted-result with its own token. The test uses `getTestData()?.submittedResult.submissionToken` and asserts the "Results Already Submitted" heading is visible.
2. ~~**GPX and control card upload tests may fail if default status is not "finished".**~~ **Fixed 2026-03-13.** Upload tests now select "finished" status before looking for file inputs. Upload assertions now check for the uploaded filename instead of matching static button labels.

### Remaining E2E assertion weaknesses (from Phase 1.2 review)

These are E2E test issues in `registration-flow.spec.ts`, not mock-based integration test issues. Originally mislabeled as "Deferred to Phase 4" but Phase 4 targeted integration tests. These remain open.

1. **Permanent registration validation** does not check _which_ fields are invalid. The test verifies that _some_ validation error appears but not that the route or date field specifically is flagged. Fix: assert that the route/date combobox or its container has a validation message.
2. **`Promise.race` + `.catch(() => {})` adds ~15s wall time on failure.** When all three `waitFor` calls time out, the catch swallows the rejection and execution falls through to `isVisible()` checks + `expect.fail()`. Fix: restructure to let the race throw and provide a better timeout error message.
3. **Rider match dialog test accepts any of 3 outcomes.** The test passes on success, dialog, OR error. Fix: when the dialog branch is hit, assert specific dialog content (e.g., text matching "match" or candidate rider names) rather than just `[role="dialog"]`.
4. ~~**Weak locators in admin-workflows.spec.ts.**~~ **Fixed 2026-03-13 (Phase 2 locator fixes).**
5. **Dead `registerButton` variable declarations** on lines 80 and 174 of `registration-flow.spec.ts`. Cleanup only — no confidence impact.

## Phase 2 Post-Implementation Issues

Completed 2026-03-13. Post-implementation review of the E2E seeding infrastructure identified these issues. Fixes 1, 2, 3, and 4 were applied; 6 is deferred.

**Current E2E health (2026-03-13)**: 66 tests total → 63 passed, 0 failed, 3 skipped. Previously 34 of 45 tests were silently skipping.

### Fixed 2026-03-13

1. **globalSetup discarded Supabase errors.** Every `insert`/`upsert`/`delete` ignored `{ error }`. If an operation failed (RLS, constraint violation, wrong schema), setup continued silently and downstream tests failed with confusing timeouts. Fix: added `checked()` wrapper that throws on any Supabase error.
2. **Duplicated IDS constant between setup and teardown.** If someone updated one and not the other, teardown would leave orphan data. Fix: extracted `E2E_IDS` to shared `helpers/test-data.ts`.
3. **Admin tests had no safety-net skip.** After removing the env var guards, admin tests would timeout for 60s each if globalSetup failed. Fix: added `if (!getTestData()) test.skip()` check in each `beforeEach` and the login test.

### Fixed 2026-03-13 (Phase 2 locator fixes)

1. ~~**Six strict-mode locator violations now visible.**~~ **Fixed.** All 9 broken locators repaired. Suite now runs 63 pass / 0 fail / 3 skip. Specific fixes:

- `admin-workflows.spec.ts` dashboard: `getByText(/events/i)` → `locator('span', { hasText: /[\d,]+ events/ })` (avoids matching card descriptions)
- `admin-workflows.spec.ts` sidebar: `locator('nav, [role="navigation"]')` → three `getByTestId('nav-*')` assertions (shadcn Sidebar uses `<div>`, not `<nav>`)
- `admin-workflows.spec.ts` create event: `locator('form')` → `locator('form').first()` (logout form is a second `<form>`)
- `admin-workflows.spec.ts` event details: `locator('h1, main')` → `locator('h1')`
- `admin-workflows.spec.ts` news: removed homepage cache checks (Next.js `unstable_cache` doesn't reliably invalidate in dev); workflow now verified entirely through admin panel
- `admin-workflows.spec.ts` results nav: added `{ timeout: 30000 }` for dev-mode compilation delay
- `result-submission.spec.ts` valid token: `locator('h1, main')` → `locator('h1')`
- `result-submission.spec.ts` finish status: `text=/finished|dnf|dns/i` → `getByRole('option').first()`
- `result-submission.spec.ts` GPX upload: `getByText('test-route.gpx')` → `locator('a[href*="gpx"]')` (server renames uploaded files)
- `result-submission.spec.ts` control card: `getByText('control-card.jpg')` → `locator('a[href*="control_card"]')` (same rename issue)
- `result-submission.spec.ts` time validation: `text=/time|required|finish/i` → `locator('#finishHours:invalid, #finishMinutes:invalid')` (HTML5 required validation)

### Deferred

1. **News teardown uses `ilike('title', 'Test Announcement%')`.** Could delete user-created news items that happen to start with the same prefix. Should use a deterministic slug or more specific pattern.

## Phase 3.2: Membership Service Tests

Completed 2026-03-13. Added 13 real-database integration tests for `lib/memberships/service.ts` — the critical business gate that determines whether riders can register for events. Previous coverage: 3 tests checking `typeof fn === 'function'`.

**Infrastructure:** Separate Vitest config (`vitest.config.integration-real.mts`) runs tests against real local Supabase while mocking only the external CCN API. Tests live in `tests/integration-real/` and are excluded from the main test suite. Run via `npm run test:integration-real`.

**Tests added (15 total):**

`getMembershipForRider` (6 tests):

- DB cache hit returns cached membership without calling CCN
- CCN fallback fetches, returns, and caches membership in DB
- Second call uses DB cache (CCN called exactly once)
- CCN no-match returns `{ found: false }`, nothing cached
- CCN API error propagates, nothing cached
- CCN_ENDPOINT missing error propagates

`isTrialUsed` (9 tests):

- Finished result → true
- DNF result → true
- OTL result → true
- Upcoming registration → true
- No activity → false
- DNS-only result → false
- Pending-only result → false
- Cancelled registration for future event → false
- Past-event registration only → false

## Phase 3.1: Registration Flow Integration Tests

Completed 2026-03-13. Added 33 real-database integration tests for all three registration server actions in `lib/actions/register.ts` — the most important user-facing flow. Previous coverage: 6 mock-only tests checking input validation (step 1 of 13 registration steps).

**Tests added (33 total across 3 files + 1 helpers file):**

`register-for-event.test.ts` (12 tests):

- Happy path with valid membership → registered, email with `membershipStatus: valid`
- CCN not-found → incomplete membership, email with `membershipStatus: none`
- Trial used → incomplete membership, email with `membershipStatus: trial-used`
- CCN API error → Registration failed, no record created
- Rider match candidates → `needsRiderMatch: true`, no registration
- Duplicate registration → error
- Event not found, completed event, missing fields → errors
- Duplicate team name → captain error
- New rider creation (slug verified)
- Existing rider by email → reuses rider, creates `rider_merges` audit entry

`register-for-permanent.test.ts` (11 tests):

- Happy path → dynamic event creation with correct slug pattern
- Second registration → reuses existing event
- Date validation (< 14 days), invalid route, inactive route, missing fields → errors
- Reversed direction → event name includes "(Reversed)"
- Cross-direction → reuses same event (direction not in slug)
- No membership, trial used → incomplete registration
- Duplicate → permanent-specific error

`complete-registration.test.ts` (10 tests):

- selectedRiderId provided → updates rider fields, creates registration
- Audit log → `rider_merges` with before/after fields
- selectedRiderId null → creates new rider with slug
- No membership, trial used → incomplete registration
- CCN error → unhandled rejection (no outer try/catch)
- Event not found, completed event, invalid rider, missing fields → errors

**What's mocked:** SendGrid email (assert payload), CCN membership API, rider search (fuzzy match)
**What's real:** All Supabase database operations (riders, events, routes, registrations, results, memberships, rider_merges)

**Infrastructure notes:**

- `fileParallelism: false` in vitest config — registration tests share email addresses through `findOrCreateRider`, requiring sequential execution
- Each file uses isolated UUID prefixes (`1a20`, `1a21`, `1a22`) to avoid collisions
- Shared helpers in `tests/integration-real/registration/helpers.ts`

### Phase 3.1 Post-Implementation Audit

Audited 2026-03-13. Identified 7 issues; 3 fixed immediately, 4 deferred.

**Fixed 2026-03-13:**

1. **Weak error assertions.** `register-for-event.test.ts` "event not found" used `toBeTruthy()` (passes for any error). Changed to `toBe('Event not found')`. Added `toBe('Record not found')` to `register-for-permanent.test.ts` invalid route and inactive route tests.
2. **Registration fields not verified in DB.** Happy-path tests only selected `status, rider_id`. Added `share_registration`, `notes`, `team_name`, `is_team_captain` to DB queries with assertions matching input data.
3. **Email payload missing critical fields.** `assertEmailPayload` calls only checked `membershipStatus` and `registrantName`. Added `registrantEmail`, `eventName`, `eventDistance`, `eventLocation` to happy-path assertions across all three files.

**Deferred:**

1. **No test for incomplete-to-registered upgrade (upsert flow).** `createRegistrationRecord` uses `upsert` with `onConflict: 'event_id,rider_id'`. If a rider gets "incomplete: membership" and re-registers with valid membership, the status should upgrade. No test covers this. Add to Phase 4 or as a standalone addition.
2. **No test for email failure resilience.** The mock always resolves. No test verifies that registration succeeds when `sendRegistrationConfirmationEmail` rejects (the fire-and-forget `.catch()` pattern). If someone removed the `.catch()`, unhandled rejections in production would go undetected.
3. **`completeRegistrationWithRider` has no outer try/catch around `getMembershipForRider`.** The other two actions catch CCN errors and return `{ success: false, error: 'Registration failed' }`. This one lets the error propagate as an unhandled rejection. The test codifies this inconsistency with `rejects.toThrow()`. Production fix: add try/catch to match the other two actions.
4. **Membership caching not verified in registration tests.** After CCN lookup, `getMembershipForRider` caches results in the `memberships` table. No registration test verifies this row was created. Note: this is already covered by `membership-service.test.ts` ("fetches from CCN when not cached, caches in DB"), so risk is low.

---

## Phase 4: Strengthen Existing Assertions

Completed 2026-03-13. Added 24 assertions to existing mock-based integration tests across 4 files.

**4.1 Data shape assertions (14 additions):**

- `events.test.ts`: createEvent insert data, updateEvent update data (full + partial)
- `results.test.ts`: createResult insert data, null finish time, updateResult update data (full + partial)
- `riders.test.ts`: createRider insert data (with/without email), updateRider update data (with/without email)
- `routes.test.ts`: createRoute insert data, updateRoute update data, toggleRouteActive update data

**4.2 Email/side-effect verification (1 addition):**

- `events.test.ts`: updateEventStatus → completed verifies `createPendingResultsAndSendEmails` called with event data

**4.3 Cache revalidation verification (9 additions):**

- `events.test.ts`: createEvent, updateEvent, updateEventStatus verify `revalidatePath('/admin/events')`
- `results.test.ts`: createResult, updateResult, deleteResult verify `revalidatePath` called
- `routes.test.ts`: createRoute, updateRoute, toggleRouteActive verify `revalidatePath('/admin/routes')`

**Out of scope:** `register.test.ts` (success paths covered by Phase 3.1 integration-real), `manage-registration.test.ts` (mock infrastructure too thin), `rider-results.test.ts` (already reasonably strong)

## Phase 3.3: Event Status Transition Tests

Completed 2026-03-13. Added 5 tests to `tests/integration/actions/events.test.ts` covering status transition edge cases.

**`updateEventStatus` (2 new tests):**

- Re-completion (completed → completed) does NOT trigger `createPendingResultsAndSendEmails`
- Result deletion failure during cancellation returns error, does not update status

**`submitEventResults` (3 new tests):**

- Cancelled event rejected with correct error message
- Successful submission verifies `status: 'submitted'` written via `__calls` tracking
- Zero finishers (all DNF) still sends email and updates status

---

## What's Already Good

To be fair, several areas of the test suite are solid:

- `**tests/unit/lib/security.test.ts`\*\*: XSS prevention in email templates is thorough with real payloads
- `**tests/integration/error-handling.test.ts**`: Error propagation, Sentry integration, and user-friendly messages are well-tested
- `**tests/unit/components/registration-form.test.tsx**`: Good coverage of rendering, user interaction, localStorage, and error display
- `**tests/integration/actions/my-rides.test.ts**`: Actually verifies data transformation, sorting, and edge cases (null fields, cancelled events)
- `**tests/integration/api/complete-events.test.ts**`: Auth checks and BRM closing time calculations are correctly tested
- `**tests/unit/lib/fuzzy-match.test.ts**`, `**comparator.test.ts**`, `**matcher.test.ts**`: Pure function tests that genuinely verify algorithmic correctness

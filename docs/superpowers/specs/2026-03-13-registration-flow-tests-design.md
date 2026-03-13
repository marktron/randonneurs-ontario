# Registration Flow Integration Tests — Design Spec

## Goal

Add real-database integration tests for all three registration entry points (`registerForEvent`, `registerForPermanent`, `completeRegistrationWithRider`), covering happy paths, validation, edge cases, and email payloads. Mock only external services (SendGrid, CCN API, rider search). Target: ~38 tests across three files.

## Mocking Strategy

### Mocked (external services / internal functions with DB side effects we want to control)

- **SendGrid** (`@/lib/email/send-registration-email`) — mock `sendRegistrationConfirmationEmail`, assert on payload (membership status, rider name, event details, management URL). The real function is fire-and-forget (no `await`, `.catch()` only), so the mock should resolve synchronously to ensure it's been called before assertions.
- **CCN API** (`@/lib/ccn/client`) — mock `searchCCNMembership` to control membership found/not-found/error
- **Rider search** (`@/lib/actions/rider-match`) — mock `searchRiderCandidates` in all three test files. Without this mock, `findOrCreateRider` queries real DB for fuzzy name matches among riders without email, which could produce unpredictable `needsRiderMatch` results depending on local seed data. Default mock returns `{ candidates: [] }` (no matches) unless a specific test needs the match flow.

### Not mocked (hit real local Supabase)

- All database operations: riders, events, routes, registrations, results, memberships, rider_merges
- Next.js `unstable_cache`, `revalidatePath` — already pass-through in `setup.ts`
- React `cache` — already pass-through in `setup.ts`

### Note on `'use server'`

The registration functions are declared in a `'use server'` module. In Node/Vitest this directive is ignored (it's a bundler hint for Next.js). Tests call the functions directly as regular async functions.

### Mock setup pattern

```typescript
vi.mock('@/lib/email/send-registration-email')
vi.mock('@/lib/ccn/client')
vi.mock('@/lib/actions/rider-match')

// In beforeAll:
const emailMod = await import('@/lib/email/send-registration-email')
sendEmail = vi.mocked(emailMod.sendRegistrationConfirmationEmail)

const ccnMod = await import('@/lib/ccn/client')
searchCCNMembership = vi.mocked(ccnMod.searchCCNMembership)

const matchMod = await import('@/lib/actions/rider-match')
searchRiderCandidates = vi.mocked(matchMod.searchRiderCandidates)
searchRiderCandidates.mockResolvedValue({ candidates: [] }) // default: no fuzzy matches
```

## File Structure

```
tests/integration-real/registration/
  helpers.ts                         — shared data builders, email assertion helper
  register-for-event.test.ts        — ~15 tests
  register-for-permanent.test.ts    — ~12 tests
  complete-registration.test.ts     — ~10 tests
```

### UUID Ranges

Each file gets an isolated UUID prefix to avoid collisions:

| File                             | Prefix | Range                                                    |
| -------------------------------- | ------ | -------------------------------------------------------- |
| `register-for-event.test.ts`     | `1a20` | `00000000-1a20-4000-a000-000000000001` through `...0020` |
| `register-for-permanent.test.ts` | `1a21` | `00000000-1a21-4000-a000-000000000001` through `...0020` |
| `complete-registration.test.ts`  | `1a22` | `00000000-1a22-4000-a000-000000000001` through `...0020` |

Non-overlapping with membership tests (`1a10`) and E2E tests (`e2e0`).

### Shared Helper: `helpers.ts`

- `buildRegistrationData(overrides)` — constructs a `RegistrationData` typed object with sensible defaults (first name, last name, email, eventId, etc.)
- `buildPermanentRegistrationData(overrides)` — constructs a `PermanentRegistrationData` typed object with defaults including `direction: 'as_posted'`, `startTime: '08:00'`, `eventDate` (30 days from now)
- `buildCompleteRegistrationData(overrides)` — constructs a `CompleteRegistrationData` typed object
- `assertEmailPayload(mock, expected)` — extracts call args from mocked `sendRegistrationConfirmationEmail`, asserts key fields (rider name, event name, membership status, management URL pattern)

### Lifecycle per File

- `beforeAll`: clean up leftover data (idempotent), seed route/events/riders
- `afterEach`: clean up registrations, results, memberships, rider_merges created during that test; reset all mocks
- `afterAll`: tear down all seeded entities in reverse dependency order

### Shared Seed Entities

All three files reuse the Toronto chapter (`ad83d0b9-4d25-472b-9d3e-5732730d761c`) from seed data.

Each file seeds its own:

- Rider(s)
- Route
- Event(s) as needed (scheduled, completed)

## Test Cases

### `register-for-event.test.ts` (~15 tests)

**Happy path (membership found):**

1. Registers with valid membership — `success: true`, DB status `'registered'`, email with `membershipStatus: 'valid'`

**Membership not found (incomplete flow):** 2. CCN returns not-found — `success: false, membershipError: 'no-membership'`, DB status `'incomplete: membership'`, email sent with `membershipStatus: 'none'`

**Trial used (incomplete flow):** 3. Trial member with trial already used — `success: false, membershipError: 'trial-used'`, DB status `'incomplete: membership'`, email with `membershipStatus: 'trial-used'`

**CCN API error:** 4. `searchCCNMembership` throws — returns `{ success: false, error: 'Registration failed' }`, no registration record created (error caught in outer try/catch at line 568)

**Rider match flow:** 5. `searchRiderCandidates` returns candidates — returns `{ success: false, needsRiderMatch: true, matchCandidates: [...] }`, no registration created yet

**Validation and edge cases:** 6. Duplicate registration — returns error, no second registration created 7. Event not found — returns error 8. Completed event — returns error (`'Registration is not open for this event'`) 9. Missing required fields — returns `'Missing required fields'` 10. Duplicate team name (captain) — returns team name error

**Rider creation:** 11. New rider created when no email match and no fuzzy matches — rider record in DB with correct slug 12. Existing rider found by email — reuses rider, creates rider_merges audit entry, no duplicate

**Email payload assertions (covered in happy path and incomplete flow tests):**

- Management URL contains valid UUID pattern
- Email includes event name, date, distance
- Email includes rider name

### `register-for-permanent.test.ts` (~12 tests)

**Happy path:**

1. Registers with valid route and future date (>=14 days) — event created dynamically, registration created, email sent
2. Second registration for same route+date — reuses existing event, creates new registration

**Validation:** 3. Date less than 14 days in future — returns error (boundary: use `today + 13 days` to test) 4. Invalid route ID — returns error (`'Record not found'` via `handleSupabaseError` PGRST116 path) 5. Inactive route (`is_active: false`) — returns same error as invalid route (`'Record not found'`)

**Event creation:** 6. Creates event with correct slug pattern (`permanent-{route.slug}-{date}`), distance from route, chapter from route 7. Reuses existing event when route+date match (slug is `permanent-{route.slug}-{date}`, direction is NOT part of slug)

**Membership flow (same patterns as brevet):** 8. Valid membership — `success: true`, `'registered'` 9. No membership — `success: false, membershipError: 'no-membership'`, `'incomplete: membership'` 10. Trial used — `success: false, membershipError: 'trial-used'`, `'incomplete: membership'`

**Direction:** 11. Reversed direction — event name includes "(Reversed)" when event is first created for that route+date. If event already exists (created by prior as_posted registration), the existing event is reused (same slug). Test: verify event name when creating fresh event with `direction: 'reversed'`.

**Duplicate registration:** 12. Already registered for the same permanent ride — returns `'You are already registered for this event'`

### `complete-registration.test.ts` (~10 tests)

**Update existing rider flow:**

1. `selectedRiderId` provided — updates rider email/name/gender, creates registration, `success: true`
2. Audit log entry in `rider_merges` table with correct before/after fields

**Create new rider flow:** 3. `selectedRiderId` is null — creates new rider with correct slug, registration created

**Membership handling:** 4. Valid membership after rider selection — `'registered'`, email with `membershipStatus: 'valid'` 5. No membership — `'incomplete: membership'`, email with `membershipStatus: 'none'` 6. CCN error — `getMembershipForRider` throws, function has no outer try/catch so error propagates as unhandled rejection. Test with `expect(...).rejects.toThrow()`. (Note: this is arguably a production bug — `registerForEvent` and `registerForPermanent` both have outer try/catch but `completeRegistrationWithRider` does not. Consider adding one as a follow-up fix.)

**Validation:** 7. Event not found — returns error 8. Event not scheduled (completed) — returns `'Registration is not open for this event'` 9. Selected rider not found (invalid `selectedRiderId`) — returns `'Selected rider not found'` 10. Missing required fields — returns `'Missing required fields'`

## Infrastructure

Reuses the existing `integration-real` infrastructure:

- `vitest.config.integration-real.mts` — already includes `tests/integration-real/**/*.test.ts`
- `tests/integration-real/setup.ts` — dotenv loading, Next.js/React cache mocks
- `tests/integration-real/helpers/supabase.ts` — `getTestSupabase()`, `checked()`
- `npm run test:integration-real` — already configured

No new dependencies needed.

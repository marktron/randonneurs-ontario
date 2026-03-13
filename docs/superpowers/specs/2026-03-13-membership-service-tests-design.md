# Phase 3.2: Membership Service Tests

## Context

The membership service (`lib/memberships/service.ts`) is a critical business gate — it determines whether riders can register for events. The test suite audit (Finding #6) identified that the current tests only verify the module exports functions. Zero behavioral coverage exists for:

- Database-cached membership lookup
- CCN API integration and caching
- Trial membership usage detection
- Error propagation from external API

**Current test file** (`tests/unit/lib/membership-service.test.ts`): 3 tests that check `typeof fn === 'function'`.

## Design Decisions

1. **Real Supabase, mock CCN** — The membership service queries `memberships`, `results`, and `registrations` tables with specific filters and joins. Mocking Supabase would recreate the mock void identified in audit Finding #1. The CCN API is external and uncontrolled, so it must be mocked.

2. **Separate directory** (`tests/integration-real/`) — These tests require a running Supabase instance, unlike mock-based integration tests. A separate directory makes the runtime requirement explicit and allows running them independently.

3. **Per-file data ownership** — Each test file seeds its own data in `beforeAll` and cleans up in `afterAll` using deterministic UUIDs. No coupling to E2E seed data.

## Infrastructure

### New Vitest Config: `vitest.config.integration-real.mts`

A separate config for real-DB tests:

- Matches `tests/integration-real/**/*.test.ts`
- Uses a setup file that loads real env vars via `@next/env loadEnvConfig(cwd(), true)`
- `testTimeout: 30000` (real DB is slower than mocks)
- `hookTimeout: 30000` (setup/teardown seed real data)
- Does NOT use the existing `tests/setup.ts` (which sets fake env vars and mocks Supabase)

### Setup File: `tests/integration-real/setup.ts`

- Loads `.env.development.local` via `@next/env`
- Mocks `next/cache` (pass-through, same as existing setup)
- Mocks `react` cache (pass-through)
- Does NOT mock `@/lib/supabase-server` — the real admin client is used
- Does NOT set fake env vars — real values come from env files

### Helper: `tests/integration-real/helpers/supabase.ts`

Exports:

- `getTestSupabase()` — creates a Supabase admin client for direct data setup/teardown
- `checked<T>(operation, label)` — same error-throwing wrapper pattern from E2E setup

### npm script

Add `"test:integration-real": "vitest run --config vitest.config.integration-real.mts"` to `package.json`.

### Module isolation

These tests run in a separate Vitest process (via separate config) to avoid the module-level Supabase singleton being initialized with fake env vars from the main test setup. The main `vitest.config.mts` already excludes these tests by accident of naming (`tests/integration/**` does not match `tests/integration-real/`), but we add `tests/integration-real` to the main config's `exclude` array explicitly for safety.

## Test Data

### Deterministic UUIDs (non-overlapping with E2E `00000000-e2e0-*` range)

Uses hex prefix `1a10` (valid UUID hex, distinct from E2E `e2e0`).

| Entity           | UUID                                   |
| ---------------- | -------------------------------------- |
| rider            | `00000000-1a10-4000-a000-000000000001` |
| route            | `00000000-1a10-4000-a000-000000000002` |
| completedEvent   | `00000000-1a10-4000-a000-000000000003` |
| scheduledEvent   | `00000000-1a10-4000-a000-000000000004` |
| finishedResult   | `00000000-1a10-4000-a000-000000000005` |
| dnsResult        | `00000000-1a10-4000-a000-000000000006` |
| registration     | `00000000-1a10-4000-a000-000000000007` |
| membership       | `00000000-1a10-4000-a000-000000000008` |
| pendingResult    | `00000000-1a10-4000-a000-000000000009` |
| dnfResult        | `00000000-1a10-4000-a000-00000000000a` |
| pastRegistration | `00000000-1a10-4000-a000-00000000000b` |

### Setup (beforeAll)

Explicitly set `process.env.NEXT_PUBLIC_CURRENT_SEASON = '2026'` in `beforeAll` so tests are deterministic regardless of env file contents.

Seed in dependency order (all NOT NULL columns included):

1. Rider: `{ id, first_name: 'IntTest', last_name: 'Rider', slug: 'inttest-rider' }`
2. Route: `{ id, slug: 'inttest-route', name: 'IntTest Route', chapter_id: TORONTO_CHAPTER_ID, distance_km: 200, is_active: true }`
3. Completed event: `{ id, slug: 'inttest-completed-200km-...', name: 'IntTest Completed', chapter_id: TORONTO_CHAPTER_ID, route_id, event_type: 'brevet', distance_km: 200, event_date: pastDate, status: 'completed' }`
4. Scheduled event: `{ id, slug: 'inttest-scheduled-200km-...', name: 'IntTest Scheduled', chapter_id: TORONTO_CHAPTER_ID, route_id, event_type: 'brevet', distance_km: 200, event_date: futureDate, status: 'scheduled' }`

### Teardown (afterAll)

Delete in reverse dependency order: memberships → results → registrations → events → route → rider.

### Per-group cleanup

- `getMembershipForRider` tests: `afterEach` deletes all memberships for the test rider
- `isTrialUsed` tests: `afterEach` deletes all results and registrations for the test rider

## Test Cases

### `getMembershipForRider` (6 tests)

CCN client is mocked via `vi.mock('@/lib/ccn/client')` at the top of the test file. Each test configures the mock return value as needed.

**Test 1: returns cached membership from DB**

- Setup: Insert membership row `{ rider_id, season: 2026, membership_id: 42, type: 'Individual Membership' }`
- Act: Call `getMembershipForRider(riderId, 'IntTest', 'Rider')`
- Assert: Returns `{ found: true, membershipId: 42, type: 'Individual Membership' }`
- Assert: `searchCCNMembership` was NOT called (DB cache hit)

**Test 2: fetches from CCN when not cached, caches in DB**

- Setup: No membership row exists. Mock `searchCCNMembership` → `{ found: true, membershipId: 99, type: 'Individual Membership' }`
- Act: Call `getMembershipForRider(riderId, 'IntTest', 'Rider')`
- Assert: Returns `{ found: true, membershipId: 99, type: 'Individual Membership' }`
- Assert: `searchCCNMembership` was called with `('IntTest', 'Rider')`
- Assert: Query `memberships` table — row exists with `rider_id`, `season: 2026`, `membership_id: 99`

**Test 3: second call uses DB cache, not CCN**

- Setup: Mock `searchCCNMembership` → `{ found: true, membershipId: 99, type: 'Individual Membership' }`
- Act: Call `getMembershipForRider` twice for the same rider
- Assert: `searchCCNMembership` was called exactly once (first call)
- Assert: Second call returns same result from DB cache

**Test 4: returns found:false when CCN has no match**

- Setup: No membership row. Mock `searchCCNMembership` → `{ found: false }`
- Act: Call `getMembershipForRider(riderId, 'IntTest', 'Rider')`
- Assert: Returns `{ found: false }`
- Assert: Query `memberships` table — no row inserted

**Test 5: propagates CCN API error**

- Setup: No membership row. Mock `searchCCNMembership` → throws `Error('CCN API error: 500')`
- Act: Call `getMembershipForRider(riderId, 'IntTest', 'Rider')`
- Assert: Rejects with error matching 'CCN API error'
- Assert: Query `memberships` table — no row inserted

**Test 6: throws when CCN_ENDPOINT not set**

- Setup: No membership row. Mock `searchCCNMembership` → throws `Error('CCN_ENDPOINT environment variable not set')`
- Act: Call `getMembershipForRider(riderId, 'IntTest', 'Rider')`
- Assert: Rejects with error matching 'CCN_ENDPOINT'
- Note: This tests error propagation from CCN client, not the env var check itself (which is tested in `ccn-client.test.ts`)

### `isTrialUsed` (7 tests)

**Test 7: returns true when rider has finished result**

- Setup: Insert result `{ rider_id, event_id: completedEvent, status: 'finished', season: 2026, distance_km: 200 }`
- Act: Call `isTrialUsed(riderId)`
- Assert: Returns `true`

**Test 8: returns true when rider has DNF result**

- Setup: Insert result `{ rider_id, event_id: completedEvent, status: 'dnf', season: 2026, distance_km: 200 }`
- Act: Call `isTrialUsed(riderId)`
- Assert: Returns `true`
- Rationale: Verifies the `.in('status', ['finished', 'dnf', 'otl', 'dq'])` filter includes non-finished counting statuses

**Test 9: returns true when rider has upcoming registration**

- Setup: Insert registration `{ rider_id, event_id: scheduledEvent, status: 'registered' }`
- Act: Call `isTrialUsed(riderId)`
- Assert: Returns `true`

**Test 10: returns false when rider has no results or registrations**

- Setup: No results or registrations for rider
- Act: Call `isTrialUsed(riderId)`
- Assert: Returns `false`

**Test 11: returns false when rider has only DNS result**

- Setup: Insert result `{ rider_id, event_id: completedEvent, status: 'dns', season: 2026, distance_km: 200 }`
- Act: Call `isTrialUsed(riderId)`
- Assert: Returns `false`

**Test 12: returns false when rider has only pending result**

- Setup: Insert result `{ rider_id, event_id: completedEvent, status: 'pending', season: 2026, distance_km: 200 }`
- Act: Call `isTrialUsed(riderId)`
- Assert: Returns `false`
- Rationale: `pending` is the default status before results are submitted; must not count as trial usage

**Test 13: returns false when rider has registration for past event only**

- Setup: Insert registration `{ rider_id, event_id: completedEvent, status: 'registered' }` (completedEvent has a past date)
- Act: Call `isTrialUsed(riderId)`
- Assert: Returns `false`
- Rationale: Verifies the `gte('events.event_date', today)` filter excludes past events

## Files Changed

| File                                                            | Action                                      |
| --------------------------------------------------------------- | ------------------------------------------- |
| `vitest.config.integration-real.mts`                            | CREATE                                      |
| `tests/integration-real/setup.ts`                               | CREATE                                      |
| `tests/integration-real/helpers/supabase.ts`                    | CREATE                                      |
| `tests/integration-real/memberships/membership-service.test.ts` | CREATE                                      |
| `package.json`                                                  | MODIFY (add `test:integration-real` script) |
| `docs/test-suite-audit.md`                                      | MODIFY (mark Phase 3.2 complete)            |

No changes to application code. Existing tests are unaffected.

## Out of Scope

- Testing the registration action's membership integration (Phase 3.1)
- Testing membership display in admin UI
- Testing email content for membership warnings
- Replacing the existing `tests/unit/lib/membership-service.test.ts` (it can stay — it's harmless)

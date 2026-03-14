# Phase 3.3: Event Status Transition Tests

Date: 2026-03-13

## Goal

Add 5 tests to the existing mock-based `tests/integration/actions/events.test.ts` to cover event status transition edge cases and side-effect verification gaps.

## Scope

All changes go into the existing `events.test.ts` file, inside the existing `describe('updateEventStatus')` and `describe('submitEventResults')` blocks. No new files.

## Existing Coverage

**`updateEventStatus` (3 tests):**

- Event not found → error
- Scheduled → completed → `createPendingResultsAndSendEmails` called
- Scheduled → cancelled → results deleted

**`submitEventResults` (5 tests):**

- Event not found → error
- Already submitted → error
- Not completed (scheduled) → error
- Brevet → email with XLSX attachment
- Permanent → no email

## New Tests

### Test 1: Re-completion does NOT trigger pending result creation

**What it tests:** `updateEventStatus('event-1', 'completed')` when event is already `status: 'completed'`. The guard at `register.ts:384` checks `typedEvent.status === 'scheduled'` — only that transition triggers `createPendingResultsAndSendEmails`.

**Why it matters:** Without this test, someone could remove the `&& typedEvent.status === 'scheduled'` guard and pending results would be created twice, sending duplicate emails to riders.

**Mock setup:**

- `__mockEventFound` with `status: 'completed'` (not `'scheduled'`)
- `__mockUpdateSuccess`
- `__mockEventFound` for revalidation

**Assertions:**

- `result.success` is `true` (transition is valid)
- `createPendingResultsAndSendEmails` was NOT called

### Test 2: Result deletion failure during cancellation returns error

**What it tests:** When the results delete query fails during a `→ cancelled` transition.

**Why it matters:** If result deletion fails silently, we'd cancel the event but leave orphan results in the database. The production code returns an error and does NOT proceed with the status update.

**Mock setup:**

- The mock infrastructure needs to simulate a delete failure. The `delete` method goes through the chainable builder, so we need `__queryBuilder.then` to resolve with an error for the delete step. Use `mockImplementationOnce` on `__queryBuilder.then` to resolve `{ data: null, error: { message: 'FK constraint' } }`.

**Assertions:**

- `result.success` is `false`
- `result.error` is `'Failed to delete results'`
- No `update` call on the `events` table (status was not changed)

### Test 3: Cancelled event cannot have results submitted

**What it tests:** `submitEventResults` when event status is `'cancelled'`.

**Why it matters:** The existing test covers `scheduled` → error, but `cancelled` is a distinct state that should also be rejected. Verifies the guard isn't accidentally checking only for `scheduled`.

**Mock setup:**

- `__mockEventFound` with `status: 'cancelled'`

**Assertions:**

- `result.success` is `false`
- `result.error` is `'Only completed events can have results submitted'`

### Test 4: Submit verifies status updated to 'submitted'

**What it tests:** After a successful `submitEventResults`, verify the `update` call on the events table sets `status: 'submitted'`.

**Why it matters:** The existing test checks `result.success === true` and the email attachment, but never verifies the status was actually written. If someone removed the status update, the test would still pass.

**Mock setup:** Same as the existing "sends email with spreadsheet attachment" test — completed brevet event with results. Plus `__mockUpdateSuccess` for the status update step.

**Assertions:**

- `result.success` is `true`
- `__calls` includes an `update` on `events` table
- The update data contains `status: 'submitted'`

### Test 5: Submit with no finished riders still succeeds

**What it tests:** `submitEventResults` when all riders are DNF/DNS (no `finished` results).

**Why it matters:** The production code filters to only `status === 'finished' && finish_time`. With zero finishers, the email body says "No finishers recorded." and the spreadsheet has zero rows. The event should still transition to `submitted`. Without this test, someone could add a guard like `if (finishedResults.length === 0) return error` and break the workflow.

**Mock setup:**

- `__mockEventFound` with completed brevet event
- Results query returns riders with `status: 'dnf'` (no `finished`)
- `__mockUpdateSuccess` for status update
- `__mockEventFound` for revalidation

**Assertions:**

- `result.success` is `true`
- Email was still sent (sendgrid.send called)
- `__calls` includes `update` on `events` with `status: 'submitted'`

## Notes

- All tests use the existing `__calls`, `__mockEventFound`, `__mockUpdateSuccess` infrastructure
- Test 2 requires using `__queryBuilder.then.mockImplementationOnce` directly to simulate a delete error (the existing `__mockUpdateError` won't work because it affects the next `.then()` call, and we need to target the delete specifically)
- Access mocked modules via `await import(...)` pattern (same as existing tests)

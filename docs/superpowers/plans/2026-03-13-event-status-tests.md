# Phase 3.3: Event Status Transition Tests — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 tests to `events.test.ts` covering event status transition edge cases and side-effect verification gaps.

**Architecture:** All tests are additions to existing `describe` blocks in a single file. Uses the existing `__calls` tracking and `__mock*` helpers. No new files or infrastructure.

**Tech Stack:** Vitest, custom mock infrastructure with `__calls` tracking

---

## Chunk 1: All 5 tests + verification

### Task 1: Add event status transition tests

**Files:**

- Modify: `tests/integration/actions/events.test.ts`

**Spec:** `docs/superpowers/specs/2026-03-13-event-status-tests-design.md`

**Context for implementer:**

The file has a custom mock system:

- `mockModule.__calls` — array of `{ table, method, args }` recording every Supabase operation
- `mockModule.__mockEventFound(data)` — makes the next `.single()` call return `{ data, error: null }`
- `mockModule.__mockUpdateSuccess()` — makes the next `.then()` call resolve with `{ data: null, error: null }`
- `mockModule.__queryBuilder.then.mockImplementationOnce(fn)` — directly control the next `.then()` resolution (used for results queries and delete operations)
- Access mocked modules via `const { x } = await import('...')` pattern

The existing `describe('updateEventStatus')` block is at ~line 543. The existing `describe('submitEventResults')` block is at ~line 195.

- [ ] **Step 1: Add Test 1 — re-completion does NOT trigger pending result creation**

Add this test inside `describe('updateEventStatus')`, after the existing "updates status to cancelled successfully" test (~line 624):

```typescript
it('re-completing an already completed event does not trigger pending result creation', async () => {
  mockModule.__mockEventFound({
    id: 'event-1',
    name: 'Test Event',
    event_date: '2025-06-15',
    distance_km: 200,
    chapter_id: 'chapter-1',
    event_type: 'brevet',
    status: 'completed', // Already completed — not 'scheduled'
    chapters: { name: 'Toronto' },
  })
  mockModule.__mockUpdateSuccess()
  mockModule.__mockEventFound({ slug: 'toronto' }) // For revalidation

  const result = await updateEventStatus('event-1', 'completed')

  expect(result.success).toBe(true)

  // createPendingResultsAndSendEmails should NOT be called
  // (only triggered when transitioning from 'scheduled' to 'completed')
  const { createPendingResultsAndSendEmails } = await import('@/lib/events/complete-event')
  expect(createPendingResultsAndSendEmails).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Add Test 2 — result deletion failure during cancellation**

Add this test inside `describe('updateEventStatus')`, after Test 1:

```typescript
it('returns error when result deletion fails during cancellation', async () => {
  // Mock delete to return an error (the first .then() call is the delete operation)
  mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
    resolve({ data: null, error: { message: 'FK constraint' } })
  })

  const result = await updateEventStatus('event-1', 'cancelled')

  expect(result.success).toBe(false)
  expect(result.error).toBe('Failed to delete results')

  // Status should NOT have been updated
  const updateCalls = mockModule.__calls.filter(
    (c) => c.table === 'events' && c.method === 'update'
  )
  expect(updateCalls).toHaveLength(0)
})
```

- [ ] **Step 3: Add Test 3 — cancelled event cannot have results submitted**

Add this test inside `describe('submitEventResults')`, after the existing "returns error when event status is not completed" test (~line 237):

```typescript
it('returns error when event status is cancelled', async () => {
  mockModule.__mockEventFound({
    id: 'test-event-id',
    status: 'cancelled',
    name: 'Test Event',
    event_date: '2025-01-15',
    chapters: { name: 'Toronto' },
  })

  const result = await submitEventResults('test-event-id')

  expect(result.success).toBe(false)
  expect(result.error).toBe('Only completed events can have results submitted')
})
```

- [ ] **Step 4: Add Test 4 — submit verifies status updated to 'submitted'**

Add this test inside `describe('submitEventResults')`, after the existing "does not send email for permanent events" test (~line 338):

```typescript
it('updates event status to submitted after successful email', async () => {
  mockModule.__mockEventFound({
    id: 'test-event-id',
    status: 'completed',
    event_type: 'brevet',
    name: 'Test Event',
    event_date: '2025-01-15',
    distance_km: 200,
    chapters: { name: 'Toronto' },
  })

  // Mock results query
  mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
    resolve({
      data: [
        {
          riders: { first_name: 'John', last_name: 'Doe', gender: 'M' },
          status: 'finished',
          finish_time: '10:30:00',
          note: null,
        },
      ],
      error: null,
    })
  })

  // Mock the status update
  mockModule.__mockUpdateSuccess()

  // Mock chapter query for revalidation
  mockModule.__mockEventFound({ slug: 'toronto' })

  process.env.SENDGRID_API_KEY = 'test-key'
  const result = await submitEventResults('test-event-id')
  delete process.env.SENDGRID_API_KEY

  expect(result.success).toBe(true)

  // Verify status was updated to 'submitted' on the events table
  const updateCalls = mockModule.__calls.filter(
    (c) => c.table === 'events' && c.method === 'update'
  )
  expect(updateCalls.length).toBeGreaterThanOrEqual(1)
  const updateData = updateCalls[0].args![0]
  expect(updateData).toMatchObject({ status: 'submitted' })
})
```

- [ ] **Step 5: Add Test 5 — submit with no finished riders still succeeds**

Add this test inside `describe('submitEventResults')`, after Test 4:

```typescript
it('succeeds with no finished riders — email sent with zero finishers', async () => {
  mockModule.__mockEventFound({
    id: 'test-event-id',
    status: 'completed',
    event_type: 'brevet',
    name: 'Test Event',
    event_date: '2025-01-15',
    distance_km: 200,
    chapters: { name: 'Toronto' },
  })

  // Mock results query — all DNF, no finished riders
  mockModule.__queryBuilder.then.mockImplementationOnce((resolve) => {
    resolve({
      data: [
        {
          riders: { first_name: 'John', last_name: 'Doe', gender: 'M' },
          status: 'dnf',
          finish_time: null,
          note: null,
        },
      ],
      error: null,
    })
  })

  // Mock the status update
  mockModule.__mockUpdateSuccess()

  // Mock chapter query for revalidation
  mockModule.__mockEventFound({ slug: 'toronto' })

  process.env.SENDGRID_API_KEY = 'test-key'
  const result = await submitEventResults('test-event-id')
  delete process.env.SENDGRID_API_KEY

  expect(result.success).toBe(true)

  // Email should still be sent (with "No finishers recorded.")
  const { sendgrid } = await import('@/lib/email/sendgrid')
  expect(sendgrid.send).toHaveBeenCalledTimes(1)

  // Status should still be updated to 'submitted'
  const updateCalls = mockModule.__calls.filter(
    (c) => c.table === 'events' && c.method === 'update'
  )
  expect(updateCalls.length).toBeGreaterThanOrEqual(1)
  const updateData = updateCalls[0].args![0]
  expect(updateData).toMatchObject({ status: 'submitted' })
})
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/integration/actions/events.test.ts`
Expected: All tests pass (existing 19-20 + 5 new = 24-25 total).

- [ ] **Step 7: Commit**

```bash
git add tests/integration/actions/events.test.ts
git commit -m "test: add event status transition edge case tests (Phase 3.3)"
```

### Task 2: Update audit doc

**Files:**

- Modify: `docs/test-suite-audit.md`

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Mark Phase 3.3 complete in priority table**

Change:

```
| 7        | 3.3          |            | Event status transition tests                         |
```

To:

```
| 7        | 3.3          | Yes        | Event status transition tests                         |
```

- [ ] **Step 3: Add Phase 3.3 section after Phase 4**

Add after the Phase 4 section, before "## What's Already Good":

```markdown
## Phase 3.3: Event Status Transition Tests

Completed 2026-03-13. Added 5 tests to `tests/integration/actions/events.test.ts` covering status transition edge cases.

**`updateEventStatus` (2 new tests):**

- Re-completion (completed → completed) does NOT trigger `createPendingResultsAndSendEmails`
- Result deletion failure during cancellation returns error, does not update status

**`submitEventResults` (3 new tests):**

- Cancelled event rejected with correct error message
- Successful submission verifies `status: 'submitted'` written via `__calls` tracking
- Zero finishers (all DNF) still sends email and updates status
```

- [ ] **Step 4: Commit**

```bash
git add docs/test-suite-audit.md
git commit -m "docs: mark Phase 3.3 complete in test-suite-audit.md"
```

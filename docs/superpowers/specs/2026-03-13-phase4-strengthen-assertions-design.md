# Phase 4: Strengthen Existing Mock-Based Test Assertions

Date: 2026-03-13

## Goal

Add ~25 assertions to existing mock-based integration tests so they verify what data was written and what side effects occurred, not just `success: true/false`.

## Scope

**In scope:** 5 test files that already have `__calls` tracking infrastructure from Phase 1.1:

- `tests/integration/actions/events.test.ts` (16 tests, 5 need strengthening)
- `tests/integration/actions/results.test.ts` (14 tests, 4 need strengthening)
- `tests/integration/actions/riders.test.ts` (15 tests, 4 need strengthening)
- `tests/integration/actions/routes.test.ts` (11 tests, 4 need strengthening)
- `tests/integration/actions/rider-results.test.ts` (10 tests — already reasonably strong, skip)

**Out of scope:**

- `tests/integration/actions/register.test.ts` — validation-only tests; success paths covered by Phase 3.1 integration-real tests
- `tests/integration/actions/manage-registration.test.ts` — validation-only tests; mock infrastructure too thin for success-path assertions; candidate for future integration-real coverage

## Approach

All changes are assertion additions inside existing `it()` blocks. No new tests, no new files, no mock infrastructure changes.

The `__calls` array captures `{ table, method, args }` for every Supabase operation. For `insert(data)`, `args[0]` is the data object. For `update(data)`, same. This lets us assert on the actual data passed to Supabase.

## 4.1: Data Shape Assertions (~14 additions)

### events.test.ts

**"returns success with event id when creation succeeds" (line ~402)**

```typescript
// After existing insertCalls assertion
const insertData = insertCalls[0].args![0]
expect(insertData).toMatchObject({
  name: 'Test Brevet',
  event_type: 'brevet',
  distance_km: 200,
  event_date: '2025-06-15',
  start_time: '08:00',
  start_location: 'Toronto',
})
expect(insertData.slug).toBeDefined()
```

**"updates event successfully" (line ~456)**

```typescript
// After existing updateCalls assertion
const updateData = updateCalls[0].args![0]
expect(updateData).toMatchObject({
  name: 'Updated Name',
  start_time: '09:00',
})
```

**"handles partial updates" (line ~478)**

```typescript
// After existing updateCalls assertion
const updateData = updateCalls[0].args![0]
expect(updateData).toMatchObject({
  start_location: 'New Location',
})
// Should not contain fields that weren't submitted
expect(updateData.name).toBeUndefined()
```

### results.test.ts

**"creates result successfully when no duplicate" (line ~168)**

```typescript
// After existing insertCalls assertion
const insertData = insertCalls[0].args![0]
expect(insertData).toMatchObject({
  event_id: 'event-1',
  rider_id: 'rider-1',
  status: 'finished',
  finish_time: '13:30',
  season: 2025,
  distance_km: 200,
})
```

**"allows null finish time for non-finished statuses" (line ~214)**

```typescript
// After existing insertCalls assertion
const insertData = insertCalls[0].args![0]
expect(insertData.status).toBe('dnf')
expect(insertData.finish_time).toBeNull()
```

**"updates result successfully" (line ~248)**

```typescript
// After existing updateCalls assertion
const updateData = updateCalls[0].args![0]
expect(updateData).toMatchObject({
  status: 'finished',
  finish_time: '14:00',
})
```

**"handles partial updates" (line ~272)**

Test passes only `{ finishTime: '14:00' }`. Production code always sets `finish_time`, `status`, `team_name`, `note` on the update object (even if undefined).

```typescript
// After existing updateCalls assertion
const updateData = updateCalls[0].args![0]
expect(updateData.finish_time).toBe('14:00')
expect(updateData.status).toBeUndefined()
```

### riders.test.ts

**"creates rider successfully without email" (line ~228)**

Test passes `{ firstName: 'John', lastName: 'Doe' }`.

```typescript
const insertCalls = mockModule.__calls.filter((c) => c.table === 'riders' && c.method === 'insert')
expect(insertCalls).toHaveLength(1)
const insertData = insertCalls[0].args![0]
expect(insertData.first_name).toBe('John')
expect(insertData.last_name).toBe('Doe')
expect(insertData.slug).toBeDefined()
```

**"creates rider successfully with email" (line ~247)**

Test passes `{ firstName: 'John', lastName: 'Doe', email: 'john@example.com' }`.

```typescript
const insertCalls = mockModule.__calls.filter((c) => c.table === 'riders' && c.method === 'insert')
expect(insertCalls).toHaveLength(1)
const insertData = insertCalls[0].args![0]
expect(insertData.email).toBe('john@example.com')
```

**"updates rider without email" (line ~369)**

Test passes `{ firstName: 'John', lastName: 'Doe', email: null }`.

```typescript
const updateCalls = mockModule.__calls.filter((c) => c.table === 'riders' && c.method === 'update')
expect(updateCalls).toHaveLength(1)
const updateData = updateCalls[0].args![0]
expect(updateData.first_name).toBe('John')
```

**"updates rider with email when no duplicate exists" (line ~385)**

Test passes `{ firstName: 'John', lastName: 'Doe', email: 'john@example.com' }`.

```typescript
const updateCalls = mockModule.__calls.filter((c) => c.table === 'riders' && c.method === 'update')
expect(updateCalls).toHaveLength(1)
const updateData = updateCalls[0].args![0]
expect(updateData.email).toBe('john@example.com')
```

### routes.test.ts

**"creates route with provided slug" (line ~178)**

Test passes `{ name: 'Test Route Name', slug: 'test-route-name' }` (no distanceKm).

```typescript
const insertCalls = mockModule.__calls.filter((c) => c.table === 'routes' && c.method === 'insert')
expect(insertCalls).toHaveLength(1)
const insertData = insertCalls[0].args![0]
expect(insertData).toMatchObject({
  name: 'Test Route Name',
  slug: 'test-route-name',
})
```

**"updates route successfully" (line ~286)**

Test passes `{ name: 'Updated Name' }`.

```typescript
const updateCalls = mockModule.__calls.filter((c) => c.table === 'routes' && c.method === 'update')
expect(updateCalls).toHaveLength(1)
const updateData = updateCalls[0].args![0]
expect(updateData.name).toBe('Updated Name')
```

**"toggles route active status" (line ~370)**

```typescript
const updateCalls = mockModule.__calls.filter((c) => c.table === 'routes' && c.method === 'update')
expect(updateCalls).toHaveLength(1)
const updateData = updateCalls[0].args![0]
expect(updateData.is_active).toBeDefined()
```

## 4.2: Email/Side-Effect Verification (~1 addition)

### events.test.ts

**"updates status to completed successfully" (line ~528)**

The production code calls `createPendingResultsAndSendEmails` when transitioning to "completed". This is already mocked but never asserted.

```typescript
import { createPendingResultsAndSendEmails } from '@/lib/events/complete-event'

// After existing assertions
expect(createPendingResultsAndSendEmails).toHaveBeenCalledTimes(1)
expect(createPendingResultsAndSendEmails).toHaveBeenCalledWith(
  expect.objectContaining({
    id: 'event-1',
    name: 'Test Event',
  })
)
```

## 4.3: Cache Revalidation Verification (~9 additions)

Import `revalidatePath` from the mock and assert it was called in success tests.

### events.test.ts (3 assertions)

- `createEvent` success: `expect(revalidatePath).toHaveBeenCalledWith('/admin/events')`
- `updateEvent` success: `expect(revalidatePath).toHaveBeenCalledWith('/admin/events')`
- `updateEventStatus` → completed: `expect(revalidatePath).toHaveBeenCalledWith('/admin/events')`

### results.test.ts (3 assertions)

- `createResult` success: `expect(revalidatePath).toHaveBeenCalledWith(expect.stringContaining('/admin/events/'))`
- `updateResult` success: `expect(revalidatePath).toHaveBeenCalledWith('/admin/events')`
- `deleteResult` success: `expect(revalidatePath).toHaveBeenCalledWith('/admin/events')`

### routes.test.ts (3 assertions)

- `createRoute` success: `expect(revalidatePath).toHaveBeenCalledWith('/admin/routes')`
- `updateRoute` success: `expect(revalidatePath).toHaveBeenCalledWith('/admin/routes')`
- `toggleRouteActive` success: `expect(revalidatePath).toHaveBeenCalledWith('/admin/routes')`

### riders.test.ts — NO revalidation assertions

Production code for `createRider`, `updateRider`, `mergeRiders` does not call `revalidatePath` or `revalidateTag`. No assertions to add.

## Total

- 4.1: 14 data shape assertions
- 4.2: 1 email/side-effect assertion
- 4.3: 9 cache revalidation assertions
- **Total: 24 assertion additions across 4 files**

## Notes

- All assertions use the existing `__calls` tracking infrastructure from Phase 1.1
- The `args` array in `__calls` entries captures the arguments to each mock function call — `args[0]` is the data passed to `insert()`/`update()`
- `revalidatePath` and `revalidateTag` are already mocked via `vi.mock('next/cache')` in all target files
- `createPendingResultsAndSendEmails` is already mocked in `events.test.ts`
- Access the mocked imports via dynamic `import()` after `vi.mock()` declarations

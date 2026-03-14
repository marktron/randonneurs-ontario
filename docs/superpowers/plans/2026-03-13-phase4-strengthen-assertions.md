# Phase 4: Strengthen Existing Test Assertions — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ~24 assertions to existing mock-based integration tests so they verify data shape, email side-effects, and cache revalidation — not just `success: true`.

**Architecture:** All changes are assertion additions inside existing `it()` blocks in 4 test files. No new tests, no new files, no mock infrastructure changes. Uses the existing `__calls` tracking array that records `{ table, method, args }` for every Supabase operation.

**Tech Stack:** Vitest, existing custom mock infrastructure with `__calls` tracking

---

## Chunk 1: events.test.ts assertions

### Task 1: Strengthen events.test.ts

**Files:**

- Modify: `tests/integration/actions/events.test.ts`

**Spec:** `docs/superpowers/specs/2026-03-13-phase4-strengthen-assertions-design.md`

**Context for implementer:**

- The file has a `mockModule.__calls` array that records every Supabase operation as `{ table, method, args }`.
- `args[0]` is the data passed to `insert()`/`update()`.
- `revalidatePath` is mocked at line 106-109 via `vi.mock('next/cache', ...)`. Access it via `const { revalidatePath } = await import('next/cache')`.
- `createPendingResultsAndSendEmails` is mocked at line 115-118. Access it via `const { createPendingResultsAndSendEmails } = await import('@/lib/events/complete-event')`.

- [ ] **Step 1: Add data shape + revalidation assertions to createEvent success test**

In the test `"returns success with event id when creation succeeds"` (line ~402), after the existing `expect(insertCalls).toHaveLength(1)` line, add:

```typescript
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

// Verify cache was revalidated
const { revalidatePath } = await import('next/cache')
expect(revalidatePath).toHaveBeenCalledWith('/admin/events')
```

- [ ] **Step 2: Add data shape + revalidation assertions to updateEvent success test**

In the test `"updates event successfully"` (line ~456), after the existing `expect(updateCalls).toHaveLength(1)` line, add:

```typescript
const updateData = updateCalls[0].args![0]
expect(updateData).toMatchObject({
  name: 'Updated Name',
  start_time: '09:00',
})

const { revalidatePath } = await import('next/cache')
expect(revalidatePath).toHaveBeenCalledWith('/admin/events')
```

- [ ] **Step 3: Add data shape assertion to updateEvent partial test**

In the test `"handles partial updates"` (line ~478), after the existing `expect(updateCalls).toHaveLength(1)` line, add:

```typescript
const updateData = updateCalls[0].args![0]
expect(updateData).toMatchObject({
  start_location: 'New Location',
})
// Should not contain fields that weren't submitted
expect(updateData.name).toBeUndefined()
```

- [ ] **Step 4: Add side-effect + revalidation assertions to updateEventStatus completed test**

In the test `"updates status to completed successfully"` (line ~528), after the existing `expect(updateCalls.length).toBeGreaterThanOrEqual(1)` line, add:

```typescript
// Verify createPendingResultsAndSendEmails was called
const { createPendingResultsAndSendEmails } = await import('@/lib/events/complete-event')
expect(createPendingResultsAndSendEmails).toHaveBeenCalledTimes(1)
expect(createPendingResultsAndSendEmails).toHaveBeenCalledWith(
  expect.objectContaining({
    id: 'event-1',
    name: 'Test Event',
  })
)

// Verify cache was revalidated
const { revalidatePath } = await import('next/cache')
expect(revalidatePath).toHaveBeenCalledWith('/admin/events')
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/integration/actions/events.test.ts`
Expected: All 16 tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/actions/events.test.ts
git commit -m "test: strengthen events.test.ts assertions (Phase 4)"
```

---

## Chunk 2: results.test.ts assertions

### Task 2: Strengthen results.test.ts

**Files:**

- Modify: `tests/integration/actions/results.test.ts`

**Context for implementer:**

- Same `__calls` infrastructure as events.test.ts.
- `revalidatePath` is mocked at line 115-118 via `vi.mock('next/cache', ...)`. Access it via `const { revalidatePath } = await import('next/cache')`.

- [ ] **Step 1: Add data shape + revalidation assertions to createResult success test**

In the test `"creates result successfully when no duplicate"` (line ~168), after the existing `expect(insertCalls).toHaveLength(1)` line, add:

```typescript
const insertData = insertCalls[0].args![0]
expect(insertData).toMatchObject({
  event_id: 'event-1',
  rider_id: 'rider-1',
  status: 'finished',
  finish_time: '13:30',
  season: 2025,
  distance_km: 200,
})

const { revalidatePath } = await import('next/cache')
expect(revalidatePath).toHaveBeenCalledWith(expect.stringContaining('/admin/events/'))
```

- [ ] **Step 2: Add data shape assertion to createResult null finish time test**

In the test `"allows null finish time for non-finished statuses"` (line ~214), after the existing `expect(insertCalls).toHaveLength(1)` line, add:

```typescript
const insertData = insertCalls[0].args![0]
expect(insertData.status).toBe('dnf')
expect(insertData.finish_time).toBeNull()
```

- [ ] **Step 3: Add data shape + revalidation assertions to updateResult success test**

In the test `"updates result successfully"` (line ~248), after the existing `expect(updateCalls).toHaveLength(1)` line, add:

```typescript
const updateData = updateCalls[0].args![0]
expect(updateData).toMatchObject({
  status: 'finished',
  finish_time: '14:00',
})

const { revalidatePath } = await import('next/cache')
expect(revalidatePath).toHaveBeenCalledWith('/admin/events')
```

- [ ] **Step 4: Add data shape assertion to updateResult partial test**

In the test `"handles partial updates"` (line ~272), after the existing `expect(updateCalls).toHaveLength(1)` line, add:

```typescript
const updateData = updateCalls[0].args![0]
expect(updateData.finish_time).toBe('14:00')
expect(updateData.status).toBeUndefined()
```

- [ ] **Step 5: Add revalidation assertion to deleteResult success test**

In the test `"deletes result successfully"` (line ~317), after the existing `expect(deleteCalls).toHaveLength(1)` line, add:

```typescript
const { revalidatePath } = await import('next/cache')
expect(revalidatePath).toHaveBeenCalledWith('/admin/events')
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/integration/actions/results.test.ts`
Expected: All 14 tests pass.

- [ ] **Step 7: Commit**

```bash
git add tests/integration/actions/results.test.ts
git commit -m "test: strengthen results.test.ts assertions (Phase 4)"
```

---

## Chunk 3: riders.test.ts + routes.test.ts assertions

### Task 3: Strengthen riders.test.ts

**Files:**

- Modify: `tests/integration/actions/riders.test.ts`

**Context for implementer:**

- Same `__calls` infrastructure. No revalidation calls in the production code for riders — only data shape assertions needed.

- [ ] **Step 1: Add data shape assertions to createRider tests**

In `"creates rider successfully without email"` (line ~228), after the existing `expect(insertCalls).toHaveLength(1)` line, add:

```typescript
const insertData = insertCalls[0].args![0]
expect(insertData.first_name).toBe('John')
expect(insertData.last_name).toBe('Doe')
expect(insertData.slug).toBeDefined()
```

In `"creates rider successfully with email"` (line ~247), after the existing `expect(insertCalls).toHaveLength(1)` line, add:

```typescript
const insertData = insertCalls[0].args![0]
expect(insertData.email).toBe('john@example.com')
```

- [ ] **Step 2: Add data shape assertions to updateRider tests**

In `"updates rider without email"` (line ~369), after the existing `expect(updateCalls).toHaveLength(1)` line, add:

```typescript
const updateData = updateCalls[0].args![0]
expect(updateData.first_name).toBe('John')
```

In `"updates rider with email when no duplicate exists"` (line ~385), after the existing `expect(updateCalls).toHaveLength(1)` line, add:

```typescript
const updateData = updateCalls[0].args![0]
expect(updateData.email).toBe('john@example.com')
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/integration/actions/riders.test.ts`
Expected: All 15 tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/actions/riders.test.ts
git commit -m "test: strengthen riders.test.ts assertions (Phase 4)"
```

### Task 4: Strengthen routes.test.ts

**Files:**

- Modify: `tests/integration/actions/routes.test.ts`

**Context for implementer:**

- Same `__calls` infrastructure.
- `revalidatePath` is mocked at line 120-123. Access it via `const { revalidatePath } = await import('next/cache')`.

- [ ] **Step 1: Add data shape + revalidation assertions to createRoute test**

In `"creates route with provided slug"` (line ~178), after the existing `expect(insertCalls).toHaveLength(1)` line, add:

```typescript
const insertData = insertCalls[0].args![0]
expect(insertData).toMatchObject({
  name: 'Test Route Name',
  slug: 'test-route-name',
})

const { revalidatePath } = await import('next/cache')
expect(revalidatePath).toHaveBeenCalledWith('/admin/routes')
```

- [ ] **Step 2: Add data shape + revalidation assertions to updateRoute test**

In `"updates route successfully"` (line ~286), after the existing `expect(updateCalls).toHaveLength(1)` line, add:

```typescript
const updateData = updateCalls[0].args![0]
expect(updateData.name).toBe('Updated Name')

const { revalidatePath } = await import('next/cache')
expect(revalidatePath).toHaveBeenCalledWith('/admin/routes')
```

- [ ] **Step 3: Add data shape + revalidation assertions to toggleRouteActive test**

In `"toggles route active status"` (line ~370), after the existing `expect(updateCalls).toHaveLength(1)` line, add:

```typescript
const updateData = updateCalls[0].args![0]
expect(updateData.is_active).toBeDefined()

const { revalidatePath } = await import('next/cache')
expect(revalidatePath).toHaveBeenCalledWith('/admin/routes')
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/integration/actions/routes.test.ts`
Expected: All 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/actions/routes.test.ts
git commit -m "test: strengthen routes.test.ts assertions (Phase 4)"
```

---

## Chunk 4: Final verification + audit doc update

### Task 5: Run full suite and update audit doc

**Files:**

- Modify: `docs/test-suite-audit.md`

- [ ] **Step 1: Run the full standard test suite**

Run: `npm test`
Expected: All existing tests still pass (796+).

- [ ] **Step 2: Update audit doc**

In `docs/test-suite-audit.md`, find the Phase 4 row in the priority table and mark it as completed:

Change:

```
| 6        | 4.1-4.3      |            | Strengthen existing assertions                        |
```

To:

```
| 6        | 4.1-4.3      | Yes        | Strengthen existing assertions                        |
```

Add a section after the Phase 3.1 section:

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add docs/test-suite-audit.md
git commit -m "docs: mark Phase 4 complete in test-suite-audit.md"
```

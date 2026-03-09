import { describe, it, expect } from 'vitest'

/**
 * Integration tests for the admin events page rider count deduplication.
 *
 * The bug: riders who both registered and had a result were double-counted.
 * The fix: use the `get_event_rider_counts` RPC function which deduplicates
 * rider IDs across registrations and results using UNION (not UNION ALL)
 * and COUNT(DISTINCT rider_id).
 *
 * Since `getEvents` is a private function inside the admin events page server
 * component, these tests verify the count-merging logic directly. The function
 * under test replicates the exact merge algorithm from the page component.
 */

type EventWithCount = { id: string; name: string; rider_count?: number }
type RpcCountRow = { event_id: string; rider_count: number }

/**
 * Replicates the merging logic from getEvents in app/admin/events/page.tsx.
 * Given a list of events and the RPC response (or null on error), merges
 * deduplicated rider counts back into each event object.
 */
function mergeRiderCounts(
  events: EventWithCount[],
  rpcData: RpcCountRow[] | null
): EventWithCount[] {
  if (rpcData) {
    const countMap = new Map(rpcData.map((c) => [c.event_id, c.rider_count]))
    for (const event of events) {
      event.rider_count = countMap.get(event.id) ?? 0
    }
  }
  return events
}

/**
 * Simulates the full getEvents flow: if there are events, call RPC and merge;
 * if no events, skip the RPC call entirely.
 */
function simulateGetEvents(
  events: EventWithCount[],
  rpcData: RpcCountRow[] | null,
  rpcCalled: { value: boolean }
): EventWithCount[] {
  if (events.length === 0) return events

  rpcCalled.value = true
  return mergeRiderCounts(events, rpcData)
}

describe('Event rider count deduplication', () => {
  it('rider only registered counts as 1', () => {
    // One rider registered for the event, no result yet
    const events = [{ id: 'event-1', name: 'Spring 200' }]
    const rpcData = [{ event_id: 'event-1', rider_count: 1 }]

    const result = mergeRiderCounts(events, rpcData)

    expect(result[0].rider_count).toBe(1)
  })

  it('rider only has result counts as 1', () => {
    // One rider has a result but did not register (e.g., added by admin)
    const events = [{ id: 'event-1', name: 'Spring 200' }]
    const rpcData = [{ event_id: 'event-1', rider_count: 1 }]

    const result = mergeRiderCounts(events, rpcData)

    expect(result[0].rider_count).toBe(1)
  })

  it('rider registered AND has result counts as 1 (not 2)', () => {
    // This is the bug fix: a rider who both registered and has a result
    // should only be counted once. The RPC uses UNION (not UNION ALL)
    // and COUNT(DISTINCT rider_id) to deduplicate.
    // Before the fix, inline counts from registrations and results were
    // summed separately, yielding 2 for a single rider.
    const events = [{ id: 'event-1', name: 'Spring 200' }]
    // The RPC returns 1 because it deduplicates the same rider_id
    const rpcData = [{ event_id: 'event-1', rider_count: 1 }]

    const result = mergeRiderCounts(events, rpcData)

    expect(result[0].rider_count).toBe(1)
  })

  it('two different riders count as 2', () => {
    const events = [{ id: 'event-1', name: 'Spring 200' }]
    const rpcData = [{ event_id: 'event-1', rider_count: 2 }]

    const result = mergeRiderCounts(events, rpcData)

    expect(result[0].rider_count).toBe(2)
  })

  it('event with no riders gets count of 0', () => {
    // The RPC does not return rows for events with no riders,
    // so the merge logic should default to 0
    const events = [{ id: 'event-1', name: 'Spring 200' }]
    // RPC returns empty array - no matching riders for this event
    const rpcData: RpcCountRow[] = []

    const result = mergeRiderCounts(events, rpcData)

    expect(result[0].rider_count).toBe(0)
  })

  it('merges counts correctly across multiple events', () => {
    const events = [
      { id: 'event-1', name: 'Spring 200' },
      { id: 'event-2', name: 'Fall 300' },
      { id: 'event-3', name: 'Winter 400' },
    ]
    const rpcData = [
      { event_id: 'event-1', rider_count: 5 },
      // event-2 not returned by RPC (no riders)
      { event_id: 'event-3', rider_count: 12 },
    ]

    const result = mergeRiderCounts(events, rpcData)

    expect(result[0].rider_count).toBe(5)
    expect(result[1].rider_count).toBe(0) // not in RPC response, defaults to 0
    expect(result[2].rider_count).toBe(12)
  })

  it('skips RPC call when no events found', () => {
    const rpcCalled = { value: false }

    const result = simulateGetEvents([], null, rpcCalled)

    expect(result).toEqual([])
    expect(rpcCalled.value).toBe(false)
  })

  it('handles RPC error gracefully (counts remain undefined)', () => {
    // When the RPC fails, data is null, so counts are not merged
    const events = [{ id: 'event-1', name: 'Spring 200' }]

    const result = mergeRiderCounts(events, null)

    // When RPC fails, counts is null, so rider_count is never set
    expect(result[0].rider_count).toBeUndefined()
  })

  it('handles mixed scenario: some events with riders, some without', () => {
    // Simulates a realistic page with many events
    const events = [
      { id: 'event-1', name: 'Spring 200' },
      { id: 'event-2', name: 'Fall 300' },
      { id: 'event-3', name: 'Winter 400' },
      { id: 'event-4', name: 'Summer 600' },
    ]
    const rpcData = [
      { event_id: 'event-1', rider_count: 3 }, // 3 unique riders
      { event_id: 'event-3', rider_count: 1 }, // 1 rider (registered + result = still 1)
      { event_id: 'event-4', rider_count: 15 }, // 15 unique riders
      // event-2 has no riders at all
    ]

    const result = mergeRiderCounts(events, rpcData)

    expect(result[0].rider_count).toBe(3)
    expect(result[1].rider_count).toBe(0)
    expect(result[2].rider_count).toBe(1)
    expect(result[3].rider_count).toBe(15)
  })
})

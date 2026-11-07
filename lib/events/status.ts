/**
 * Event lifecycle: the status type and the one table of allowed transitions.
 *
 * Pure data with no server imports, so both server actions (through
 * lib/actions/event-mutability.ts) and client components (the admin status
 * select) can read the same table. Every status write must agree with it;
 * see docs/ARCHITECTURE.md "Event lifecycle".
 */

export type EventStatus = 'draft' | 'scheduled' | 'completed' | 'cancelled' | 'submitted'

/**
 * Allowed status moves. Same-state requests are always allowed (a no-op).
 *
 * - completed -> scheduled reopens an event the cron completed early (e.g. a
 *   postponed start).
 * - cancelled -> completed is absent: it would skip pending-result creation,
 *   which only runs from scheduled.
 * - completed -> submitted belongs to submitEventResults, which also sends
 *   the ACP email.
 * - Nothing leaves submitted: the results are homologated.
 */
export const EVENT_STATUS_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  draft: ['scheduled'],
  scheduled: ['completed', 'cancelled'],
  completed: ['submitted', 'cancelled', 'scheduled'],
  cancelled: ['scheduled'],
  submitted: [],
}

export function canTransitionEvent(from: EventStatus, to: EventStatus): boolean {
  if (from === to) return true
  const allowed = EVENT_STATUS_TRANSITIONS[from] as readonly EventStatus[] | undefined
  return allowed?.includes(to) ?? false
}

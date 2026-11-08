/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * A submitted event is frozen server-side (assertEventMutable refuses
 * updateEvent and deleteEvent), so the detail page must not offer Edit or
 * Delete for it. Other statuses keep both.
 */

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@example.com' }),
}))

vi.mock('@/lib/data/first-time-riders', () => ({
  getFirstTimeRiderIds: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/actions/control-checkins', () => ({
  getEventCheckinsForAdmin: vi.fn().mockResolvedValue({ success: true, data: [] }),
}))

vi.mock('@/lib/actions/event-controls', () => ({
  getEventControlsForAdmin: vi.fn().mockResolvedValue({ success: true, data: [] }),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

// Children have their own tests; stub them to markers.
vi.mock('@/components/admin/event-results-manager', () => ({
  EventResultsManager: () => <div data-testid="results-manager" />,
}))
vi.mock('@/components/admin/event-status-select', () => ({
  EventStatusSelect: () => <div data-testid="status-select" />,
}))
vi.mock('@/components/admin/event-delete-button', () => ({
  EventDeleteButton: () => <button type="button">Delete</button>,
}))
vi.mock('@/components/admin/send-result-reminders-button', () => ({
  SendResultRemindersButton: () => null,
}))

let eventRow: Record<string, unknown> | null = null

/** Chainable stand-in: events end in .single(), every list query in .order(). */
function makeQueryBuilder(table: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    single: async () => ({ data: table === 'events' ? eventRow : null }),
    order: async () => ({ data: [] }),
  }
  return builder
}

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => makeQueryBuilder(table) }),
}))

import EventDetailPage from '@/app/admin/events/[id]/page'

async function renderPage(status: string) {
  eventRow = {
    id: 'event-1',
    name: 'Frozen 200',
    event_date: '2026-05-15',
    start_time: '07:00:00',
    distance_km: 200,
    event_type: 'brevet',
    status,
    season: 2026,
    erw_event_id: null,
    erw_canonical_url: null,
    description: null,
    chapters: { id: 'ch-1', name: 'Toronto' },
  }
  const ui = await EventDetailPage({
    params: Promise.resolve({ id: 'event-1' }),
    searchParams: Promise.resolve({}),
  })
  render(ui)
}

describe('admin event detail page — submitted events', () => {
  beforeEach(() => {
    eventRow = null
  })

  it('hides Edit and Delete on a submitted event', async () => {
    await renderPage('submitted')

    expect(screen.queryByRole('link', { name: /edit/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('keeps Edit and Delete on a completed event', async () => {
    await renderPage('completed')

    expect(screen.getByRole('link', { name: /edit/i }).getAttribute('href')).toBe(
      '/admin/events/event-1/edit'
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })
})

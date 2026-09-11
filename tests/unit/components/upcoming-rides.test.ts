/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { eventsForFirstNDates, UpcomingRides } from '@/components/upcoming-rides'
import type { Event } from '@/components/event-card'
import { isoDaysFromNow } from '@/tests/utils/test-helpers'

function makeEvent(date: string, name: string): Event {
  return {
    slug: name.toLowerCase().replace(/\s/g, '-'),
    date,
    name,
    type: 'Brevet',
    distance: '200',
    startLocation: '',
    startTime: '08:00',
    status: 'scheduled',
  }
}

const mockGetEventsByChapter = vi.fn()
const mockGetAllChapterSlugs = vi.fn()
const mockGetChapterInfo = vi.fn()

vi.mock('@/lib/data/events', () => ({
  getEventsByChapter: (...args: unknown[]) => mockGetEventsByChapter(...args),
  getAllChapterSlugs: (...args: unknown[]) => mockGetAllChapterSlugs(...args),
  getChapterInfo: (...args: unknown[]) => mockGetChapterInfo(...args),
}))

describe('eventsForFirstNDates', () => {
  it('returns events from the first N unique dates', () => {
    const events = [
      makeEvent('2026-03-07', 'Ride A'),
      makeEvent('2026-03-14', 'Ride B'),
      makeEvent('2026-03-28', 'Ride C'),
      makeEvent('2026-04-04', 'Ride D'),
    ]
    const result = eventsForFirstNDates(events, 3)
    expect(result).toHaveLength(3)
    expect(result.map((e) => e.name)).toEqual(['Ride A', 'Ride B', 'Ride C'])
  })

  it('includes multiple events on the same date', () => {
    const events = [
      makeEvent('2026-03-07', 'Ride A'),
      makeEvent('2026-03-07', 'Ride B'),
      makeEvent('2026-03-14', 'Ride C'),
      makeEvent('2026-03-28', 'Ride D'),
      makeEvent('2026-04-04', 'Ride E'),
    ]
    const result = eventsForFirstNDates(events, 3)
    expect(result).toHaveLength(4)
    expect(result.map((e) => e.name)).toEqual(['Ride A', 'Ride B', 'Ride C', 'Ride D'])
  })

  it('returns all events when fewer unique dates than N', () => {
    const events = [makeEvent('2026-03-07', 'Ride A'), makeEvent('2026-03-14', 'Ride B')]
    const result = eventsForFirstNDates(events, 3)
    expect(result).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(eventsForFirstNDates([], 3)).toEqual([])
  })

  it('handles all events on the same date', () => {
    const events = [
      makeEvent('2026-03-07', 'Ride A'),
      makeEvent('2026-03-07', 'Ride B'),
      makeEvent('2026-03-07', 'Ride C'),
    ]
    const result = eventsForFirstNDates(events, 3)
    expect(result).toHaveLength(3)
  })
})

describe('UpcomingRides', () => {
  beforeEach(() => {
    mockGetEventsByChapter.mockReset()
    mockGetAllChapterSlugs.mockReset()
    mockGetChapterInfo.mockReset()
  })

  it('filters out draft events before rendering', async () => {
    mockGetAllChapterSlugs.mockReturnValue(['toronto'])
    mockGetChapterInfo.mockReturnValue({ name: 'Toronto' })
    mockGetEventsByChapter.mockResolvedValue([
      { ...makeEvent(isoDaysFromNow(30), 'Draft Ride'), status: 'draft' },
      makeEvent(isoDaysFromNow(37), 'Real Ride'),
    ])

    const element = await UpcomingRides()
    render(element)

    expect(screen.getByText('Real Ride')).toBeInTheDocument()
    expect(screen.queryByText('Draft Ride')).not.toBeInTheDocument()
  })

  it('hides a chapter entirely when all its upcoming events are drafts', async () => {
    mockGetAllChapterSlugs.mockReturnValue(['toronto'])
    mockGetChapterInfo.mockReturnValue({ name: 'Toronto' })
    mockGetEventsByChapter.mockResolvedValue([
      { ...makeEvent(isoDaysFromNow(30), 'Draft Ride'), status: 'draft' },
    ])

    const element = await UpcomingRides()
    render(element)

    expect(screen.queryByText('Toronto')).not.toBeInTheDocument()
  })
})

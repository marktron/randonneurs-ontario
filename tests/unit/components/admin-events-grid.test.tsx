/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminEventsGrid } from '@/components/admin/admin-events-grid'
import { getCurrentSeasonLabel } from '@/lib/season'
import type { Event } from '@/components/event-card'

const CURRENT_SEASON = getCurrentSeasonLabel()
const NEXT_SEASON = String(Number(CURRENT_SEASON) + 1)

function eventFixture(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-1',
    slug: 'evt-1',
    date: `${NEXT_SEASON}-04-15`,
    name: 'Spring 200',
    type: 'Brevet',
    distance: '200',
    startLocation: '',
    startTime: '07:00',
    status: 'scheduled',
    chapterName: 'Toronto',
    ...overrides,
  }
}

describe('AdminEventsGrid', () => {
  it('links each event to its admin detail page, carrying the current filters', () => {
    render(
      <AdminEventsGrid
        events={[eventFixture()]}
        season={NEXT_SEASON}
        chapterId="chapter-1"
        dateFilter="upcoming"
        view="grid"
      />
    )

    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).toContain(
      `/admin/events/evt-1?from_season=${NEXT_SEASON}&from_chapter=chapter-1&from_when=upcoming&from_view=grid`
    )
  })

  it('omits filter params that match the defaults', () => {
    render(
      <AdminEventsGrid
        events={[eventFixture({ date: `${CURRENT_SEASON}-04-15` })]}
        season={CURRENT_SEASON}
        chapterId={null}
        dateFilter="all"
        view="grid"
      />
    )

    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/admin/events/evt-1?from_view=grid')
  })

  it('never falls back to the public registration link', () => {
    render(
      <AdminEventsGrid
        events={[eventFixture({ slug: 'spring-200-brevet' })]}
        season={NEXT_SEASON}
        chapterId={null}
        dateFilter="all"
        view="grid"
      />
    )

    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).not.toContain('/register/spring-200-brevet')
  })
})

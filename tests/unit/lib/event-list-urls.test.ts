import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/season', () => ({
  getCurrentSeasonLabel: vi.fn(() => '2026'),
}))

import {
  buildEventDetailUrl,
  buildPageUrl,
  buildBackUrl,
  parseAdminEventsView,
} from '@/lib/admin/event-list-urls'

describe('parseAdminEventsView', () => {
  it('parses "grid"', () => {
    expect(parseAdminEventsView('grid')).toBe('grid')
  })

  it('falls back to "list" for undefined, missing, or invalid values', () => {
    expect(parseAdminEventsView(undefined)).toBe('list')
    expect(parseAdminEventsView('list')).toBe('list')
    expect(parseAdminEventsView('bogus')).toBe('list')
  })
})

describe('buildEventDetailUrl', () => {
  it('omits view from the URL in list mode', () => {
    expect(buildEventDetailUrl('evt-1', '2026', null, 'all', 'list')).toBe('/admin/events/evt-1')
  })

  it('carries from_view when in grid mode', () => {
    expect(buildEventDetailUrl('evt-1', '2026', null, 'all', 'grid')).toBe(
      '/admin/events/evt-1?from_view=grid'
    )
  })

  it('carries from_season, from_chapter, and from_when alongside from_view', () => {
    const url = buildEventDetailUrl('evt-1', '2025', 'chapter-1', 'upcoming', 'grid')
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('from_season')).toBe('2025')
    expect(params.get('from_chapter')).toBe('chapter-1')
    expect(params.get('from_when')).toBe('upcoming')
    expect(params.get('from_view')).toBe('grid')
  })

  it('omits from_season when it matches the current season', () => {
    const url = buildEventDetailUrl('evt-1', '2026', null, 'all', 'list')
    expect(url).not.toContain('from_season')
  })
})

describe('buildPageUrl', () => {
  it('omits view from the URL in list mode', () => {
    expect(buildPageUrl(1, '2026', undefined, 'all', 'list')).toBe('/admin/events')
  })

  it('carries view=grid in grid mode', () => {
    expect(buildPageUrl(1, '2026', undefined, 'all', 'grid')).toBe('/admin/events?view=grid')
  })

  it('carries season, chapter, when, and page alongside view', () => {
    const url = buildPageUrl(3, '2025', 'chapter-1', 'past', 'grid')
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('season')).toBe('2025')
    expect(params.get('chapter')).toBe('chapter-1')
    expect(params.get('when')).toBe('past')
    expect(params.get('page')).toBe('3')
    expect(params.get('view')).toBe('grid')
  })

  it('omits page when it is 1', () => {
    const url = buildPageUrl(1, '2025', undefined, 'all', 'grid')
    expect(url).not.toContain('page=')
  })
})

describe('buildBackUrl', () => {
  it('round-trips from_view=grid into view=grid', () => {
    expect(buildBackUrl(undefined, undefined, undefined, 'grid')).toBe('/admin/events?view=grid')
  })

  it('omits view when from_view is not grid', () => {
    expect(buildBackUrl(undefined, undefined, undefined, undefined)).toBe('/admin/events')
    expect(buildBackUrl(undefined, undefined, undefined, 'list')).toBe('/admin/events')
  })

  it('carries from_season, from_chapter, and from_when as season, chapter, when', () => {
    const url = buildBackUrl('2025', 'chapter-1', 'upcoming', 'grid')
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('season')).toBe('2025')
    expect(params.get('chapter')).toBe('chapter-1')
    expect(params.get('when')).toBe('upcoming')
    expect(params.get('view')).toBe('grid')
  })

  it('returns a bare URL when nothing is set', () => {
    expect(buildBackUrl()).toBe('/admin/events')
  })
})

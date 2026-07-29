/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

const mockGetEventsByChapter = vi.fn().mockResolvedValue([])

// Keep the real (pure, static-config-backed) getChapterInfo/getAllChapterSlugs
// re-exports; only the Supabase-backed getEventsByChapter needs mocking.
vi.mock('@/lib/data/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data/events')>()
  return {
    ...actual,
    getEventsByChapter: (...args: unknown[]) => mockGetEventsByChapter(...args),
  }
})

vi.mock('@/components/calendar-page', () => ({
  CalendarPage: ({ title }: { title?: string }) => <div data-testid="calendar-page">{title}</div>,
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

import ChapterCalendarPage from '@/app/calendar/[chapter]/page'

describe('ChapterCalendarPage /calendar/[chapter]', () => {
  it('renders a descriptive h1 title and correct breadcrumb JSON-LD', async () => {
    const Page = await ChapterCalendarPage({ params: Promise.resolve({ chapter: 'toronto' }) })
    const { container, getByTestId } = render(Page)

    expect(getByTestId('calendar-page')).toHaveTextContent('Toronto Chapter Ride Calendar')

    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)

    expect(data['@type']).toBe('BreadcrumbList')
    expect(data.itemListElement.map((item: { name: string }) => item.name)).toEqual([
      'Home',
      'Calendar',
      'Toronto',
    ])
    expect(data.itemListElement[2].item).toMatch(/\/calendar\/toronto$/)
  })
})

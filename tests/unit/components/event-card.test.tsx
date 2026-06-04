/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  EventCard,
  distanceMedalColorClass,
  distanceMedalCellClass,
  type Event,
} from '@/components/event-card'

const baseEvent: Event = {
  id: 'evt-1',
  slug: 'spring-200',
  date: '2030-06-15',
  name: 'Spring 200',
  type: 'Brevet',
  distance: '200',
  startLocation: 'City Hall',
  startTime: '08:00',
  status: 'scheduled',
  registeredCount: 12,
  rwgpsId: '12345',
}

describe('distanceMedalColorClass', () => {
  it('maps each ACP medal distance to its colour', () => {
    expect(distanceMedalColorClass('200')).toContain('text-yellow-600')
    expect(distanceMedalColorClass('300')).toContain('text-lime-600')
    expect(distanceMedalColorClass('400')).toContain('text-purple-600')
    expect(distanceMedalColorClass('600')).toContain('text-orange-600')
  })

  it('treats any distance of 1000 km or more as the 1000+ colour', () => {
    expect(distanceMedalColorClass('1000')).toContain('text-neutral-900')
    expect(distanceMedalColorClass('1200')).toContain('text-neutral-900')
  })

  it('returns null for populaires and non-standard distances', () => {
    expect(distanceMedalColorClass('100')).toBeNull()
    expect(distanceMedalColorClass('150')).toBeNull()
    expect(distanceMedalColorClass('500')).toBeNull()
    expect(distanceMedalColorClass('not-a-number')).toBeNull()
  })
})

describe('distanceMedalCellClass', () => {
  it('returns a solid medal background with light text for each medal distance', () => {
    expect(distanceMedalCellClass('200')).toBe('bg-yellow-600 text-white')
    expect(distanceMedalCellClass('300')).toBe('bg-lime-600 text-white')
    expect(distanceMedalCellClass('400')).toBe('bg-purple-600 text-white')
    expect(distanceMedalCellClass('600')).toBe('bg-orange-600 text-white')
  })

  it('treats any distance of 1000 km or more as the 1000+ background', () => {
    expect(distanceMedalCellClass('1000')).toBe('bg-neutral-900 text-white')
    expect(distanceMedalCellClass('1200')).toBe('bg-neutral-900 text-white')
  })

  it('returns null for populaires and non-standard distances', () => {
    expect(distanceMedalCellClass('100')).toBeNull()
    expect(distanceMedalCellClass('500')).toBeNull()
    expect(distanceMedalCellClass('not-a-number')).toBeNull()
  })
})

describe('EventCard', () => {
  it('colour-codes the distance text to match the ACP medal (200 km → yellow-600)', () => {
    render(<EventCard event={baseEvent} />)
    const distance = screen.getByText(/^200 km$/)
    expect(distance.className).toContain('text-yellow-600')
  })

  it('keeps the default muted colour for populaires', () => {
    render(
      <EventCard event={{ ...baseEvent, type: 'Populaire', distance: '100', name: 'Spring 100' }} />
    )
    const distance = screen.getByText(/^100 km$/)
    expect(distance.className).toContain('text-muted-foreground')
  })

  describe('scheduled event', () => {
    it('renders a Register link', () => {
      render(<EventCard event={baseEvent} />)
      const links = screen.getAllByRole('link', { name: /register/i })
      expect(links.length).toBeGreaterThan(0)
    })

    it('does not render a Cancelled badge', () => {
      render(<EventCard event={baseEvent} />)
      expect(screen.queryByText(/cancelled/i)).not.toBeInTheDocument()
    })
  })

  describe('cancelled event', () => {
    const cancelledEvent: Event = { ...baseEvent, status: 'cancelled' }

    it('renders a Cancelled badge', () => {
      render(<EventCard event={cancelledEvent} />)
      expect(screen.getByText(/^cancelled$/i)).toBeInTheDocument()
    })

    it('does not render a Register link', () => {
      render(<EventCard event={cancelledEvent} />)
      const registerLinks = screen.queryAllByRole('link', { name: /register/i })
      expect(registerLinks).toHaveLength(0)
    })

    it('still renders the Route link when rwgpsId is set', () => {
      render(<EventCard event={cancelledEvent} />)
      expect(screen.getByRole('link', { name: /route/i })).toBeInTheDocument()
    })

    it('applies muted styling to the details column', () => {
      render(<EventCard event={cancelledEvent} />)
      const heading = screen.getByRole('heading', { name: /spring 200/i })
      const detailsColumn = heading.closest('div.flex.flex-col')
      expect(detailsColumn?.className).toContain('opacity-60')
    })

    it('still shows the rider count as "12 riders"', () => {
      render(<EventCard event={cancelledEvent} />)
      expect(screen.getByText(/12 riders/)).toBeInTheDocument()
    })

    it('title links to the event page on cancelled events so visitors can read the announcement', () => {
      render(<EventCard event={cancelledEvent} />)
      const titleLink = screen.getByRole('link', { name: /spring 200/i })
      expect(titleLink).toHaveAttribute('href', '/register/spring-200')
    })
  })
})

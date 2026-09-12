/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  EventCard,
  distanceMedalColorClass,
  distanceMedalCellClass,
  distanceMedalDraftClass,
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

describe('distanceMedalDraftClass', () => {
  it('returns a dashed medal-coloured border, faint tint and medal text for each medal distance', () => {
    expect(distanceMedalDraftClass('200')).toBe(
      'border-dashed border-yellow-600/60 bg-yellow-600/10 text-yellow-800 dark:text-yellow-300 print:bg-transparent'
    )
    expect(distanceMedalDraftClass('300')).toBe(
      'border-dashed border-lime-600/60 bg-lime-600/10 text-lime-800 dark:text-lime-300 print:bg-transparent'
    )
    expect(distanceMedalDraftClass('400')).toBe(
      'border-dashed border-purple-600/60 bg-purple-600/10 text-purple-800 dark:text-purple-300 print:bg-transparent'
    )
    expect(distanceMedalDraftClass('600')).toBe(
      'border-dashed border-orange-600/60 bg-orange-600/10 text-orange-800 dark:text-orange-300 print:bg-transparent'
    )
  })

  it('treats any distance of 1000 km or more as the 1000+ tint', () => {
    expect(distanceMedalDraftClass('1000')).toBe(
      'border-dashed border-neutral-900/60 bg-neutral-900/10 text-neutral-900 dark:border-neutral-100/60 dark:bg-neutral-100/10 dark:text-neutral-100 print:bg-transparent'
    )
    expect(distanceMedalDraftClass('1200')).toBe(distanceMedalDraftClass('1000'))
  })

  it('returns null for populaires and non-standard distances', () => {
    expect(distanceMedalDraftClass('100')).toBeNull()
    expect(distanceMedalDraftClass('160')).toBeNull()
    expect(distanceMedalDraftClass('not-a-number')).toBeNull()
  })
})

describe('distanceMedalCellClass', () => {
  it('returns a solid medal background with light text for each medal distance', () => {
    expect(distanceMedalCellClass('200')).toBe(
      'bg-yellow-600 text-white print:bg-transparent print:border-yellow-700 print:text-yellow-800'
    )
    expect(distanceMedalCellClass('300')).toBe(
      'bg-lime-600 text-white print:bg-transparent print:border-lime-700 print:text-lime-800'
    )
    expect(distanceMedalCellClass('400')).toBe(
      'bg-purple-600 text-white print:bg-transparent print:border-purple-700 print:text-purple-800'
    )
    expect(distanceMedalCellClass('600')).toBe(
      'bg-orange-600 text-white print:bg-transparent print:border-orange-700 print:text-orange-800'
    )
  })

  it('treats any distance of 1000 km or more as the 1000+ background', () => {
    expect(distanceMedalCellClass('1000')).toBe(
      'bg-neutral-900 text-white print:bg-transparent print:border-neutral-900 print:text-neutral-900'
    )
    expect(distanceMedalCellClass('1200')).toBe(distanceMedalCellClass('1000'))
  })

  it('returns null for populaires and non-standard distances', () => {
    expect(distanceMedalCellClass('100')).toBeNull()
    expect(distanceMedalCellClass('500')).toBeNull()
    expect(distanceMedalCellClass('not-a-number')).toBeNull()
  })

  it('renders as a white chip with a solid medal-coloured border and text in print', () => {
    // Verified for 200 and 1000+ per the print design: on paper the fill drops
    // out and the medal colour carries in the border and text instead.
    expect(distanceMedalCellClass('200')).toContain('print:bg-transparent')
    expect(distanceMedalCellClass('200')).toContain('print:border-yellow-700')
    expect(distanceMedalCellClass('200')).toContain('print:text-yellow-800')
    expect(distanceMedalCellClass('1000')).toContain('print:bg-transparent')
    expect(distanceMedalCellClass('1000')).toContain('print:border-neutral-900')
    expect(distanceMedalCellClass('1000')).toContain('print:text-neutral-900')
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
      // rwgpsCollectionId is also set here: the DB forbids both rwgps_id and
      // rwgps_collection_id being non-null on the same route, but setting
      // both in this fixture pins the ternary's precedence — route wins.
      render(<EventCard event={{ ...cancelledEvent, rwgpsCollectionId: '999999' }} />)
      const link = screen.getByRole('link', { name: /route/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', 'https://ridewithgps.com/routes/12345')
    })

    it('keeps the Route button hidden until the row is hovered, like scheduled events', () => {
      render(<EventCard event={cancelledEvent} />)
      const actions = screen.getByRole('link', { name: /route/i }).closest('div')
      expect(actions?.className).toContain('md:opacity-0')
      expect(actions?.className).toContain('md:group-hover:opacity-100')
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

  describe('draft event', () => {
    const draftEvent: Event = { ...baseEvent, status: 'draft' }

    it('does not apply muted styling to the details column (drafts are real plans)', () => {
      render(<EventCard event={draftEvent} />)
      const heading = screen.getByRole('heading', { name: /spring 200/i })
      const detailsColumn = heading.closest('div.flex.flex-col')
      expect(detailsColumn?.className).not.toContain('opacity-60')
    })

    it('shows the distance in the dashed medal-coloured draft chip', () => {
      render(<EventCard event={draftEvent} />)
      const distance = screen.getByText(/^200 km$/)
      expect(distance.className).toContain('border-dashed')
      expect(distance.className).toContain('border-yellow-600/60')
      expect(distance.className).toContain('text-yellow-800')
    })

    it('falls back to a neutral dashed chip for non-medal distances', () => {
      render(<EventCard event={{ ...draftEvent, distance: '100', type: 'Populaire' }} />)
      const distance = screen.getByText(/^100 km$/)
      expect(distance.className).toContain('border-dashed')
      expect(distance.className).toContain('border-border')
      expect(distance.className).toContain('bg-background')
      expect(distance.className).toContain('text-muted-foreground')
    })

    it('shows an uppercase Draft label beside the distance chip', () => {
      render(<EventCard event={draftEvent} />)
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })

    it('shows a plain "Details" link instead of the red Register action', () => {
      render(<EventCard event={draftEvent} />)
      expect(screen.getByRole('link', { name: 'Details' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /^register$/i })).not.toBeInTheDocument()
    })

    it('does not use the red Register styling on the Details link', () => {
      render(<EventCard event={draftEvent} />)
      const link = screen.getByRole('link', { name: 'Details' })
      expect(link.className).not.toContain('text-red-600')
    })
  })

  describe('Route button', () => {
    it('links the Route button to the collection when only rwgpsCollectionId is set', () => {
      render(<EventCard event={{ ...baseEvent, rwgpsId: null, rwgpsCollectionId: '8387874' }} />)
      const link = screen.getByRole('link', { name: 'Route' })
      expect(link).toHaveAttribute('href', 'https://ridewithgps.com/collections/8387874')
    })

    it('shows no Route button when neither RWGPS id is set', () => {
      render(<EventCard event={{ ...baseEvent, rwgpsId: null, rwgpsCollectionId: null }} />)
      expect(screen.queryByRole('link', { name: 'Route' })).not.toBeInTheDocument()
    })
  })
})

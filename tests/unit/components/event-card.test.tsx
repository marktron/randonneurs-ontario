/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventCard, type Event } from '@/components/event-card'

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

describe('EventCard', () => {
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

    it('applies muted styling to the title', () => {
      render(<EventCard event={cancelledEvent} />)
      const heading = screen.getByRole('heading', { name: /spring 200/i })
      // The title sits inside an outer element that carries the opacity utility.
      // Walk up looking for the muting class — the test should pass for either
      // direct or ancestor application.
      let el: HTMLElement | null = heading
      let foundMuted = false
      while (el) {
        if (el.className.includes('opacity-') || el.className.includes('text-muted-foreground')) {
          foundMuted = true
          break
        }
        el = el.parentElement
      }
      expect(foundMuted).toBe(true)
    })

    it('still shows the rider count as "12 riders"', () => {
      render(<EventCard event={cancelledEvent} />)
      expect(screen.getByText(/12 riders/)).toBeInTheDocument()
    })
  })
})

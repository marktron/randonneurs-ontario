/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Footer } from '@/components/footer'

/**
 * The footer is the site's crawlable sitemap: the navbar's links live inside
 * Radix `NavigationMenuContent` / `Sheet`, which don't mount until opened, so
 * these are the only internal links guaranteed to be in the server HTML.
 */
const EXPECTED_INTERNAL_LINKS = [
  '/calendar',
  '/routes',
  '/calendar/permanents',
  '/register/permanent',
  '/live-tracking',
  '/results',
  '/riders',
  '/records',
  '/awards',
  '/about',
  '/intro',
  '/membership',
  '/contact',
  '/policies',
  '/news',
  '/mailing-list',
]

describe('Footer', () => {
  it('renders a link to every main site section', () => {
    render(<Footer />)

    const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'))

    for (const href of EXPECTED_INTERNAL_LINKS) {
      expect(hrefs, `expected footer to link to ${href}`).toContain(href)
    }
  })

  it('groups the internal links under section headings', () => {
    render(<Footer />)

    for (const title of ['Ride', 'Results', 'Club']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    }
  })

  it('exposes the internal links as a labelled navigation landmark', () => {
    render(<Footer />)

    const nav = screen.getByRole('navigation', { name: 'Footer' })
    expect(nav.querySelectorAll('a').length).toBe(EXPECTED_INTERNAL_LINKS.length)
  })

  it('keeps the external community links', () => {
    render(<Footer />)

    const hrefs = Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href'))

    expect(hrefs).toContain('https://forms.gle/D342cLDardMFnxwY9')
    expect(hrefs).toContain('https://www.facebook.com/groups/randonneursontario')
    expect(hrefs).toContain('https://www.strava.com/clubs/6774')
  })
})

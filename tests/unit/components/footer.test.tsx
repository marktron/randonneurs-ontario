/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
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

const SLACK_URL = 'https://join.slack.com/t/randonneurs-ontario/shared_invite/test'

/** Community links in display order. Slack is inserted only when the env var is set. */
const COMMUNITY_LINKS_BEFORE_SLACK = [
  { label: 'Blog', href: 'https://blog.randonneursontario.ca', external: true },
  { label: 'Mailing List', href: '/mailing-list', external: false },
]
const COMMUNITY_LINKS_AFTER_SLACK = [
  {
    label: 'Facebook Group',
    href: 'https://www.facebook.com/groups/randonneursontario',
    external: true,
  },
  { label: 'Strava Club', href: 'https://www.strava.com/clubs/6774', external: true },
  {
    label: 'Ride with GPS Club',
    href: 'https://ridewithgps.com/clubs/1406-randonneurs-ontario/home',
    external: true,
  },
]

function sectionLinks(title: string): HTMLAnchorElement[] {
  const heading = screen.getByRole('heading', { name: title })
  return Array.from(heading.parentElement!.querySelectorAll('a'))
}

afterEach(() => {
  vi.unstubAllEnvs()
})

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

    for (const title of ['Ride', 'Results', 'Club', 'Community']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    }
  })

  it('exposes the sitemap links as a labelled navigation landmark', () => {
    vi.stubEnv('NEXT_PUBLIC_SLACK_INVITE_URL', SLACK_URL)
    render(<Footer />)

    const nav = screen.getByRole('navigation', { name: 'Footer' })
    // Internal links, minus Mailing List (moved to Community, still counted once),
    // plus the external Community links (Blog, Slack, Facebook, Strava, RWGPS).
    expect(nav.querySelectorAll('a').length).toBe(EXPECTED_INTERNAL_LINKS.length + 5)
  })

  it('keeps the feedback link on the bottom row', () => {
    render(<Footer />)

    const feedback = screen.getByRole('link', { name: 'Feedback' })
    expect(feedback.getAttribute('href')).toBe('https://forms.gle/D342cLDardMFnxwY9')
    expect(feedback.closest('nav')).toBeNull()
  })

  describe('Community section', () => {
    it('lists the links in order with the right hrefs (Slack set)', () => {
      vi.stubEnv('NEXT_PUBLIC_SLACK_INVITE_URL', SLACK_URL)
      render(<Footer />)

      const links = sectionLinks('Community')
      expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
        ...COMMUNITY_LINKS_BEFORE_SLACK.map((l) => [l.label, l.href]),
        ['Slack', SLACK_URL],
        ...COMMUNITY_LINKS_AFTER_SLACK.map((l) => [l.label, l.href]),
      ])
    })

    it('opens external links in a new tab and keeps internal links in-page', () => {
      vi.stubEnv('NEXT_PUBLIC_SLACK_INVITE_URL', SLACK_URL)
      render(<Footer />)

      const expectedExternal: Record<string, boolean> = {
        Slack: true,
        ...Object.fromEntries(
          [...COMMUNITY_LINKS_BEFORE_SLACK, ...COMMUNITY_LINKS_AFTER_SLACK].map((l) => [
            l.label,
            l.external,
          ])
        ),
      }
      const links = sectionLinks('Community')
      expect(links.length).toBe(Object.keys(expectedExternal).length)
      for (const a of links) {
        const label = a.textContent!
        if (expectedExternal[label]) {
          expect(a.getAttribute('target'), `${label} target`).toBe('_blank')
          expect(a.getAttribute('rel'), `${label} rel`).toBe('noopener noreferrer')
        } else {
          expect(a.getAttribute('target'), `${label} target`).toBeNull()
        }
      }
    })

    it('omits Slack entirely when the invite URL is unset', () => {
      vi.stubEnv('NEXT_PUBLIC_SLACK_INVITE_URL', '')
      render(<Footer />)

      expect(screen.queryByRole('link', { name: 'Slack' })).toBeNull()
      expect(sectionLinks('Community').map((a) => a.textContent)).toEqual([
        'Blog',
        'Mailing List',
        'Facebook Group',
        'Strava Club',
        'Ride with GPS Club',
      ])
    })

    it('does not list Mailing List under Club', () => {
      render(<Footer />)

      expect(sectionLinks('Club').map((a) => a.textContent)).not.toContain('Mailing List')
      expect(sectionLinks('Community').map((a) => a.textContent)).toContain('Mailing List')
    })
  })

  it('has no icon-only social links left', () => {
    vi.stubEnv('NEXT_PUBLIC_SLACK_INVITE_URL', SLACK_URL)
    render(<Footer />)

    const iconOnly = Array.from(document.querySelectorAll('a')).filter(
      (a) => !a.textContent?.trim()
    )
    expect(iconOnly.map((a) => a.getAttribute('href'))).toEqual([])
    expect(document.querySelector('a[aria-label]')).toBeNull()
  })
})

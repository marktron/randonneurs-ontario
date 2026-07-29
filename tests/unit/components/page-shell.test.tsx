/**
 * @vitest-environment node
 *
 * Guards the site's crawlability: PageShell must emit the navbar and the
 * footer's internal links into the *server* HTML.
 *
 * PageShell used to load the navbar via `dynamic(..., { ssr: false })` as a
 * workaround for a hydration mismatch that actually came from elsewhere. That
 * left the primary navigation out of the server response on every page. These
 * assertions run against renderToString, so re-introducing `ssr: false` (or
 * otherwise deferring the chrome to the client) fails the suite.
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { PageShell } from '@/components/page-shell'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

function renderShell() {
  return renderToString(
    <PageShell>
      <p>page body</p>
    </PageShell>
  )
}

describe('PageShell server rendering', () => {
  it('renders the navbar into the server HTML', () => {
    const html = renderShell()

    expect(html).toContain('<header')
    expect(html).toContain('Randonneurs Ontario')
    // The "Join the club" CTA is a top-level nav link, not nested in a menu.
    expect(html).toContain('href="/membership"')
  })

  it('renders the footer section links into the server HTML', () => {
    const html = renderShell()

    for (const href of ['/calendar', '/results', '/riders', '/about', '/policies']) {
      expect(html, `expected server HTML to contain a link to ${href}`).toContain(`href="${href}"`)
    }
  })

  it('renders the page content and skip link', () => {
    const html = renderShell()

    expect(html).toContain('page body')
    expect(html).toContain('href="#main-content"')
  })
})

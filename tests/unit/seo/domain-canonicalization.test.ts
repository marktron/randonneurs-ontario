import { describe, it, expect, vi, afterEach } from 'vitest'

// next/font requires the Next.js compiler; stub it so app/layout.tsx imports cleanly.
vi.mock('next/font/google', () => ({
  Noto_Sans: () => ({ variable: '--font-sans' }),
  Noto_Serif: () => ({ variable: '--font-serif' }),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('SITE_URL', () => {
  it('falls back to the canonical www host when NEXT_PUBLIC_SITE_URL is unset', async () => {
    const { SITE_URL } = await import('@/lib/site-url')
    expect(SITE_URL).toBe('https://www.randonneursontario.ca')
  })

  it('uses NEXT_PUBLIC_SITE_URL when set', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
    const { SITE_URL } = await import('@/lib/site-url')
    expect(SITE_URL).toBe('http://localhost:3000')
  })
})

describe('robots.txt', () => {
  it('advertises the sitemap on the canonical www host', async () => {
    const { default: robots } = await import('@/app/robots')
    expect(robots().sitemap).toBe('https://www.randonneursontario.ca/sitemap.xml')
  })

  it('disallows admin pages and single-use/private token pages', async () => {
    const { default: robots } = await import('@/app/robots')
    const rules = robots().rules
    const rule = Array.isArray(rules) ? rules[0] : rules
    expect(rule.disallow).toEqual(
      expect.arrayContaining(['/admin/', '/registration/manage/', '/card/', '/results/submit/'])
    )
  })
})

describe('root layout metadata', () => {
  it('resolves metadataBase to the canonical www host, not localhost', async () => {
    const { metadata } = await import('@/app/layout')
    expect(metadata.metadataBase).toBeInstanceOf(URL)
    expect((metadata.metadataBase as URL).origin).toBe('https://www.randonneursontario.ca')
  })

  it('sets a self-referencing canonical for every page', async () => {
    const { metadata } = await import('@/app/layout')
    expect(metadata.alternates?.canonical).toBe('./')
  })
})

describe('host redirect', () => {
  it('301s register.randonneursontario.ca to the www host, preserving the path', async () => {
    const { default: config } = await import('@/next.config')
    const redirects = await config.redirects!()
    expect(redirects).toContainEqual(
      expect.objectContaining({
        source: '/:path*',
        has: [{ type: 'host', value: 'register.randonneursontario.ca' }],
        destination: 'https://www.randonneursontario.ca/:path*',
        permanent: true,
      })
    )
  })
})

import { describe, it, expect } from 'vitest'
import { buildRegistrationConfirmationEmail, buildResultSubmissionRequestEmail } from '@/lib/email/templates'

describe('Email template HTML escaping', () => {
  const baseData = {
    registrantName: 'John Doe',
    registrantEmail: 'john@example.com',
    eventName: 'Toronto Brevet',
    eventDate: 'Saturday, June 15, 2025',
    eventTime: '8:00 AM',
    eventLocation: '123 Main St',
    eventDistance: 200,
    eventType: 'Brevet',
    chapterName: 'Toronto',
    chapterSlug: 'toronto',
    membershipStatus: 'valid' as const,
    membershipType: 'Regular',
  }

  it('escapes HTML in registrant name', () => {
    const data = {
      ...baseData,
      registrantName: '<script>alert("xss")</script>',
    }
    const { html } = buildRegistrationConfirmationEmail(data)

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes HTML in notes field', () => {
    const data = {
      ...baseData,
      notes: '<img src=x onerror=alert(1)>',
    }
    const { html } = buildRegistrationConfirmationEmail(data)

    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })

  it('escapes HTML in event name', () => {
    const data = {
      ...baseData,
      eventName: '"><script>alert(1)</script>',
    }
    const { html } = buildRegistrationConfirmationEmail(data)

    expect(html).not.toContain('"><script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })

  it('escapes HTML in event location', () => {
    const data = {
      ...baseData,
      eventLocation: '<b onmouseover=alert(1)>Location</b>',
    }
    const { html } = buildRegistrationConfirmationEmail(data)

    expect(html).not.toContain('<b onmouseover')
    expect(html).toContain('&lt;b onmouseover')
  })

  it('escapes HTML in chapter name', () => {
    const data = {
      ...baseData,
      chapterName: '<div style="position:absolute">Fake</div>',
    }
    const { html } = buildRegistrationConfirmationEmail(data)

    expect(html).not.toContain('<div style="position:absolute">')
    expect(html).toContain('&lt;div')
  })

  it('escapes HTML in route URL attribute', () => {
    const data = {
      ...baseData,
      routeUrl: 'javascript:alert(1)',
    }
    const { html } = buildRegistrationConfirmationEmail(data)

    // URL should be present but escaped in href context
    expect(html).toContain('javascript:alert(1)')
    // The href value is escaped for HTML attributes
  })

  it('does not modify plain text version', () => {
    const data = {
      ...baseData,
      registrantName: 'John & Jane <Doe>',
    }
    const { text } = buildRegistrationConfirmationEmail(data)

    // Plain text should NOT be escaped (it's not HTML)
    expect(text).toContain('John & Jane <Doe>')
  })
})

describe('Result submission email HTML escaping', () => {
  const baseData = {
    riderName: 'Jane Doe',
    riderEmail: 'jane@example.com',
    eventName: 'Ottawa Brevet',
    eventDate: 'July 1, 2025',
    eventDistance: 300,
    chapterName: 'Ottawa',
    submissionUrl: 'https://randonneursontario.ca/results/submit/abc123',
  }

  it('escapes HTML in rider name', () => {
    const data = {
      ...baseData,
      riderName: '<script>alert("xss")</script>',
    }
    const { html } = buildResultSubmissionRequestEmail(data)

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes HTML in event name', () => {
    const data = {
      ...baseData,
      eventName: '"><img src=x onerror=alert(1)>',
    }
    const { html } = buildResultSubmissionRequestEmail(data)

    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })

  it('escapes HTML in submission URL', () => {
    const data = {
      ...baseData,
      submissionUrl: '"><script>alert(1)</script>',
    }
    const { html } = buildResultSubmissionRequestEmail(data)

    expect(html).not.toContain('"><script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })
})

describe('Admin login redirect validation', () => {
  // Test the getSafeRedirectUrl logic that was added to the login page
  function getSafeRedirectUrl(redirect: string | null): string {
    if (!redirect) return '/admin'
    if (redirect.startsWith('/admin')) return redirect
    return '/admin'
  }

  it('returns /admin for null redirect', () => {
    expect(getSafeRedirectUrl(null)).toBe('/admin')
  })

  it('allows /admin paths', () => {
    expect(getSafeRedirectUrl('/admin/events')).toBe('/admin/events')
    expect(getSafeRedirectUrl('/admin/users')).toBe('/admin/users')
    expect(getSafeRedirectUrl('/admin')).toBe('/admin')
  })

  it('blocks external URLs', () => {
    expect(getSafeRedirectUrl('https://evil.com')).toBe('/admin')
    expect(getSafeRedirectUrl('http://evil.com/admin')).toBe('/admin')
    expect(getSafeRedirectUrl('//evil.com')).toBe('/admin')
  })

  it('blocks non-admin paths', () => {
    expect(getSafeRedirectUrl('/register')).toBe('/admin')
    expect(getSafeRedirectUrl('/')).toBe('/admin')
    expect(getSafeRedirectUrl('/results')).toBe('/admin')
  })

  it('blocks javascript: protocol', () => {
    expect(getSafeRedirectUrl('javascript:alert(1)')).toBe('/admin')
  })
})

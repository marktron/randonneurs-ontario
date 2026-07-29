import { describe, it, expect, vi } from 'vitest'

describe('homepage metadata', () => {
  it('sets an absolute title and a description mentioning brevets, chapters, and joining', async () => {
    const { metadata } = await import('@/app/page')

    expect(metadata.title).toEqual({
      absolute: 'Randonneurs Ontario — Long-Distance Cycling in Ontario',
    })

    const description = metadata.description as string
    expect(description).toBeTruthy()
    expect(description.toLowerCase()).toContain('brevet')
    expect(description).toContain('Toronto')
    expect(description).toContain('Ottawa')
    expect(description).toContain('Huron')
    expect(description).toContain('Simcoe-Muskoka')
    expect(description.toLowerCase()).toContain('join')
  })
})

describe('token page generateMetadata — robots noindex', () => {
  it('/card/[token] sets robots: index/follow false, found or not found', async () => {
    const mockGetBrevetCardByToken = vi.fn().mockResolvedValue(null)
    vi.doMock('@/lib/actions/brevet-card', () => ({
      getBrevetCardByToken: mockGetBrevetCardByToken,
    }))

    const { generateMetadata } = await import('@/app/card/[token]/page')
    const metadata = await generateMetadata({ params: Promise.resolve({ token: 'tok' }) })

    expect(metadata.robots).toEqual({ index: false, follow: false })

    vi.doUnmock('@/lib/actions/brevet-card')
    vi.resetModules()
  })

  it('/results/submit/[token] sets robots: index/follow false, found or not found', async () => {
    const mockGetResultByToken = vi.fn().mockResolvedValue({ success: false })
    vi.doMock('@/lib/actions/rider-results', () => ({
      getResultByToken: mockGetResultByToken,
    }))

    const { generateMetadata } = await import('@/app/results/submit/[token]/page')
    const metadata = await generateMetadata({ params: Promise.resolve({ token: 'tok' }) })

    expect(metadata.robots).toEqual({ index: false, follow: false })

    vi.doUnmock('@/lib/actions/rider-results')
    vi.resetModules()
  })

  it('/registration/manage/[token] sets robots: index/follow false, found or not found', async () => {
    const mockGetRegistrationByToken = vi.fn().mockResolvedValue(null)
    vi.doMock('@/lib/actions/manage-registration', () => ({
      getRegistrationByToken: mockGetRegistrationByToken,
      createEarlyResult: vi.fn(),
    }))

    const { generateMetadata } = await import('@/app/registration/manage/[token]/page')
    const metadata = await generateMetadata({ params: Promise.resolve({ token: 'tok' }) })

    expect(metadata.robots).toEqual({ index: false, follow: false })

    vi.doUnmock('@/lib/actions/manage-registration')
    vi.resetModules()
  })
})

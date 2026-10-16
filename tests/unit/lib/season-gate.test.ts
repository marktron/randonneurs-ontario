import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getMembershipSeasonStatus } from '@/lib/ccn/client'
import { nextSeasonClosedMessage, registrationSeasonBlock } from '@/lib/memberships/season-gate'

vi.mock('@/lib/ccn/client')

const MESSAGE_2027 =
  'Registration for 2027 events opens once 2027 memberships are available. Check back soon.'

describe('registrationSeasonBlock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-16T12:00:00Z') })
    vi.mocked(getMembershipSeasonStatus).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('never calls CCN for the current or a past season', async () => {
    expect(await registrationSeasonBlock(2026)).toBeNull()
    expect(await registrationSeasonBlock(2025)).toBeNull()
    expect(getMembershipSeasonStatus).not.toHaveBeenCalled()
  })

  it('allows a next-season event when CCN is selling it', async () => {
    vi.mocked(getMembershipSeasonStatus).mockResolvedValue({ status: 'open', eventId: 1 })
    expect(await registrationSeasonBlock(2027)).toBeNull()
    expect(getMembershipSeasonStatus).toHaveBeenCalledWith(2027)
  })

  it('blocks a next-season event when the listing is closed', async () => {
    vi.mocked(getMembershipSeasonStatus).mockResolvedValue({ status: 'closed', eventId: 1 })
    expect(await registrationSeasonBlock(2027)).toBe(MESSAGE_2027)
  })

  it('blocks a next-season event when there is no listing', async () => {
    vi.mocked(getMembershipSeasonStatus).mockResolvedValue({ status: 'none' })
    expect(await registrationSeasonBlock(2027)).toBe(MESSAGE_2027)
  })

  it('blocks when status lookup rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(getMembershipSeasonStatus).mockRejectedValue(new Error('ccn down'))
    expect(await registrationSeasonBlock(2027)).toBe(MESSAGE_2027)
    expect(warn).toHaveBeenCalled()
  })
})

describe('nextSeasonClosedMessage', () => {
  it('matches the agreed copy', () => {
    expect(nextSeasonClosedMessage(2027)).toBe(MESSAGE_2027)
  })
})

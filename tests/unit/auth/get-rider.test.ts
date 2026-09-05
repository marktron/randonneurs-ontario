import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockUser: { id: string; email?: string } | null = null
let mockRider: { id: string; auth_user_id: string } | null = null
let mockAdmin: { id: string } | null = null

vi.mock('@/lib/supabase-server-client', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: mockUser }, error: null })) },
    })
  ),
}))

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() =>
            Promise.resolve({ data: table === 'riders' ? mockRider : mockAdmin, error: null })
          ),
        })),
      })),
    })),
  })),
}))

import { getAccount, requireAccount, requireRider, NotLinkedError } from '@/lib/auth/get-rider'

describe('getAccount / requireAccount / requireRider', () => {
  beforeEach(() => {
    mockUser = null
    mockRider = null
    mockAdmin = null
  })

  it('returns null when there is no session', async () => {
    expect(await getAccount()).toBeNull()
    await expect(requireAccount()).rejects.toThrow('Unauthorized')
    await expect(requireRider()).rejects.toThrow('Unauthorized')
  })

  it('returns an unlinked account', async () => {
    mockUser = { id: 'u1', email: 'a@example.com' }
    const account = await getAccount()
    expect(account).toEqual({ userId: 'u1', email: 'a@example.com', rider: null, isAdmin: false })
    await expect(requireRider()).rejects.toBeInstanceOf(NotLinkedError)
  })

  it('returns the linked rider and admin flag', async () => {
    mockUser = { id: 'u1', email: 'a@example.com' }
    mockRider = { id: 'r1', auth_user_id: 'u1' }
    mockAdmin = { id: 'u1' }
    const linked = await requireRider()
    expect(linked.rider.id).toBe('r1')
    expect(linked.isAdmin).toBe(true)
  })

  it('uses null email when the auth user has none', async () => {
    mockUser = { id: 'u1' }
    expect((await getAccount())?.email).toBeNull()
  })
})

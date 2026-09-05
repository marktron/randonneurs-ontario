import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let mockUser: { id: string; email?: string } | null = null
let mockRider: { id: string; auth_user_id: string } | null = null
let mockAdmin: { id: string } | null = null
let mockRiderError: { message: string } | null = null
let mockAdminError: { message: string } | null = null

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
            Promise.resolve(
              table === 'riders'
                ? { data: mockRider, error: mockRiderError }
                : { data: mockAdmin, error: mockAdminError }
            )
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
    mockRiderError = null
    mockAdminError = null
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('fails closed when the admins lookup errors', async () => {
    // Swallowing this would report isAdmin: false and lift the admin guards
    // on changeAccountEmail/deleteAccount.
    mockUser = { id: 'u1', email: 'a@example.com' }
    mockAdminError = { message: 'connection reset' }
    await expect(getAccount()).rejects.toThrow('Account lookup failed')
    await expect(requireAccount()).rejects.toThrow('Account lookup failed')
  })

  it('fails closed when the riders lookup errors', async () => {
    mockUser = { id: 'u1', email: 'a@example.com' }
    mockRiderError = { message: 'connection reset' }
    await expect(getAccount()).rejects.toThrow('Account lookup failed')
  })

  it('uses null email when the auth user has none', async () => {
    mockUser = { id: 'u1' }
    expect((await getAccount())?.email).toBeNull()
  })
})

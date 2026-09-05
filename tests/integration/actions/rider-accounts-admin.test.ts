import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const updateSelect = vi.fn()
const update = vi.fn(() => ({
  eq: vi.fn(() => ({
    is: vi.fn(() => ({ select: updateSelect })),
    select: updateSelect,
  })),
}))
vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({ rpc, from: vi.fn(() => ({ update })) })),
}))

let mockAdmin: { id: string; role: string } | null = { id: 'admin-1', role: 'admin' }
vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn(() => {
    if (!mockAdmin) throw new Error('Unauthorized')
    return Promise.resolve(mockAdmin)
  }),
}))

const logAuditEvent = vi.fn()
vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEvent(...args),
}))

import { linkRiderAccount, unlinkRiderAccount } from '@/lib/actions/riders'

describe('linkRiderAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdmin = { id: 'admin-1', role: 'admin' }
    rpc.mockResolvedValue({ data: 'user-1', error: null })
    updateSelect.mockResolvedValue({
      data: [{ id: 'r1', first_name: 'A', last_name: 'B' }],
      error: null,
    })
  })

  it('refuses chapter admins', async () => {
    mockAdmin = { id: 'admin-1', role: 'chapter_admin' }
    expect((await linkRiderAccount('r1', 'x@example.com')).success).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('looks the auth user up by normalized email', async () => {
    const result = await linkRiderAccount('r1', ' X@Example.com ')
    expect(rpc).toHaveBeenCalledWith('auth_user_id_for_email', { p_email: 'x@example.com' })
    expect(result.success).toBe(true)
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'account_link', entityId: 'r1' })
    )
  })

  it('explains when no account exists for the email', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect((await linkRiderAccount('r1', 'x@example.com')).error).toMatch(/signed in/i)
  })

  it('explains when the rider is already linked', async () => {
    updateSelect.mockResolvedValue({ data: [], error: null })
    expect((await linkRiderAccount('r1', 'x@example.com')).error).toMatch(/already linked/i)
  })

  it('explains when the account is linked to another rider', async () => {
    updateSelect.mockResolvedValue({ data: null, error: { code: '23505', message: 'dup' } })
    expect((await linkRiderAccount('r1', 'x@example.com')).error).toMatch(/another rider/i)
  })
})

describe('unlinkRiderAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdmin = { id: 'admin-1', role: 'admin' }
    updateSelect.mockResolvedValue({
      data: [{ id: 'r1', first_name: 'A', last_name: 'B' }],
      error: null,
    })
  })

  it('clears the link and audit-logs it', async () => {
    const result = await unlinkRiderAccount('r1')
    expect(result.success).toBe(true)
    expect(update).toHaveBeenCalledWith({ auth_user_id: null, linked_at: null })
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'account_unlink', entityId: 'r1' })
    )
  })
})

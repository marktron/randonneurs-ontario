import { describe, it, expect, vi, beforeEach } from 'vitest'

const signInWithOtp = vi.fn()
const verifyOtp = vi.fn()
const signOut = vi.fn()
const updateUser = vi.fn()
vi.mock('@/lib/supabase-server-client', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({ auth: { signInWithOtp, verifyOtp, signOut, updateUser } })
  ),
}))

const riderMaybeSingle = vi.fn()
const riderUpdate = vi.fn()
// Separate spies for the `.eq(...)` calls themselves (not just their
// resolved values), so tests can assert the filter that keeps one account
// from touching another rider's row (e.g. `eq('auth_user_id', userId)`).
const riderSelectEq = vi.fn(() => ({ maybeSingle: riderMaybeSingle }))
const riderUpdateEq = vi.fn()
vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: riderSelectEq })),
      update: vi.fn((values: unknown) => ({
        eq: (...args: unknown[]) => {
          riderUpdateEq(...args)
          return riderUpdate(values)
        },
      })),
    })),
  })),
}))

// vi.mock factories that return identifiers directly (not wrapped in an inner
// closure) run at hoist time, before ordinary `const` initializers — hence
// vi.hoisted() here to dodge the resulting TDZ error.
const { resolveLink, claimRider, findLinkCandidates } = vi.hoisted(() => ({
  resolveLink: vi.fn(),
  claimRider: vi.fn(),
  findLinkCandidates: vi.fn(),
}))
vi.mock('@/lib/account/linking', () => ({ resolveLink, claimRider, findLinkCandidates }))

const { deleteAccountData } = vi.hoisted(() => ({ deleteAccountData: vi.fn() }))
vi.mock('@/lib/account/deletion', () => ({ deleteAccountData }))

let mockAccount: {
  userId: string
  email: string | null
  rider: { id: string } | null
  isAdmin: boolean
} | null = null
vi.mock('@/lib/auth/get-rider', () => ({
  getAccount: vi.fn(() => Promise.resolve(mockAccount)),
  requireAccount: vi.fn(() => {
    if (!mockAccount) throw new Error('Unauthorized')
    return Promise.resolve(mockAccount)
  }),
}))

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { redirect } from 'next/navigation'
import { resetRateLimitStores } from '@/lib/rate-limit'
import {
  requestSignInCode,
  verifySignInCode,
  chooseRider,
  signOutRider,
  changeAccountEmail,
  deleteAccount,
} from '@/lib/actions/account'

describe('requestSignInCode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimitStores()
    signInWithOtp.mockResolvedValue({ data: {}, error: null })
  })

  it('rejects an invalid email without calling Supabase', async () => {
    const result = await requestSignInCode('not-an-email')
    expect(result.success).toBe(false)
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('normalizes the email and passes shouldCreateUser and the captcha token', async () => {
    const result = await requestSignInCode('  Rider@Example.COM ', 'tok')
    expect(result).toEqual({ success: true })
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'rider@example.com',
      options: { shouldCreateUser: true, captchaToken: 'tok' },
    })
  })

  it('returns success without sending once the per-email limit is hit', async () => {
    for (let i = 0; i < 5; i++) await requestSignInCode('r@example.com')
    signInWithOtp.mockClear()
    expect(await requestSignInCode('r@example.com')).toEqual({ success: true })
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('surfaces a captcha failure but nothing else about the address', async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: { message: 'captcha verification process failed' },
    })
    const result = await requestSignInCode('r@example.com')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/verification/i)
  })

  it('maps Supabase email rate limiting to a try-later message', async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: { message: 'email rate limit exceeded', code: 'over_email_send_rate_limit' },
    })
    const result = await requestSignInCode('r@example.com')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/few minutes/i)
  })
})

describe('verifySignInCode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimitStores()
    verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    riderMaybeSingle.mockResolvedValue({ data: null, error: null })
    riderUpdate.mockResolvedValue({ error: null })
  })

  it('rejects a malformed code without calling Supabase', async () => {
    const result = await verifySignInCode('r@example.com', '12ab')
    expect(result.success).toBe(false)
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('strips spaces from the code and verifies with type email', async () => {
    resolveLink.mockResolvedValue({ kind: 'linked', riderId: 'r1' })
    const result = await verifySignInCode('R@example.com', '123 456')
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'r@example.com',
      token: '123456',
      type: 'email',
    })
    expect(result).toEqual({ success: true, data: { next: '/account' } })
  })

  it('returns the generic message on a bad code', async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'Token has expired' } })
    const result = await verifySignInCode('r@example.com', '123456')
    expect(result).toEqual({ success: false, error: 'That code is invalid or expired.' })
  })

  it('routes an unmatched account to /account/unmatched and a family email to /account/choose', async () => {
    resolveLink.mockResolvedValueOnce({ kind: 'unmatched' })
    expect((await verifySignInCode('r@example.com', '123456')).data?.next).toBe(
      '/account/unmatched'
    )
    resolveLink.mockResolvedValueOnce({ kind: 'choose', candidates: [] })
    expect((await verifySignInCode('r@example.com', '123456')).data?.next).toBe('/account/choose')
  })

  it('syncs riders.email for an already-linked rider whose auth email changed', async () => {
    riderMaybeSingle.mockResolvedValue({
      data: { id: 'r1', email: 'old@example.com' },
      error: null,
    })
    const result = await verifySignInCode('new@example.com', '123456')
    expect(resolveLink).not.toHaveBeenCalled()
    expect(riderSelectEq).toHaveBeenCalledWith('auth_user_id', 'u1')
    expect(riderUpdate).toHaveBeenCalledWith({ email: 'new@example.com' })
    expect(riderUpdateEq).toHaveBeenCalledWith('id', 'r1')
    expect(result.data?.next).toBe('/account')
  })

  it('locks verification after 10 attempts per email', async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'bad' } })
    for (let i = 0; i < 10; i++) await verifySignInCode('r@example.com', '000000')
    verifyOtp.mockClear()
    const result = await verifySignInCode('r@example.com', '000000')
    expect(result.success).toBe(false)
    expect(verifyOtp).not.toHaveBeenCalled()
  })
})

describe('chooseRider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccount = { userId: 'u1', email: 'fam@example.com', rider: null, isAdmin: false }
    findLinkCandidates.mockResolvedValue([{ id: 'r1', firstName: 'A', lastName: 'B' }])
    claimRider.mockResolvedValue(true)
  })

  it('requires a session', async () => {
    mockAccount = null
    expect(await chooseRider('r1')).toEqual({
      success: false,
      error: 'Please sign in again.',
    })
  })

  it('refuses ids outside the candidate set', async () => {
    const result = await chooseRider('r2')
    expect(result.success).toBe(false)
    expect(claimRider).not.toHaveBeenCalled()
  })

  it('claims a candidate for the signed-in user', async () => {
    const result = await chooseRider('r1')
    expect(claimRider).toHaveBeenCalledWith({
      riderId: 'r1',
      userId: 'u1',
      email: 'fam@example.com',
    })
    expect(result).toEqual({ success: true, data: { next: '/account' } })
  })

  it('reports when the rider was claimed by someone else first', async () => {
    claimRider.mockResolvedValue(false)
    expect((await chooseRider('r1')).error).toMatch(/pick again/i)
  })

  it('is a no-op for an already-linked account', async () => {
    mockAccount = { userId: 'u1', email: 'fam@example.com', rider: { id: 'r9' }, isAdmin: false }
    expect(await chooseRider('r1')).toEqual({ success: true, data: { next: '/account' } })
    expect(claimRider).not.toHaveBeenCalled()
  })
})

describe('signOutRider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signs out this browser only, then redirects home', async () => {
    await signOutRider()
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(redirect).toHaveBeenCalledWith('/')
  })
})

describe('changeAccountEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimitStores()
    mockAccount = { userId: 'u1', email: 'old@example.com', rider: { id: 'r1' }, isAdmin: false }
    updateUser.mockResolvedValue({ data: {}, error: null })
  })

  it('is blocked for admins', async () => {
    mockAccount = { ...mockAccount!, isAdmin: true }
    const result = await changeAccountEmail('new@example.com')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/admin settings/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('rejects an invalid or unchanged address', async () => {
    expect((await changeAccountEmail('nope')).success).toBe(false)
    expect((await changeAccountEmail('OLD@example.com')).success).toBe(false)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('asks Supabase to change the email and reports the double confirmation', async () => {
    const result = await changeAccountEmail(' New@Example.com ')
    expect(updateUser).toHaveBeenCalledWith({ email: 'new@example.com' })
    expect(result.success).toBe(true)
  })

  it('stops asking Supabase once the per-account limit is hit', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await changeAccountEmail(`new${i}@example.com`)).success).toBe(true)
    }
    updateUser.mockClear()
    const result = await changeAccountEmail('new4@example.com')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/too many email changes/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('limits per account, not globally', async () => {
    for (let i = 0; i < 3; i++) await changeAccountEmail(`new${i}@example.com`)
    mockAccount = { userId: 'u2', email: 'other@example.com', rider: { id: 'r2' }, isAdmin: false }
    updateUser.mockClear()
    expect((await changeAccountEmail('fresh@example.com')).success).toBe(true)
    expect(updateUser).toHaveBeenCalledWith({ email: 'fresh@example.com' })
  })

  it('requires a session', async () => {
    mockAccount = null
    expect(await changeAccountEmail('new@example.com')).toEqual({
      success: false,
      error: 'Please sign in again.',
    })
    expect(updateUser).not.toHaveBeenCalled()
  })
})

describe('deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccount = { userId: 'u1', email: 'r@example.com', rider: { id: 'r1' }, isAdmin: false }
    verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    deleteAccountData.mockResolvedValue(undefined)
    signOut.mockResolvedValue({ error: null })
  })

  it('is blocked for admins before any code is checked', async () => {
    mockAccount = { ...mockAccount!, isAdmin: true }
    const result = await deleteAccount('123456')
    expect(result.success).toBe(false)
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(deleteAccountData).not.toHaveBeenCalled()
  })

  it('requires a valid fresh code', async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })
    const result = await deleteAccount('123456')
    expect(result).toEqual({ success: false, error: 'That code is invalid or expired.' })
    expect(deleteAccountData).not.toHaveBeenCalled()
  })

  it('deletes the account data, signs out locally', async () => {
    const result = await deleteAccount('123 456')
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'r@example.com',
      token: '123456',
      type: 'email',
    })
    expect(deleteAccountData).toHaveBeenCalledWith({ userId: 'u1', riderId: 'r1' })
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(result).toEqual({ success: true })
  })

  it('requires a session', async () => {
    mockAccount = null
    expect(await deleteAccount('123456')).toEqual({
      success: false,
      error: 'Please sign in again.',
    })
    expect(verifyOtp).not.toHaveBeenCalled()
    expect(deleteAccountData).not.toHaveBeenCalled()
  })
})

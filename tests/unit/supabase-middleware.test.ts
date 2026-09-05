// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type CookieOpts = {
  cookies: {
    getAll: () => unknown[]
    setAll: (
      cookies: { name: string; value: string; options: object }[],
      headers: Record<string, string>
    ) => void
  }
}

let mockUser: { id: string } | null = null
let mockAdmin: { id: string; role: string } | null = null
let refreshCookies = false

// Hoisted so the mock factory below (which vi.mock hoists to the top of the
// module) can close over it, and so tests can assert on its call history.
const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url: string, _key: string, opts: CookieOpts) => {
    return {
      auth: {
        getUser: vi.fn(async () => {
          if (refreshCookies) {
            opts.cookies.setAll([{ name: 'sb-token', value: 'fresh', options: { path: '/' } }], {
              'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
              Pragma: 'no-cache',
            })
          }
          return { data: { user: mockUser }, error: null }
        }),
      },
      from: fromMock.mockImplementation(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: mockAdmin, error: null })) })),
        })),
      })),
    }
  }),
}))

import { updateSession } from '@/lib/supabase-middleware'

function req(path: string) {
  return new NextRequest(new URL(path, 'http://localhost:3000'))
}
function location(res: Response) {
  const loc = res.headers.get('location')
  return loc ? new URL(loc) : null
}

describe('updateSession', () => {
  beforeEach(() => {
    mockUser = null
    mockAdmin = null
    refreshCookies = false
    fromMock.mockClear()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  })

  it('copies Supabase cache headers onto the response when cookies are refreshed', async () => {
    mockUser = { id: 'u1' }
    refreshCookies = true
    const res = await updateSession(req('/account'))
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('pragma')).toBe('no-cache')
    expect(res.cookies.get('sb-token')?.value).toBe('fresh')
  })

  it('carries refreshed cookies and cache headers onto a redirect', async () => {
    refreshCookies = true
    const res = await updateSession(req('/account/settings'))
    const loc = location(res)
    expect(loc?.pathname).toBe('/account/login')
    expect(res.cookies.get('sb-token')?.value).toBe('fresh')
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('pragma')).toBe('no-cache')
  })

  it('sends a signed-out visitor on /account/* to login with a redirect param', async () => {
    const res = await updateSession(req('/account/settings'))
    const loc = location(res)
    expect(loc?.pathname).toBe('/account/login')
    expect(loc?.searchParams.get('redirect')).toBe('/account/settings')
  })

  it('lets a signed-out visitor open /account/login', async () => {
    const res = await updateSession(req('/account/login'))
    expect(res.status).toBe(200)
  })

  it('sends a signed-in visitor on /account/login to /account', async () => {
    mockUser = { id: 'u1' }
    expect(location(await updateSession(req('/account/login')))?.pathname).toBe('/account')
  })

  it('sends a signed-in admin on /account/login to /account without consulting admins', async () => {
    mockUser = { id: 'u1' }
    mockAdmin = { id: 'u1', role: 'admin' }
    expect(location(await updateSession(req('/account/login')))?.pathname).toBe('/account')
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('does not consult the admins table on account routes, but does on admin routes', async () => {
    mockUser = { id: 'u1' }

    await updateSession(req('/account'))
    expect(fromMock).not.toHaveBeenCalled()

    fromMock.mockClear()
    await updateSession(req('/account/login'))
    expect(fromMock).not.toHaveBeenCalled()

    fromMock.mockClear()
    await updateSession(req('/admin/events'))
    expect(fromMock).toHaveBeenCalledWith('admins')
  })

  it('lets a signed-out visitor open /admin/login', async () => {
    const res = await updateSession(req('/admin/login'))
    expect(res.status).toBe(200)
  })

  it('sends a signed-in non-admin on /admin/login to /account (no loop)', async () => {
    mockUser = { id: 'u1' }
    expect(location(await updateSession(req('/admin/login')))?.pathname).toBe('/account')
  })

  it('sends a signed-in admin on /admin/login to /admin', async () => {
    mockUser = { id: 'u1' }
    mockAdmin = { id: 'u1', role: 'admin' }
    expect(location(await updateSession(req('/admin/login')))?.pathname).toBe('/admin')
  })

  it('bounces a non-admin off /admin/events with error=unauthorized', async () => {
    mockUser = { id: 'u1' }
    const loc = location(await updateSession(req('/admin/events')))
    expect(loc?.pathname).toBe('/admin/login')
    expect(loc?.searchParams.get('error')).toBe('unauthorized')
  })

  it('lets an admin through to /admin/events', async () => {
    mockUser = { id: 'u1' }
    mockAdmin = { id: 'u1', role: 'admin' }
    expect((await updateSession(req('/admin/events'))).status).toBe(200)
  })

  it('sends a signed-out visitor on /admin/events to login with a redirect param', async () => {
    const loc = location(await updateSession(req('/admin/events')))
    expect(loc?.pathname).toBe('/admin/login')
    expect(loc?.searchParams.get('redirect')).toBe('/admin/events')
  })

  it('lets an admin through to bare /admin', async () => {
    mockUser = { id: 'u1' }
    mockAdmin = { id: 'u1', role: 'admin' }
    expect((await updateSession(req('/admin'))).status).toBe(200)
  })

  it('sends a signed-out visitor on bare /admin to login with a redirect param', async () => {
    const loc = location(await updateSession(req('/admin')))
    expect(loc?.pathname).toBe('/admin/login')
    expect(loc?.searchParams.get('redirect')).toBe('/admin')
  })

  it('always lets /admin/update-password through', async () => {
    expect((await updateSession(req('/admin/update-password'))).status).toBe(200)
    mockUser = { id: 'u1' }
    expect((await updateSession(req('/admin/update-password'))).status).toBe(200)
  })
})

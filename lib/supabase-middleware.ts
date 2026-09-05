import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Session refresh and route gating for /admin and /account.
 * Runs from proxy.ts for the paths in its matcher.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          // A refreshed session must never be cached by a CDN and served to
          // someone else. @supabase/ssr supplies the headers; apply them.
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const redirectTo = (path: string, params: Record<string, string> = {}) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    url.search = ''
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    return NextResponse.redirect(url)
  }

  // ---- Rider account routes ------------------------------------------------
  if (pathname === '/account' || pathname.startsWith('/account/')) {
    const isAccountLogin = pathname === '/account/login'
    if (!user && !isAccountLogin) return redirectTo('/account/login', { redirect: pathname })
    if (user && isAccountLogin) return redirectTo('/account')
    return supabaseResponse
  }

  // ---- Admin routes ----------------------------------------------------------
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const isLoginPage = pathname === '/admin/login'
    const isUpdatePasswordPage = pathname === '/admin/update-password'

    if (isUpdatePasswordPage) return supabaseResponse

    if (!user) {
      if (isLoginPage) return supabaseResponse
      return redirectTo('/admin/login', { redirect: pathname })
    }

    const { data: admin } = await supabase
      .from('admins')
      .select('id, role')
      .eq('id', user.id)
      .single()

    if (isLoginPage) {
      // A signed-in non-admin used to bounce between /admin and /admin/login.
      return redirectTo(admin ? '/admin' : '/account')
    }
    if (!admin) return redirectTo('/admin/login', { error: 'unauthorized' })
  }

  return supabaseResponse
}

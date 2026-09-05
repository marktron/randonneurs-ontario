import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase-middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Admin dashboard
    '/admin/:path*',
    // Rider accounts
    '/account/:path*',
  ],
}

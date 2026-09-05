'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

interface AccountNavProps {
  className?: string
  onNavigate?: () => void
}

/**
 * "Sign in" / "My account" link. Client island so public pages stay static:
 * the label is cosmetic (authorization happens server-side), so the
 * unvalidated browser session is fine here. The browser client also keeps
 * the session refreshed while a rider browses public pages.
 *
 * Sign-in/out run through server actions, which set the auth cookie without
 * telling this component's browser client, so a single mount-time check
 * would go stale (both flows redirect once they're done, but nothing here
 * would notice). Two effects split the concerns: one creates the client
 * once and subscribes to auth changes for the component's lifetime; the
 * other just re-checks the session whenever the route changes, which is
 * enough to pick up a sign-in/out without tearing down and resubscribing
 * the listener on every navigation across the site.
 */
export function AccountNav({ className, onNavigate }: AccountNavProps) {
  const [signedIn, setSignedIn] = useState(false)
  const pathname = usePathname()
  // Built inside the mount effect, never during render: this component sits in
  // the header of every public page, so a render-time createClient() also runs
  // during SSR/prerender, where there is no browser storage to talk to.
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)

  useEffect(() => {
    const supabase = (supabaseRef.current ??= createClient())
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session))
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)))
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const supabase = supabaseRef.current
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session))
    })
    return () => {
      active = false
    }
  }, [pathname])

  return (
    <Link
      href={signedIn ? '/account' : '/account/login'}
      className={className}
      onClick={onNavigate}
    >
      {signedIn ? 'My account' : 'Sign in'}
    </Link>
  )
}

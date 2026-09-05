'use client'

import { useEffect, useState } from 'react'
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
 * telling this component's browser client. Re-checking on every pathname
 * change (both flows redirect once they're done) picks that up without
 * requiring a full page reload.
 */
export function AccountNav({ className, onNavigate }: AccountNavProps) {
  const [signedIn, setSignedIn] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const supabase = createClient()
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

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Detects Supabase auth tokens in the URL hash and redirects to the
 * appropriate handler page. Supabase always redirects to the Site URL
 * (with tokens in the hash), regardless of which specific page we want
 * the user to land on.
 */
export function AuthRedirectHandler() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash.substring(1)
    if (!hash) return

    const params = new URLSearchParams(hash)
    const type = params.get('type')

    if (type === 'recovery') {
      router.replace('/admin/update-password' + window.location.hash)
    }
  }, [router])

  return null
}

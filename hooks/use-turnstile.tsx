'use client'

import { useCallback, useState } from 'react'
import { TurnstileField } from '@/components/account/turnstile-field'

export interface UseTurnstileResult {
  /** The current unspent token, or null if no challenge has been solved. */
  token: string | null
  /**
   * Hand the token to the request about to be dispatched: returns it (or
   * undefined), clears it, and remounts the widget so the next attempt gets a
   * fresh challenge. Cloudflare tokens are single-use, so a retry that reuses a
   * spent token is rejected — call this *before* awaiting, not after.
   */
  takeToken: () => string | undefined
  /** The challenge itself. Render it wherever the widget belongs. */
  widget: React.JSX.Element
  /** Drop the token and remount without spending it (e.g. on dialog close). */
  reset: () => void
}

/**
 * Turnstile state for a form: the widget, the token it issues, and the
 * clear-and-remount every dispatch needs.
 */
export function useTurnstile(): UseTurnstileResult {
  const [token, setToken] = useState<string | null>(null)
  // Bumped to re-key the widget, which remounts it and starts a new challenge.
  const [attempt, setAttempt] = useState(0)

  const reset = useCallback(() => {
    setToken(null)
    setAttempt((n) => n + 1)
  }, [])

  const takeToken = useCallback(() => {
    setToken(null)
    setAttempt((n) => n + 1)
    return token ?? undefined
  }, [token])

  return {
    token,
    takeToken,
    reset,
    widget: <TurnstileField key={attempt} onToken={setToken} />,
  }
}

'use client'

import { Turnstile } from '@marsidev/react-turnstile'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

interface TurnstileFieldProps {
  /** Called with a token when the challenge passes, null when it expires or fails */
  onToken: (token: string | null) => void
}

/**
 * Cloudflare Turnstile challenge for the sign-in form. Renders nothing when
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (local dev, tests), in which case
 * Supabase must also have CAPTCHA disabled.
 */
export function TurnstileField({ onToken }: TurnstileFieldProps) {
  if (!SITE_KEY) return null
  return (
    <Turnstile
      siteKey={SITE_KEY}
      onSuccess={onToken}
      onExpire={() => onToken(null)}
      onError={() => onToken(null)}
      options={{ size: 'flexible', theme: 'auto' }}
    />
  )
}

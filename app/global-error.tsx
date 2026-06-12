'use client'

import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'
import { normalizeGlobalError } from '@/lib/global-error'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // Benign browser noise (e.g. a <script> in <head> failing to load) arrives
    // here as a DOM Event. Don't synthesize and report a fake exception for it.
    const normalized = normalizeGlobalError(error)
    if (!normalized) return

    Sentry.captureException(normalized, {
      extra: { original: error, digest: error?.digest },
    })
  }, [error])

  return (
    <html lang="en">
      <body>
        {/* `NextError` is the default Next.js error page component. Its type
        definition requires a `statusCode` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  )
}

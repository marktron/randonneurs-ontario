import { useEffect, useState } from 'react'
import { getMyUpcomingRides } from '@/lib/actions/my-rides'
import { getSavedRegistrationData } from '@/lib/registration-storage'

/**
 * Slugs of events the visitor is registered for (upcoming rides only),
 * identified by the email saved in localStorage under `ro-registration`.
 * Returns an empty set when there's no saved email, or when the lookup
 * fails — callers just treat "not in the set" as "not registered".
 */
export function useRegisteredSlugs(): Set<string> {
  const [slugs, setSlugs] = useState<Set<string>>(new Set())

  useEffect(() => {
    const data = getSavedRegistrationData()
    if (!data?.email) return

    let cancelled = false

    getMyUpcomingRides(data.email)
      .then((result) => {
        if (cancelled) return
        if (result.success && result.data) {
          setSlugs(new Set(result.data.map((ride) => ride.slug)))
        }
      })
      .catch(() => {
        // A failed lookup just means nothing gets marked.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return slugs
}

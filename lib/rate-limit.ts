/**
 * Simple in-memory rate limiter for server actions.
 *
 * Uses a sliding window approach: tracks timestamps of recent attempts
 * per key (IP or email), and rejects if too many within the window.
 *
 * NOTE: This is per-process. On Vercel Serverless, each function instance
 * has its own memory, so this won't share state across instances. It still
 * provides meaningful protection against rapid-fire abuse from a single
 * client hitting the same instance, and Vercel's built-in DDoS protection
 * handles the distributed case.
 */

interface RateLimitEntry {
  timestamps: number[]
}

const stores = new Map<string, Map<string, RateLimitEntry>>()

function getStore(name: string): Map<string, RateLimitEntry> {
  let store = stores.get(name)
  if (!store) {
    store = new Map()
    stores.set(name, store)
  }
  return store
}

/**
 * Check if a key has exceeded the rate limit.
 *
 * @param storeName - Name of the rate limit store (e.g. 'login', 'registration')
 * @param key - Identifier to rate limit (e.g. IP address, email)
 * @param maxAttempts - Maximum attempts allowed within the window
 * @param windowMs - Time window in milliseconds
 * @returns true if the request should be BLOCKED, false if allowed
 */
export function isRateLimited(
  storeName: string,
  key: string,
  maxAttempts: number,
  windowMs: number
): boolean {
  const store = getStore(storeName)
  const now = Date.now()
  const entry = store.get(key)

  if (!entry) {
    store.set(key, { timestamps: [now] })
    return false
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)

  if (entry.timestamps.length >= maxAttempts) {
    return true
  }

  entry.timestamps.push(now)
  return false
}

// Periodically clean up stale entries to prevent memory leaks (every 5 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(
    () => {
      const now = Date.now()
      for (const [, store] of stores) {
        for (const [key, entry] of store) {
          // Remove entries where all timestamps are older than 10 minutes
          if (entry.timestamps.every((t) => now - t > 600_000)) {
            store.delete(key)
          }
        }
      }
    },
    5 * 60 * 1000
  )
}

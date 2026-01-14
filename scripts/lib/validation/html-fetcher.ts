/**
 * HTML Fetcher with local caching.
 *
 * Fetches HTML from randonneursontario.ca and caches responses
 * to avoid repeated fetches during development.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, rmSync } from 'fs'
import { join } from 'path'

const CACHE_DIR = join(process.cwd(), '.validation-cache')
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

export interface FetchResult {
  html: string
  fromCache: boolean
  error?: string
}

/**
 * Create a cache key from a URL.
 */
function getCacheKey(url: string): string {
  return url.replace(/[^a-z0-9]/gi, '_') + '.html'
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch HTML from a URL with retry logic and optional caching.
 */
export async function fetchHtml(url: string, useCache = true): Promise<FetchResult> {
  const cacheKey = getCacheKey(url)
  const cachePath = join(CACHE_DIR, cacheKey)

  // Check cache first
  if (useCache && existsSync(cachePath)) {
    try {
      const html = readFileSync(cachePath, 'utf-8')
      return { html, fromCache: true }
    } catch {
      // Cache read failed, continue to fetch
    }
  }

  // Fetch with retries
  let lastError: string = ''
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'RO-Validation-Tool/1.0 (https://randonneurs.to)',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          return {
            html: '',
            fromCache: false,
            error: `Page not found (404): ${url}`,
          }
        }
        lastError = `HTTP ${response.status}: ${response.statusText}`
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt)
          continue
        }
      }

      const html = await response.text()

      // Cache the successful response
      try {
        if (!existsSync(CACHE_DIR)) {
          mkdirSync(CACHE_DIR, { recursive: true })
        }
        writeFileSync(cachePath, html, 'utf-8')
      } catch {
        // Cache write failed, but we still have the HTML
      }

      return { html, fromCache: false }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt)
      }
    }
  }

  return {
    html: '',
    fromCache: false,
    error: `Failed after ${MAX_RETRIES} attempts: ${lastError}`,
  }
}

/**
 * Clear the cache for a specific URL or all cached files.
 */
export function clearCache(url?: string): void {
  if (url) {
    const cachePath = join(CACHE_DIR, getCacheKey(url))
    if (existsSync(cachePath)) {
      unlinkSync(cachePath)
    }
  } else {
    if (existsSync(CACHE_DIR)) {
      rmSync(CACHE_DIR, { recursive: true })
    }
  }
}

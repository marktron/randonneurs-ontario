import { vi } from 'vitest'
import { config } from 'dotenv'
import path from 'path'

// Load real env vars from .env.development.local and .env.local
// Uses dotenv directly because @next/env's loadEnvConfig is CJS-only
// and doesn't work in Vitest's ESM worker context
config({ path: path.resolve(process.cwd(), '.env.development.local'), override: true })
config({ path: path.resolve(process.cwd(), '.env.local') })

// Mock Next.js cache module (pass-through, no caching in tests)
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn) => fn),
}))

// Mock React cache (pass-through, no deduplication in tests)
vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return {
    ...actual,
    cache: (fn: unknown) => fn,
  }
})

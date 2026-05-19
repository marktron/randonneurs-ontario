import { vi } from 'vitest'
import { config } from 'dotenv'
import path from 'path'
import WebSocket from 'ws'

// Load real env vars from .env.development.local and .env.local
// Uses dotenv directly because @next/env's loadEnvConfig is CJS-only
// and doesn't work in Vitest's ESM worker context
config({ path: path.resolve(process.cwd(), '.env.development.local'), override: true })
config({ path: path.resolve(process.cwd(), '.env.local') })

// supabase-js initializes a RealtimeClient which needs globalThis.WebSocket.
// Node 22 provides it natively; on Node 20 we polyfill via the transitive `ws`.
if (typeof globalThis.WebSocket === 'undefined') {
  ;(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket
}

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

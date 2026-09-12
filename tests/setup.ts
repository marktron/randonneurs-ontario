import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// The shared CI runner is ~10x slower than a dev machine; testing-library's
// default 1000ms `waitFor` timeout made the dialog-driven registration tests
// flaky there (see the "email typo confirmation" block). Stay well under the
// 5000ms vitest testTimeout.
configure({ asyncUtilTimeout: 3000 })

// Telemetry is an external boundary. Loading the Next.js SDK in a DOM test
// also loads its Node-only bundler instrumentation, which requires file URLs.
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

// Polyfill missing DOM APIs for happy-dom compatibility with Radix UI
if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function (_pointerId: number): boolean {
    return false
  }
  Element.prototype.setPointerCapture = function (_pointerId: number): void {
    // No-op
  }
  Element.prototype.releasePointerCapture = function (_pointerId: number): void {
    // No-op
  }
}

// Mock Next.js cache module
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn) => fn), // Pass through the function (no caching in tests)
}))

// Mock React cache (for request deduplication)
vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return {
    ...actual,
    cache: (fn: unknown) => fn, // Pass through the function (no deduplication in tests)
  }
})

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  redirect: vi.fn(),
}))

// Mock environment variables for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.AWS_ACCESS_KEY_ID = 'test-aws-key'
process.env.AWS_SECRET_ACCESS_KEY = 'test-aws-secret'
process.env.AWS_REGION = 'us-east-1'

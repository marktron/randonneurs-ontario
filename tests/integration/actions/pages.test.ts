import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock requireAdmin to always pass
vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: 'admin-123', email: 'admin@example.com' }),
}))

// Mock Next.js cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Mock fs for local file saving
const mockWriteFile = vi.fn().mockResolvedValue(undefined)
vi.mock('fs/promises', () => ({
  writeFile: mockWriteFile,
}))

// Import after mocks are set up
import { savePage } from '@/lib/actions/pages'

describe('savePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set NODE_ENV to development for local file saving
    vi.stubEnv('NODE_ENV', 'development')
  })

  describe('validation', () => {
    it('returns error for missing slug', async () => {
      const result = await savePage({
        slug: '',
        title: 'Test Page',
        description: 'A test page',
        content: 'Test content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Slug and title are required')
    })

    it('returns error for missing title', async () => {
      const result = await savePage({
        slug: 'test-page',
        title: '',
        description: 'A test page',
        content: 'Test content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Slug and title are required')
    })

    it('returns error for invalid slug format with uppercase', async () => {
      const result = await savePage({
        slug: 'Test-Page',
        title: 'Test Page',
        description: 'A test page',
        content: 'Test content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Slug can only contain lowercase letters, numbers, and hyphens')
    })

    it('returns error for invalid slug format with spaces', async () => {
      const result = await savePage({
        slug: 'test page',
        title: 'Test Page',
        description: 'A test page',
        content: 'Test content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Slug can only contain lowercase letters, numbers, and hyphens')
    })

    it('returns error for invalid slug format with special characters', async () => {
      const result = await savePage({
        slug: 'test_page!',
        title: 'Test Page',
        description: 'A test page',
        content: 'Test content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Slug can only contain lowercase letters, numbers, and hyphens')
    })

    it('accepts valid slug with lowercase, numbers, and hyphens', async () => {
      const result = await savePage({
        slug: 'test-page-123',
        title: 'Test Page',
        description: 'A test page',
        content: 'Test content',
      })

      expect(result.success).toBe(true)
    })
  })

  describe('reserved slugs', () => {
    it('returns error for reserved slug "admin"', async () => {
      const result = await savePage({
        slug: 'admin',
        title: 'Admin Page',
        description: 'An admin page',
        content: 'Admin content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('"admin" is reserved and cannot be used as a page slug')
    })

    it('returns error for reserved slug "register"', async () => {
      const result = await savePage({
        slug: 'register',
        title: 'Register Page',
        description: 'A register page',
        content: 'Register content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('"register" is reserved and cannot be used as a page slug')
    })

    it('returns error for reserved slug "calendar"', async () => {
      const result = await savePage({
        slug: 'calendar',
        title: 'Calendar Page',
        description: 'A calendar page',
        content: 'Calendar content',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('"calendar" is reserved and cannot be used as a page slug')
    })
  })

  describe('local file saving', () => {
    it('saves file locally in development mode', async () => {
      const result = await savePage({
        slug: 'my-new-page',
        title: 'My New Page',
        description: 'A new page',
        content: '# Hello World',
      })

      expect(result.success).toBe(true)
      expect(mockWriteFile).toHaveBeenCalledTimes(1)

      const [filePath, content] = mockWriteFile.mock.calls[0]
      expect(filePath).toContain('content/pages/my-new-page.md')
      expect(content).toContain('title: My New Page')
      expect(content).toContain('slug: my-new-page')
      expect(content).toContain('description: A new page')
      expect(content).toContain('# Hello World')
    })

    it('includes lastUpdated date in frontmatter', async () => {
      await savePage({
        slug: 'dated-page',
        title: 'Dated Page',
        description: 'A page with a date',
        content: 'Content here',
      })

      const [, content] = mockWriteFile.mock.calls[0]
      expect(content).toMatch(/lastUpdated: \d{4}-\d{2}-\d{2}/)
    })
  })
})

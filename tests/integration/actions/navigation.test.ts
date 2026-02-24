import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock requireAdmin to always pass
vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: 'admin-123', email: 'admin@example.com' }),
}))

// Mock Next.js cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Mock audit logging
vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

// Mock fs for local file saving
const mockWriteFile = vi.fn().mockResolvedValue(undefined)
vi.mock('fs/promises', () => ({
  writeFile: mockWriteFile,
}))

// Import after mocks are set up
import { saveNavigation } from '@/lib/actions/navigation'

describe('saveNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set NODE_ENV to development for local file saving
    vi.stubEnv('NODE_ENV', 'development')
  })

  describe('validation', () => {
    it('returns error when items array is empty', async () => {
      const result = await saveNavigation({ items: [] })
      expect(result.success).toBe(false)
      expect(result.error).toContain('at least one')
    })

    it('returns error when a top-level item has no label', async () => {
      const result = await saveNavigation({
        items: [{ label: '', children: [{ label: 'Link', href: '/foo' }] }],
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('label')
    })

    it('returns error when a child link has no href', async () => {
      const result = await saveNavigation({
        items: [{ label: 'Menu', children: [{ label: 'Link' }] }],
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('href')
    })

    it('allows separator children without href or label', async () => {
      const result = await saveNavigation({
        items: [{ label: 'Menu', children: [{ separator: true }] }],
      })
      expect(result.success).toBe(true)
    })

    it('allows heading children without href', async () => {
      const result = await saveNavigation({
        items: [{ label: 'Menu', children: [{ label: 'Section', type: 'heading' }] }],
      })
      expect(result.success).toBe(true)
    })

    it('allows template children without resolved href', async () => {
      const result = await saveNavigation({
        items: [{
          label: 'Routes',
          children: [{ label: '{{chapter}}', href: '/routes/{{chapter-slug}}', template: 'chapters' }],
        }],
      })
      expect(result.success).toBe(true)
    })
  })

  describe('local file saving', () => {
    it('saves navigation.json locally in dev mode', async () => {
      const nav = {
        items: [{ label: 'About', children: [{ label: 'About Us', href: '/about' }] }],
      }

      const result = await saveNavigation(nav)

      expect(result.success).toBe(true)
      expect(mockWriteFile).toHaveBeenCalledTimes(1)

      const [filePath, content] = mockWriteFile.mock.calls[0]
      expect(filePath).toContain('content/navigation.json')

      const saved = JSON.parse(content)
      expect(saved.items[0].label).toBe('About')
    })

    it('revalidates layout path after saving', async () => {
      const { revalidatePath } = await import('next/cache')

      const nav = {
        items: [{ label: 'About', children: [{ label: 'About Us', href: '/about' }] }],
      }

      await saveNavigation(nav)

      expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    })

    it('logs audit event after saving', async () => {
      const { logAuditEvent } = await import('@/lib/audit-log')

      const nav = {
        items: [{ label: 'About', children: [{ label: 'About Us', href: '/about' }] }],
      }

      await saveNavigation(nav)

      expect(logAuditEvent).toHaveBeenCalledWith({
        adminId: 'admin-123',
        action: 'update',
        entityType: 'navigation',
        entityId: 'navigation',
        description: 'Updated site navigation',
      })
    })
  })
})

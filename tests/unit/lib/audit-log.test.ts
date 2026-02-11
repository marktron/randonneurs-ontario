import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock getSupabaseAdmin before importing
const mockInsert = vi.fn()
const mockFrom = vi.fn(() => ({ insert: mockInsert }))

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: mockFrom,
  })),
}))

import { logAuditEvent } from '@/lib/audit-log'

describe('logAuditEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockResolvedValue({ error: null })
  })

  it('inserts an audit log entry with correct data', async () => {
    await logAuditEvent({
      adminId: 'admin-123',
      action: 'create',
      entityType: 'event',
      entityId: 'event-456',
      description: 'Created event: Test Brevet',
    })

    expect(mockFrom).toHaveBeenCalledWith('audit_logs')
    expect(mockInsert).toHaveBeenCalledWith({
      admin_id: 'admin-123',
      action: 'create',
      entity_type: 'event',
      entity_id: 'event-456',
      description: 'Created event: Test Brevet',
    })
  })

  it('handles null entityId', async () => {
    await logAuditEvent({
      adminId: 'admin-123',
      action: 'update',
      entityType: 'page',
      entityId: null,
      description: 'Saved page: About',
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_id: null,
      })
    )
  })

  it('handles undefined entityId', async () => {
    await logAuditEvent({
      adminId: 'admin-123',
      action: 'delete',
      entityType: 'route',
      description: 'Deleted route: xyz',
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_id: null,
      })
    )
  })

  it('does not throw when insert fails', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'DB error' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      logAuditEvent({
        adminId: 'admin-123',
        action: 'create',
        entityType: 'event',
        entityId: 'event-456',
        description: 'Created event: Test',
      })
    ).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith('Failed to write audit log:', { message: 'DB error' })
    consoleSpy.mockRestore()
  })

  it('does not throw when an exception occurs', async () => {
    mockInsert.mockRejectedValue(new Error('Network failure'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      logAuditEvent({
        adminId: 'admin-123',
        action: 'create',
        entityType: 'event',
        entityId: 'event-456',
        description: 'Created event: Test',
      })
    ).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith('Failed to write audit log:', expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('accepts all valid action types', async () => {
    const actions = ['create', 'update', 'delete', 'status_change', 'merge', 'submit'] as const

    for (const action of actions) {
      await logAuditEvent({
        adminId: 'admin-123',
        action,
        entityType: 'event',
        description: `Test ${action}`,
      })
    }

    expect(mockInsert).toHaveBeenCalledTimes(actions.length)
  })

  it('accepts all valid entity types', async () => {
    const entityTypes = ['event', 'route', 'rider', 'result', 'page', 'admin_user'] as const

    for (const entityType of entityTypes) {
      await logAuditEvent({
        adminId: 'admin-123',
        action: 'create',
        entityType,
        description: `Test ${entityType}`,
      })
    }

    expect(mockInsert).toHaveBeenCalledTimes(entityTypes.length)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsert = vi.fn()
vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: vi.fn(() => ({ insert: mockInsert })) })),
}))

import { logAuditEvent, logRiderAction } from '@/lib/audit-log'

describe('audit log writers', () => {
  beforeEach(() => {
    mockInsert.mockReset()
    mockInsert.mockResolvedValue({ error: null })
  })

  it('logAuditEvent writes admin_id and no actor', async () => {
    await logAuditEvent({
      adminId: 'admin-1',
      action: 'update',
      entityType: 'rider',
      entityId: 'r1',
      description: 'x',
    })
    expect(mockInsert).toHaveBeenCalledWith({
      admin_id: 'admin-1',
      actor_user_id: null,
      action: 'update',
      entity_type: 'rider',
      entity_id: 'r1',
      description: 'x',
    })
  })

  it('logRiderAction writes actor_user_id with a null admin_id', async () => {
    await logRiderAction({
      actorUserId: 'user-1',
      action: 'account_link',
      entityType: 'rider',
      entityId: 'r1',
      description: 'Rider linked account',
    })
    expect(mockInsert).toHaveBeenCalledWith({
      admin_id: null,
      actor_user_id: 'user-1',
      action: 'account_link',
      entity_type: 'rider',
      entity_id: 'r1',
      description: 'Rider linked account',
    })
  })

  it('never throws when the insert fails', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'boom' } })
    await expect(
      logRiderAction({
        actorUserId: 'u',
        action: 'account_delete',
        entityType: 'rider',
        description: 'd',
      })
    ).resolves.toBeUndefined()
  })
})

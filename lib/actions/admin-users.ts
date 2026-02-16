'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { logAuditEvent } from '@/lib/audit-log'
import { handleSupabaseError, createActionResult, logError } from '@/lib/errors'
import { isSuperAdmin } from '@/lib/auth/roles'
import type { Database } from '@/types/supabase'
import type { ActionResult } from '@/types/actions'
import type { AdminInsert, AdminUpdate } from '@/types/queries'

type AdminRole = Database['public']['Tables']['admins']['Row']['role']

export interface AdminUserData {
  email: string
  name: string
  phone?: string | null
  password: string
  role: AdminRole
  chapterId?: string | null
}

export async function createAdminUser(data: AdminUserData): Promise<ActionResult> {
  const currentAdmin = await requireAdmin()

  // Only super admins can create users
  if (!isSuperAdmin(currentAdmin.role)) {
    return { success: false, error: 'You do not have permission to create admin users' }
  }

  const { email, name, phone, password, role, chapterId } = data

  if (!email || !name || !password) {
    return { success: false, error: 'Missing required fields' }
  }

  // Chapter admins must have a chapter assigned
  if (role === 'chapter_admin' && !chapterId) {
    return { success: false, error: 'Chapter admins must have a chapter assigned' }
  }

  // Create auth user first
  const { data: authData, error: authError } = await getSupabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return handleSupabaseError(
      authError,
      { operation: 'createAdminUser.auth', skipSentry: true }, // Don't log auth errors
      authError?.message || 'Failed to create user'
    )
  }

  // Create admin record
  const adminInsert: AdminInsert = {
    id: authData.user.id,
    email,
    name,
    phone,
    role,
    chapter_id: role === 'chapter_admin' ? chapterId : null,
  }

  const { error: adminError } = await getSupabaseAdmin().from('admins').insert(adminInsert)

  if (adminError) {
    // Rollback: delete the auth user
    await getSupabaseAdmin().auth.admin.deleteUser(authData.user.id)
    return handleSupabaseError(
      adminError,
      { operation: 'createAdminUser.admin' },
      'Failed to create admin record'
    )
  }

  revalidatePath('/admin/users')

  await logAuditEvent({
    adminId: currentAdmin.id,
    action: 'create',
    entityType: 'admin_user',
    entityId: authData.user.id,
    description: `Created admin user: ${name} (${email})`,
  })

  return createActionResult()
}

export async function updateAdminUser(
  userId: string,
  data: Partial<Omit<AdminUserData, 'password' | 'email'>>
): Promise<ActionResult> {
  const currentAdmin = await requireAdmin()

  if (!isSuperAdmin(currentAdmin.role)) {
    return { success: false, error: 'You do not have permission to update admin users' }
  }

  const { name, phone, role, chapterId } = data

  if (role === 'chapter_admin' && !chapterId) {
    return { success: false, error: 'Chapter admins must have a chapter assigned' }
  }

  const updateData: AdminUpdate = {
    name,
    phone,
    role,
    chapter_id: role === 'chapter_admin' ? chapterId : null,
  }

  const { error } = await getSupabaseAdmin().from('admins').update(updateData).eq('id', userId)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'updateAdminUser' },
      'Failed to update admin user'
    )
  }

  revalidatePath('/admin/users')

  await logAuditEvent({
    adminId: currentAdmin.id,
    action: 'update',
    entityType: 'admin_user',
    entityId: userId,
    description: `Updated admin user: ${name || userId}`,
  })

  return createActionResult()
}

export async function deleteAdminUser(userId: string): Promise<ActionResult> {
  const currentAdmin = await requireAdmin()

  if (!isSuperAdmin(currentAdmin.role)) {
    return { success: false, error: 'You do not have permission to delete admin users' }
  }

  // Don't allow deleting yourself
  if (currentAdmin.id === userId) {
    return { success: false, error: 'You cannot delete your own account' }
  }

  // Fetch name before deleting for audit log
  const { data: adminToDelete } = await getSupabaseAdmin()
    .from('admins')
    .select('name')
    .eq('id', userId)
    .single()
  const deletedAdminName = (adminToDelete as { name: string } | null)?.name || userId

  // Delete admin record first
  const { error: adminError } = await getSupabaseAdmin().from('admins').delete().eq('id', userId)

  if (adminError) {
    return handleSupabaseError(
      adminError,
      { operation: 'deleteAdminUser.admin' },
      'Failed to delete admin record'
    )
  }

  // Delete auth user
  const { error: authError } = await getSupabaseAdmin().auth.admin.deleteUser(userId)

  if (authError) {
    // Note: Admin record is already deleted, but auth user remains
    // This is a partial failure state
    return handleSupabaseError(
      authError,
      { operation: 'deleteAdminUser.auth' },
      'Admin record deleted but auth user deletion failed'
    )
  }

  revalidatePath('/admin/users')

  await logAuditEvent({
    adminId: currentAdmin.id,
    action: 'delete',
    entityType: 'admin_user',
    entityId: userId,
    description: `Deleted admin user: ${deletedAdminName}`,
  })

  return createActionResult()
}

export async function resetAdminPassword(
  userId: string,
  newPassword: string
): Promise<ActionResult> {
  const currentAdmin = await requireAdmin()

  if (!isSuperAdmin(currentAdmin.role)) {
    return { success: false, error: 'You do not have permission to reset passwords' }
  }

  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' }
  }

  const { error } = await getSupabaseAdmin().auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'resetAdminPassword', skipSentry: true }, // Don't log password errors
      'Failed to reset password'
    )
  }

  return createActionResult()
}

export async function getAdminUsers() {
  const currentAdmin = await requireAdmin()

  if (!isSuperAdmin(currentAdmin.role)) {
    return []
  }

  const { data, error } = await getSupabaseAdmin()
    .from('admins')
    .select(
      `
      *,
      chapters (id, name)
    `
    )
    .order('created_at', { ascending: false })

  if (error) {
    logError(error, { operation: 'getAdminUsers' })
    return []
  }

  return data
}

interface Chapter {
  id: string
  name: string
  slug: string
}

export async function getChapters(): Promise<Chapter[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('chapters')
    .select('id, name, slug')
    .order('name', { ascending: true })

  if (error) {
    logError(error, { operation: 'getChapters' })
    return []
  }

  return data as Chapter[]
}

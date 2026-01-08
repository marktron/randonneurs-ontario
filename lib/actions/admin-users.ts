'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import type { Database } from '@/types/supabase'
import type { ActionResult } from '@/types/actions'

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
  if (currentAdmin.role !== 'admin') {
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
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    console.error('Error creating auth user:', authError)
    return { success: false, error: authError?.message || 'Failed to create user' }
  }

  // Create admin record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: adminError } = await (supabaseAdmin.from('admins') as any).insert({
    id: authData.user.id,
    email,
    name,
    phone,
    role,
    chapter_id: role === 'chapter_admin' ? chapterId : null,
  })

  if (adminError) {
    // Rollback: delete the auth user
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    console.error('Error creating admin record:', adminError)
    return { success: false, error: 'Failed to create admin record' }
  }

  revalidatePath('/admin/users')
  return { success: true }
}

export async function updateAdminUser(
  userId: string,
  data: Partial<Omit<AdminUserData, 'password' | 'email'>>
): Promise<ActionResult> {
  const currentAdmin = await requireAdmin()

  if (currentAdmin.role !== 'admin') {
    return { success: false, error: 'You do not have permission to update admin users' }
  }

  const { name, phone, role, chapterId } = data

  if (role === 'chapter_admin' && !chapterId) {
    return { success: false, error: 'Chapter admins must have a chapter assigned' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin.from('admins') as any)
    .update({
      name,
      phone,
      role,
      chapter_id: role === 'chapter_admin' ? chapterId : null,
    })
    .eq('id', userId)

  if (error) {
    console.error('Error updating admin:', error)
    return { success: false, error: 'Failed to update admin user' }
  }

  revalidatePath('/admin/users')
  return { success: true }
}

export async function deleteAdminUser(userId: string): Promise<ActionResult> {
  const currentAdmin = await requireAdmin()

  if (currentAdmin.role !== 'admin') {
    return { success: false, error: 'You do not have permission to delete admin users' }
  }

  // Don't allow deleting yourself
  if (currentAdmin.id === userId) {
    return { success: false, error: 'You cannot delete your own account' }
  }

  // Delete admin record first
  const { error: adminError } = await supabaseAdmin
    .from('admins')
    .delete()
    .eq('id', userId)

  if (adminError) {
    console.error('Error deleting admin record:', adminError)
    return { success: false, error: 'Failed to delete admin record' }
  }

  // Delete auth user
  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (authError) {
    console.error('Error deleting auth user:', authError)
    // Note: Admin record is already deleted, but auth user remains
    // This is a partial failure state
    return { success: false, error: 'Admin record deleted but auth user deletion failed' }
  }

  revalidatePath('/admin/users')
  return { success: true }
}

export async function resetAdminPassword(userId: string, newPassword: string): Promise<ActionResult> {
  const currentAdmin = await requireAdmin()

  if (currentAdmin.role !== 'admin') {
    return { success: false, error: 'You do not have permission to reset passwords' }
  }

  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' }
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (error) {
    console.error('Error resetting password:', error)
    return { success: false, error: 'Failed to reset password' }
  }

  return { success: true }
}

export async function getAdminUsers() {
  const currentAdmin = await requireAdmin()

  if (currentAdmin.role !== 'admin') {
    return []
  }

  const { data, error } = await supabaseAdmin
    .from('admins')
    .select(`
      *,
      chapters (id, name)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching admin users:', error)
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
  const { data, error } = await supabaseAdmin
    .from('chapters')
    .select('id, name, slug')
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching chapters:', error)
    return []
  }

  return data as Chapter[]
}

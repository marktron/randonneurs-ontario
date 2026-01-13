'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server-client'
import { handleSupabaseError, createActionResult } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

export interface LoginResult {
  success: boolean
  error?: string
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // Don't log auth errors to Sentry (security/privacy)
    return { success: false, error: error.message }
  }

  if (!data.user) {
    return { success: false, error: 'Login failed' }
  }

  // Verify user is an admin
  const { data: admin } = await supabase
    .from('admins')
    .select('id')
    .eq('id', data.user.id)
    .single()

  if (!admin) {
    await supabase.auth.signOut()
    return { success: false, error: 'You do not have admin access' }
  }

  return { success: true }
}

export async function logout(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/admin/login')
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ActionResult> {
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'New password must be at least 8 characters' }
  }

  const supabase = await createSupabaseServerClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return { success: false, error: 'Not authenticated' }
  }

  // Verify current password by re-authenticating
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (signInError) {
    return { success: false, error: 'Current password is incorrect' }
  }

  // Update to new password
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (updateError) {
    return handleSupabaseError(
      updateError,
      { operation: 'changePassword', skipSentry: true }, // Don't log password errors
      'Failed to update password'
    )
  }

  return createActionResult()
}

export async function updateProfile(
  name: string,
  phone: string | null,
  chapterId: string | null
): Promise<ActionResult> {
  if (!name || name.trim().length === 0) {
    return { success: false, error: 'Name is required' }
  }

  const supabase = await createSupabaseServerClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Update admin profile
  const { error } = await supabase
    .from('admins')
    .update({
      name: name.trim(),
      phone: phone?.trim() || null,
      chapter_id: chapterId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'updateProfile' },
      'Failed to update profile'
    )
  }

  return createActionResult()
}

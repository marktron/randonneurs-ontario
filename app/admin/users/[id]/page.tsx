import { requireAdmin } from '@/lib/auth/get-admin'
import { getChapters } from '@/lib/actions/admin-users'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import { UserForm } from '@/components/admin/user-form'
import { ResetPasswordForm } from '@/components/admin/reset-password-form'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { AdminUser } from '@/types/queries'

interface EditUserPageProps {
  params: Promise<{ id: string }>
}

export default async function EditUserPage({ params }: EditUserPageProps) {
  const { id } = await params
  const admin = await requireAdmin()

  if (admin.role !== 'admin') {
    redirect('/admin')
  }

  const [{ data: user }, chapters] = await Promise.all([
    getSupabaseAdmin().from('admins').select('*').eq('id', id).single(),
    getChapters(),
  ])

  if (!user) {
    notFound()
  }

  const typedUser = user as AdminUser

  return (
    <div className="space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Users
      </Link>

      <div className="max-w-2xl space-y-6">
        <UserForm
          chapters={chapters}
          user={{
            ...typedUser,
            role: (typedUser.role as 'admin' | 'chapter_admin') || 'chapter_admin',
          }}
          mode="edit"
        />
        <ResetPasswordForm userId={typedUser.id} />
      </div>
    </div>
  )
}

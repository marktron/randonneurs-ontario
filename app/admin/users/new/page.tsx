import { requireAdmin } from '@/lib/auth/get-admin'
import { getChapters } from '@/lib/actions/admin-users'
import { redirect } from 'next/navigation'
import { UserForm } from '@/components/admin/user-form'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function NewUserPage() {
  const admin = await requireAdmin()

  if (admin.role !== 'admin') {
    redirect('/admin')
  }

  const chapters = await getChapters()

  return (
    <div className="space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Users
      </Link>

      <div className="max-w-2xl">
        <UserForm chapters={chapters} mode="create" />
      </div>
    </div>
  )
}

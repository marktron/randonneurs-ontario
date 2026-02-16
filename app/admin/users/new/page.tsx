import { requireAdmin } from '@/lib/auth/get-admin'
import { isSuperAdmin } from '@/lib/auth/roles'
import { getChapters } from '@/lib/actions/admin-users'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

// Lazy-load UserForm (form component)
const UserForm = dynamic(
  () => import('@/components/admin/user-form').then((mod) => ({ default: mod.UserForm })),
  {
    loading: () => (
      <div className="space-y-6">
        <div className="h-10 bg-muted animate-pulse rounded" />
        <div className="h-10 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded" />
      </div>
    ),
  }
)

export default async function NewUserPage() {
  const admin = await requireAdmin()

  if (!isSuperAdmin(admin.role)) {
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

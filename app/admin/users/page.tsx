import { requireAdmin } from '@/lib/auth/get-admin'
import { getAdminUsers } from '@/lib/actions/admin-users'
import { redirect } from 'next/navigation'
import { AdminUsersTable } from '@/components/admin/users-table'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'

export default async function AdminUsersPage() {
  const admin = await requireAdmin()

  // Only super admins can access this page
  if (admin.role !== 'admin') {
    redirect('/admin')
  }

  const users = await getAdminUsers()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Users</h1>
          <p className="text-muted-foreground">
            Manage admin and chapter admin accounts
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/users/new">
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Link>
        </Button>
      </div>

      <AdminUsersTable users={users} currentAdminId={admin.id} />
    </div>
  )
}

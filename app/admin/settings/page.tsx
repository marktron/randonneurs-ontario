import { requireAdmin } from '@/lib/auth/get-admin'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChangePasswordForm } from '@/components/admin/change-password-form'
import { EditProfileForm } from '@/components/admin/edit-profile-form'
import { getChapters } from '@/lib/actions/admin-users'

const ALLOWED_CHAPTER_SLUGS = ['huron', 'ottawa', 'simcoe', 'toronto']

export default async function AdminSettingsPage() {
  const [admin, allChapters] = await Promise.all([requireAdmin(), getChapters()])

  type Chapter = Awaited<ReturnType<typeof getChapters>>[number]
  const chapters = (allChapters as Chapter[])
    .filter((c) => ALLOWED_CHAPTER_SLUGS.includes(c.slug))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      <div className="grid gap-6 max-w-2xl">
        <EditProfileForm
          initialName={admin.name}
          initialPhone={admin.phone}
          initialChapterId={admin.chapter_id}
          chapters={chapters}
        />

        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
            <CardDescription>Read-only account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Email</span>
              <p className="font-medium">{admin.email}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Role</span>
              <p className="font-medium capitalize">{admin.role?.replace('_', ' ')}</p>
            </div>
          </CardContent>
        </Card>

        <ChangePasswordForm />
      </div>
    </div>
  )
}

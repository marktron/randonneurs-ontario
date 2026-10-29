import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/get-admin'
import { isFullAdmin } from '@/lib/auth/roles'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { AwardAssignForm, type AwardOption } from '@/components/admin/award-assign-form'

export default async function AdminAwardsPage() {
  const admin = await requireAdmin()
  if (!isFullAdmin(admin.role)) {
    redirect('/admin')
  }

  const { data } = await getSupabaseAdmin()
    .from('awards')
    .select('id, slug, title, award_type, description')
    .neq('slug', 'course-record')
    .order('title', { ascending: true })

  const awards = ((data as AwardOption[] | null) ?? []).filter(
    (a) => a.award_type === 'result' || a.award_type === 'season'
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Awards</h1>
        <p className="text-muted-foreground">
          Assign an award to a member. Contact the site admin if you need to remove an award from a
          member.
        </p>
      </div>

      <AwardAssignForm awards={awards} />
    </div>
  )
}

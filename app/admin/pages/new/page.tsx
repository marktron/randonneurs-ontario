import { requireAdmin } from '@/lib/auth/get-admin'
import { PageEditor } from '@/components/admin/page-editor'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function AdminNewPagePage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/pages">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">New Page</h1>
          <p className="text-muted-foreground">
            Create a new content page
          </p>
        </div>
      </div>

      <PageEditor isNew />
    </div>
  )
}

import { getNavigationRaw, getAllPages } from '@/lib/content'
import { NavigationEditor } from '@/components/admin/navigation-editor'

export const metadata = { title: 'Navigation' }

export default function NavigationPage() {
  const config = getNavigationRaw()
  const pages = getAllPages()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Navigation</h1>
        <p className="text-muted-foreground">
          Manage the site navigation menu. Saving changes triggers a new deployment, which can take up to 5 minutes to appear on the site.
        </p>
      </div>
      <NavigationEditor initialConfig={config} pages={pages} />
    </div>
  )
}

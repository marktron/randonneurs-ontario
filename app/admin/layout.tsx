import { getAdmin } from '@/lib/auth/get-admin'
import { AdminSidebar } from '@/components/admin/sidebar'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'

export const metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdmin()

  // If not admin (login page), render without sidebar
  if (!admin) {
    return <>{children}</>
  }

  return (
    <SidebarProvider>
      <AdminSidebar admin={admin} />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 px-4 md:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium">RO Admin</span>
        </header>
        <div className="flex-1 p-4 sm:p-6">{children}</div>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  )
}

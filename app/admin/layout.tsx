import { getAdmin } from '@/lib/auth/get-admin'
import { AdminSidebar } from '@/components/admin/sidebar'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
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
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  )
}

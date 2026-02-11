'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Users,
  UserCog,
  Calendar,
  Route,
  Trophy,
  LogOut,
  FileText,
  ScrollText,
  Settings,
} from 'lucide-react'
import { logout } from '@/lib/actions/auth'
import type { AdminUser } from '@/types/queries'

interface AdminSidebarProps {
  admin: AdminUser
}

const mainNavItems = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
    testId: 'nav-dashboard',
  },
  {
    title: 'Events',
    href: '/admin/events',
    icon: Calendar,
    testId: 'nav-events',
  },
  {
    title: 'Routes',
    href: '/admin/routes',
    icon: Route,
    testId: 'nav-routes',
  },
  {
    title: 'Riders',
    href: '/admin/riders',
    icon: Users,
    testId: 'nav-riders',
  },
  {
    title: 'Results',
    href: '/admin/results',
    icon: Trophy,
    testId: 'nav-results',
  },
]

const managementNavItems = [
  {
    title: 'Pages',
    href: '/admin/pages',
    icon: FileText,
    testId: 'nav-pages',
  },
  {
    title: 'Admin Users',
    href: '/admin/users',
    icon: UserCog,
    testId: 'nav-users',
  },
  {
    title: 'Audit Log',
    href: '/admin/logs',
    icon: ScrollText,
    testId: 'nav-logs',
  },
]

export function AdminSidebar({ admin }: AdminSidebarProps) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin'
    }
    return pathname.startsWith(href)
  }

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="font-semibold text-lg">RO Admin</span>
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)}>
                    <Link href={item.href} data-testid={item.testId}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {admin.role === 'admin' && (
          <SidebarGroup>
            <SidebarGroupLabel>Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {managementNavItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.href)}>
                      <Link href={item.href} data-testid={item.testId}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex flex-col gap-2">
          <div className="text-sm">
            <p className="font-medium">{admin.name}</p>
            <p className="text-muted-foreground text-xs">{admin.email}</p>
            <p className="text-muted-foreground text-xs capitalize">
              {admin.role?.replace('_', ' ') || 'User'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <Link href="/admin/settings" data-testid="nav-settings">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Link>
            </Button>
            <form action={logout}>
              <Button variant="outline" size="sm" type="submit" data-testid="logout-button">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

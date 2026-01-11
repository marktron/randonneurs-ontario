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
  Settings,
} from 'lucide-react'
import { logout } from '@/lib/actions/auth'
import type { Admin } from '@/types/supabase'

interface AdminSidebarProps {
  admin: Admin
}

const mainNavItems = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    title: 'Events',
    href: '/admin/events',
    icon: Calendar,
  },
  {
    title: 'Routes',
    href: '/admin/routes',
    icon: Route,
  },
  {
    title: 'Riders',
    href: '/admin/riders',
    icon: Users,
  },
  {
    title: 'Results',
    href: '/admin/results',
    icon: Trophy,
  },
]

const managementNavItems = [
  {
    title: 'Pages',
    href: '/admin/pages',
    icon: FileText,
  },
  {
    title: 'Admin Users',
    href: '/admin/users',
    icon: UserCog,
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
                    <Link href={item.href}>
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
                      <Link href={item.href}>
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
            <p className="text-muted-foreground text-xs capitalize">{admin.role?.replace('_', ' ') || 'User'}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <Link href="/admin/settings">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Link>
            </Button>
            <form action={logout}>
              <Button variant="outline" size="sm" type="submit">
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

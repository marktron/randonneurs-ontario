'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { MenuIcon, ChevronDownIcon } from 'lucide-react'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import type { NavItem } from '@/types/navigation'

const dropdownLinkStyles = 'block rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors'

interface NavbarProps {
  items: NavItem[]
}

export function Navbar({ items }: NavbarProps) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.svg"
            alt="Randonneurs Ontario"
            width={157}
            height={107}
            className="h-10 w-auto"
            // SVG: served as-is; next/image won't optimize vector sources
            unoptimized
          />
          <span className="hidden font-serif font-medium text-lg tracking-tight sm:inline-block">
            Randonneurs Ontario
          </span>
        </Link>

        {/* Desktop Navigation */}
        <NavigationMenu viewport={false} className="hidden lg:flex">
          <NavigationMenuList>
            {items.map((item, i) => {
              if (item.style === 'cta') {
                return (
                  <NavigationMenuItem key={i}>
                    <Link
                      href={item.href!}
                      className="inline-flex items-center rounded-full bg-red-600 ml-3 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                    >
                      {item.label}
                    </Link>
                  </NavigationMenuItem>
                )
              }
              if (item.children) {
                return (
                  <NavigationMenuItem key={i}>
                    <NavigationMenuTrigger className="bg-transparent hover:bg-muted/50 data-open:bg-muted/50">
                      {item.label}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid w-52 gap-1 p-2">
                        {item.children.map((child, j) => (
                          <NavChildItem key={j} item={child} />
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                )
              }
              return null
            })}
          </NavigationMenuList>
        </NavigationMenu>

        {/* Mobile Menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="ghost" size="icon">
              <MenuIcon className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[85vw] max-w-80 overflow-y-auto">
            <SheetHeader className="pt-4">
              <SheetTitle className="font-serif">
                <Link href="/" onClick={() => setOpen(false)}>
                  Randonneurs Ontario
                </Link>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 mt-3 px-3">
              {items.map((item, i) => {
                if (item.style === 'cta') {
                  return (
                    <Link
                      key={i}
                      href={item.href!}
                      onClick={() => setOpen(false)}
                      className="mt-2 rounded-full bg-red-600 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-red-700"
                    >
                      {item.label}
                    </Link>
                  )
                }
                if (item.children) {
                  return (
                    <MobileNavSection key={i} title={item.label}>
                      {item.children.map((child, j) => (
                        <MobileNavChildItem key={j} item={child} onClose={() => setOpen(false)} />
                      ))}
                    </MobileNavSection>
                  )
                }
                return null
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}

function NavChildItem({ item }: { item: NavItem }) {
  if (item.separator) return <li className="border-t border-border my-1" />
  if (item.type === 'heading') {
    return <li className="px-3 py-1.5 text-xs font-medium text-muted-foreground">{item.label}</li>
  }
  if (item.external) {
    return (
      <li>
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={dropdownLinkStyles}
        >
          {item.label}
        </a>
      </li>
    )
  }
  return (
    <li>
      <Link href={item.href!} className={dropdownLinkStyles}>
        {item.label}
      </Link>
    </li>
  )
}

function MobileNavChildItem({ item, onClose }: { item: NavItem; onClose: () => void }) {
  const mobileStyles =
    'block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors'

  if (item.separator) return <div className="border-t border-border my-1" />
  if (item.type === 'heading') {
    return <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">{item.label}</div>
  }
  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
        className={mobileStyles}
      >
        {item.label}
      </a>
    )
  }
  return (
    <Link href={item.href!} onClick={onClose} className={mobileStyles}>
      {item.label}
    </Link>
  )
}

function MobileNavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg hover:bg-muted transition-colors">
        {title}
        <ChevronDownIcon className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-3 mt-1 space-y-1">{children}</CollapsibleContent>
    </Collapsible>
  )
}

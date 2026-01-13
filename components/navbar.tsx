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

const currentSeason = process.env.NEXT_PUBLIC_CURRENT_SEASON || '2026'
const currentYear = new Date().getFullYear()
const mostRecentPbpYear = currentYear - ((currentYear - 3) % 4) // PBP years: 2023, 2027, 2031...
const mostRecentGraniteAnvilYear = 2025

const chapters = ['Huron', 'Ottawa', 'Simcoe-Muskoka', 'Toronto']

const dropdownLinkStyles = 'block rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors'

export function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Randonneurs Ontario"
            width={160}
            height={113}
            className="h-10 w-auto"
          />
          <span className="hidden font-serif font-medium text-lg tracking-tight sm:inline-block">
            Randonneurs Ontario
          </span>
        </Link>

        {/* Desktop Navigation */}
        <NavigationMenu viewport={false} className="hidden lg:flex">
          <NavigationMenuList>
            {/* About */}
            <NavigationMenuItem>
              <NavigationMenuTrigger className="bg-transparent hover:bg-muted/50 data-open:bg-muted/50">
                About
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-52 gap-1 p-2">
                  <li>
                    <Link href="/about" className={dropdownLinkStyles}>
                      About Us
                    </Link>
                  </li>
                  <li>
                    <Link href="/intro" className={dropdownLinkStyles}>
                      What is Randonneuring?
                    </Link>
                  </li>
                  <li>
                    <a
                      href="https://blog.randonneursontario.ca"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={dropdownLinkStyles}
                    >
                      Blog
                    </a>
                  </li>
                  <li>
                    <Link href="/policies" className={dropdownLinkStyles}>
                      Club Policies
                    </Link>
                  </li>
                  <li>
                    <Link href="/mailing-list" className={dropdownLinkStyles}>
                      Mailing List
                    </Link>
                  </li>
                  <li>
                    <Link href="/contact" className={dropdownLinkStyles}>
                      Contact
                    </Link>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* Routes */}
            <NavigationMenuItem>
              <NavigationMenuTrigger className="bg-transparent hover:bg-muted/50 data-open:bg-muted/50">
                Routes
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-48 gap-1 p-2">
                  {chapters.map((chapter) => (
                    <li key={chapter}>
                      <Link
                        href={`/routes/${chapter.toLowerCase().replace(' ', '-')}`}
                        className={dropdownLinkStyles}
                      >
                        {chapter}
                      </Link>
                    </li>
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* Calendar */}
            <NavigationMenuItem>
              <NavigationMenuTrigger className="bg-transparent hover:bg-muted/50 data-open:bg-muted/50">
                Calendar
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-48 gap-1 p-2">
                  {chapters.map((chapter) => (
                    <li key={chapter}>
                      <Link
                        href={`/calendar/${chapter.toLowerCase().replace(' ', '-')}`}
                        className={dropdownLinkStyles}
                      >
                        {chapter}
                      </Link>
                    </li>
                  ))}
                  <li className="border-t border-border my-1" />
                  <li>
                    <Link href="/calendar/permanents" className={dropdownLinkStyles}>
                      Permanents
                    </Link>
                  </li>
                  <li>
                    <Link href="/devil-week-2026" className={dropdownLinkStyles}>
                      Devil Week 2026
                    </Link>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* Results */}
            <NavigationMenuItem>
              <NavigationMenuTrigger className="bg-transparent hover:bg-muted/50 data-open:bg-muted/50">
                Results
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-48 gap-1 p-2">
                  <li className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    Chapters
                  </li>
                  {chapters.map((chapter) => (
                    <li key={chapter}>
                      <Link
                        href={`/results/${currentSeason}/${chapter.toLowerCase().replace(' ', '-')}`}
                        className={dropdownLinkStyles}
                      >
                        {chapter}
                      </Link>
                    </li>
                  ))}
                  <li className="border-t border-border my-1" />
                  <li>
                    <Link
                      href={`/results/${currentSeason}/permanent`}
                      className={dropdownLinkStyles}
                    >
                      Permanents
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/results/${mostRecentGraniteAnvilYear}/granite-anvil`}
                      className={dropdownLinkStyles}
                    >
                      Granite Anvil
                    </Link>
                  </li>
                  <li>
                    <Link href={`/results/${mostRecentPbpYear}/pbp`} className={dropdownLinkStyles}>
                      Paris-Brest-Paris
                    </Link>
                  </li>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* Membership */}
            <NavigationMenuItem>
              <Link
                href="/membership"
                className="inline-flex items-center rounded-full bg-red-600 ml-3 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Join the club
              </Link>
            </NavigationMenuItem>
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
            <SheetHeader>
              <SheetTitle className="font-serif">Randonneurs Ontario</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 mt-6 px-3">
              {/* About */}
              <MobileNavSection title="About">
                <Link
                  href="/about"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  About Us
                </Link>
                <Link
                  href="/intro"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  What is Randonneuring?
                </Link>
                <a
                  href="https://blog.randonneursontario.ca"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  Blog
                </a>
                <Link
                  href="/policies"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  Club Policies
                </Link>
                <Link
                  href="/mailing-list"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  Mailing List
                </Link>
                <Link
                  href="/contact"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  Contact
                </Link>
              </MobileNavSection>

              {/* Routes */}
              <MobileNavSection title="Routes">
                {chapters.map((chapter) => (
                  <Link
                    key={chapter}
                    href={`/routes/${chapter.toLowerCase().replace(' ', '-')}`}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  >
                    {chapter}
                  </Link>
                ))}
              </MobileNavSection>

              {/* Calendar */}
              <MobileNavSection title="Calendar">
                {chapters.map((chapter) => (
                  <Link
                    key={chapter}
                    href={`/calendar/${chapter.toLowerCase().replace(' ', '-')}`}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  >
                    {chapter}
                  </Link>
                ))}
                <div className="border-t border-border my-1" />
                <Link
                  href="/calendar/permanents"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  Permanents
                </Link>
                <Link
                  href="/devil-week-2026"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  Devil Week 2026
                </Link>
              </MobileNavSection>

              {/* Results */}
              <MobileNavSection title="Results">
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Chapters
                </div>
                {chapters.map((chapter) => (
                  <Link
                    key={chapter}
                    href={`/results/${currentSeason}/${chapter.toLowerCase().replace(' ', '-')}`}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                  >
                    {chapter}
                  </Link>
                ))}
                <div className="border-t border-border my-1" />
                <Link
                  href={`/results/${currentSeason}/permanent`}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  Permanents
                </Link>
                <Link
                  href={`/results/${mostRecentGraniteAnvilYear}/granite-anvil`}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  Granite Anvil
                </Link>
                <Link
                  href={`/results/${mostRecentPbpYear}/pbp`}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                >
                  Paris-Brest-Paris
                </Link>
              </MobileNavSection>

              {/* Membership */}
              <Link
                href="/membership"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-full bg-red-600 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Join the club
              </Link>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
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

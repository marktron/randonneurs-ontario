'use client'

import dynamic from 'next/dynamic'
import { Footer } from '@/components/footer'

// Dynamic import with ssr: false to avoid Radix UI hydration mismatch
// Radix components use useId() internally which can generate different IDs on server vs client
const Navbar = dynamic(() => import('@/components/navbar').then((mod) => mod.Navbar), {
  ssr: false,
})

interface PageShellProps {
  children: React.ReactNode
}

export function PageShell({ children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:border focus:border-border focus:rounded-md focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Navbar />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  )
}

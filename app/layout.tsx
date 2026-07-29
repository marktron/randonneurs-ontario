import type { Metadata } from 'next'
import { Noto_Sans, Noto_Serif } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthRedirectHandler } from '@/components/auth-redirect-handler'
import { OrganizationJsonLd } from '@/components/structured-data'
import { SITE_URL } from '@/lib/site-url'
import './globals.css'

// `axes: ['wdth']` opts into the variable font's width axis so that
// `font-stretch: 50%` / `75%` (used by the printed control cards) actually
// maps to a real font-variation-setting. Without it, next/font only loads
// the `wght` axis and font-stretch is silently ignored.
const notoSans = Noto_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  axes: ['wdth'],
})
const notoSerif = Noto_Serif({
  variable: '--font-serif',
  subsets: ['latin'],
  axes: ['wdth'],
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Relative canonical resolves against the current route, so every page
  // gets a self-referencing canonical on the canonical host.
  alternates: {
    canonical: './',
  },
  title: {
    default: 'Randonneurs Ontario',
    template: '%s | Randonneurs Ontario',
  },
  description:
    'Long-distance cycling club in Ontario, Canada. Join us for brevets, populaires, and other randonneuring events across Toronto, Ottawa, Simcoe-Muskoka, and Huron chapters.',
  keywords: [
    'randonneuring',
    'cycling',
    'brevet',
    'populaire',
    'long-distance cycling',
    'Ontario',
    'Toronto',
    'Ottawa',
    'audax',
  ],
  authors: [{ name: 'Randonneurs Ontario' }],
  openGraph: {
    type: 'website',
    locale: 'en_CA',
    siteName: 'Randonneurs Ontario',
    images: [{ url: '/og-default.jpg', width: 1200, height: 630, alt: 'Randonneurs Ontario' }],
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${notoSans.variable} ${notoSerif.variable} antialiased`}>
      <head>
        <link rel="help" type="text/markdown" href="/llms.txt" />
      </head>
      <body>
        <OrganizationJsonLd baseUrl={SITE_URL} />
        <AuthRedirectHandler />
        {children}
        <Analytics />
      </body>
    </html>
  )
}

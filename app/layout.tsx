import type { Metadata } from 'next'
import { Noto_Sans, Noto_Serif } from 'next/font/google'
import { AuthRedirectHandler } from '@/components/auth-redirect-handler'
import { OrganizationJsonLd } from '@/components/structured-data'
import './globals.css'

const notoSans = Noto_Sans({ variable: '--font-sans' })
const notoSerif = Noto_Serif({ variable: '--font-serif', subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
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
    title: 'Randonneurs Ontario',
    description:
      'Long-distance cycling club in Ontario, Canada. Join us for brevets, populaires, and other randonneuring events.',
    images: [{ url: '/og-default.jpg', width: 1200, height: 630, alt: 'Randonneurs Ontario' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Randonneurs Ontario',
    description: 'Long-distance cycling club in Ontario, Canada.',
    images: ['/og-default.jpg'],
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
      <body>
        <OrganizationJsonLd
          baseUrl={process.env.NEXT_PUBLIC_SITE_URL ?? 'https://randonneursontario.ca'}
        />
        <AuthRedirectHandler />
        {children}
      </body>
    </html>
  )
}

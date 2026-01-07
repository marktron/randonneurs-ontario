import type { Metadata } from "next";
import { Noto_Sans, Noto_Serif } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans({variable:'--font-sans'});
const notoSerif = Noto_Serif({variable:'--font-serif', subsets: ['latin']});

export const metadata: Metadata = {
  metadataBase: new URL('https://randonneurs.to'),
  title: {
    default: 'Randonneurs Ontario',
    template: '%s | Randonneurs Ontario',
  },
  description: 'Long-distance cycling club in Ontario, Canada. Join us for brevets, populaires, and other randonneuring events across Toronto, Ottawa, Simcoe-Muskoka, and Huron chapters.',
  keywords: ['randonneuring', 'cycling', 'brevet', 'populaire', 'long-distance cycling', 'Ontario', 'Toronto', 'Ottawa', 'audax'],
  authors: [{ name: 'Randonneurs Ontario' }],
  openGraph: {
    type: 'website',
    locale: 'en_CA',
    siteName: 'Randonneurs Ontario',
    title: 'Randonneurs Ontario',
    description: 'Long-distance cycling club in Ontario, Canada. Join us for brevets, populaires, and other randonneuring events.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Randonneurs Ontario',
    description: 'Long-distance cycling club in Ontario, Canada.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${notoSans.variable} ${notoSerif.variable} antialiased`}>
      <body>
        {children}
      </body>
    </html>
  );
}

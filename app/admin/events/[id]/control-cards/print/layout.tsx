import '@/app/globals.css'

export const metadata = {
  title: 'Control Cards - Print',
  robots: { index: false, follow: false },
}

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Minimal layout for printing - no sidebars or navigation
  return <>{children}</>
}

// Static print stylesheet — injected into <head> at parse time so Safari's
// print pipeline sees it immediately (vs styled-jsx which injects styles at
// React commit time and was not being honoured reliably for print).
import '@/components/admin/control-cards-print.css'

export const metadata = {
  title: 'Control Cards - Print',
  robots: { index: false, follow: false },
}

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  // Fonts come from next/font/google (loaded at the root layout via
  // --font-sans / --font-serif).
  return <>{children}</>
}

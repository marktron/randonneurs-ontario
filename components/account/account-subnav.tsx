import Link from 'next/link'
import { SignOutButton } from '@/components/account/sign-out-button'

/**
 * Shared navigation for signed-in rider account pages (overview, settings,
 * unmatched, choose-rider). Rendered from `app/account/layout.tsx` only when
 * a session exists, so every account page — including ones reached without
 * going through the linked overview — has a way to reach Settings and sign
 * out.
 */
export function AccountSubnav() {
  return (
    <nav className="mb-6 flex items-center gap-4 text-sm">
      <Link href="/account" className="underline underline-offset-4">
        My account
      </Link>
      <Link href="/account/settings" className="underline underline-offset-4">
        Settings
      </Link>
      <SignOutButton variant="ghost" />
    </nav>
  )
}

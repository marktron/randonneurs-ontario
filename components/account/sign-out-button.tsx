'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { signOutRider } from '@/lib/actions/account'

export function SignOutButton({
  variant = 'outline',
}: {
  variant?: 'outline' | 'ghost' | 'secondary'
}) {
  const [isPending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant={variant}
      disabled={isPending}
      onClick={() => startTransition(() => signOutRider())}
    >
      {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      Sign out
    </Button>
  )
}

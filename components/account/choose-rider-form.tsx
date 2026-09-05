'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2 } from 'lucide-react'
import { chooseRider } from '@/lib/actions/account'
import type { LinkCandidate } from '@/lib/account/linking'

export function ChooseRiderForm({ candidates }: { candidates: LinkCandidate[] }) {
  const router = useRouter()
  const [riderId, setRiderId] = useState(candidates[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await chooseRider(riderId)
      if (result.success && result.data) {
        router.push(result.data.next)
        router.refresh()
      } else {
        setError(result.error || 'Could not link that rider.')
        router.refresh() // candidate list may have changed
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <RadioGroup value={riderId} onValueChange={setRiderId} className="gap-3">
        {candidates.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-md border p-3">
            <RadioGroupItem value={c.id} id={`rider-${c.id}`} />
            <Label htmlFor={`rider-${c.id}`} className="cursor-pointer">
              {c.firstName} {c.lastName.charAt(0)}.
            </Label>
          </div>
        ))}
      </RadioGroup>
      <Button type="submit" disabled={isPending || !riderId}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        This is me
      </Button>
    </form>
  )
}

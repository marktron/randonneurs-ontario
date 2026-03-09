'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2 } from 'lucide-react'
import { updateRider } from '@/lib/actions/riders'
import { toast } from 'sonner'

interface RiderEditFormProps {
  rider: {
    id: string
    first_name: string
    last_name: string
    email: string | null
  }
}

export function RiderEditForm({ rider }: RiderEditFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState(rider.first_name)
  const [lastName, setLastName] = useState(rider.last_name)
  const [email, setEmail] = useState(rider.email || '')

  const hasChanges =
    firstName !== rider.first_name || lastName !== rider.last_name || email !== (rider.email || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await updateRider(rider.id, {
        firstName,
        lastName,
        email: email || null,
      })

      if (result.success) {
        toast.success('Rider updated')
        router.refresh()
      } else {
        setError(result.error || 'Failed to update rider')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rider Details</CardTitle>
        <CardDescription>Edit name and email address</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="No email on file"
            />
          </div>

          <Button type="submit" disabled={isPending || !hasChanges}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

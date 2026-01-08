'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2 } from 'lucide-react'
import { createAdminUser, updateAdminUser } from '@/lib/actions/admin-users'
import { toast } from 'sonner'
import type { ChapterOptionWithSlug } from '@/types/ui'

interface AdminUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'chapter_admin'
  chapter_id: string | null
}

interface UserFormProps {
  chapters: ChapterOptionWithSlug[]
  user?: AdminUser | null
  mode: 'create' | 'edit'
}

export function UserForm({ chapters, user, mode }: UserFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'chapter_admin'>(user?.role || 'chapter_admin')
  const [chapterId, setChapterId] = useState<string>(user?.chapter_id || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      if (mode === 'create') {
        const result = await createAdminUser({
          email,
          name,
          password,
          role,
          chapterId: role === 'chapter_admin' ? chapterId : null,
        })

        if (result.success) {
          toast.success('User created successfully')
          router.push('/admin/users')
        } else {
          setError(result.error || 'Failed to create user')
        }
      } else if (user) {
        const result = await updateAdminUser(user.id, {
          name,
          role,
          chapterId: role === 'chapter_admin' ? chapterId : null,
        })

        if (result.success) {
          toast.success('User updated successfully')
          router.push('/admin/users')
        } else {
          setError(result.error || 'Failed to update user')
        }
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'create' ? 'Create Admin User' : 'Edit Admin User'}</CardTitle>
        <CardDescription>
          {mode === 'create'
            ? 'Add a new administrator or chapter admin'
            : 'Update administrator details'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isPending || mode === 'edit'}
            />
            {mode === 'edit' && (
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            )}
          </div>

          {mode === 'create' && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'chapter_admin')} disabled={isPending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin (Full Access)</SelectItem>
                <SelectItem value="chapter_admin">Chapter Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === 'chapter_admin' && (
            <div className="space-y-2">
              <Label htmlFor="chapter">Chapter</Label>
              <Select value={chapterId} onValueChange={setChapterId} disabled={isPending}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a chapter" />
                </SelectTrigger>
                <SelectContent>
                  {chapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      {chapter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'create' ? 'Creating...' : 'Saving...'}
                </>
              ) : (
                mode === 'create' ? 'Create User' : 'Save Changes'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/admin/users')}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

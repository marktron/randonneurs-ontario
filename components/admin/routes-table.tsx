'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Pencil, Trash2, ExternalLink, Loader2, Eye, EyeOff } from 'lucide-react'
import { deleteRoute, toggleRouteActive } from '@/lib/actions/routes'
import { toast } from 'sonner'

interface RouteWithChapter {
  id: string
  name: string
  slug: string
  distance_km: number | null
  collection: string | null
  rwgps_id: string | null
  is_active: boolean
  chapters: { id: string; name: string } | null
}

interface Chapter {
  id: string
  name: string
}

interface RoutesTableProps {
  routes: RouteWithChapter[]
  chapters: Chapter[]
}

export function RoutesTable({ routes, chapters }: RoutesTableProps) {
  const [isPending, startTransition] = useTransition()
  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [chapterFilter, setChapterFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredRoutes = routes.filter((route) => {
    const matchesSearch = route.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesChapter = chapterFilter === 'all' || route.chapters?.id === chapterFilter
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && route.is_active) ||
      (statusFilter === 'inactive' && !route.is_active)

    return matchesSearch && matchesChapter && matchesStatus
  })

  const handleDelete = () => {
    if (!deleteRouteId) return

    startTransition(async () => {
      const result = await deleteRoute(deleteRouteId)
      if (result.success) {
        toast.success('Route deleted successfully')
      } else {
        toast.error(result.error || 'Failed to delete route')
      }
      setDeleteRouteId(null)
    })
  }

  const handleToggleActive = (routeId: string, currentActive: boolean) => {
    startTransition(async () => {
      const result = await toggleRouteActive(routeId, !currentActive)
      if (result.success) {
        toast.success(currentActive ? 'Route marked as inactive' : 'Route marked as active')
      } else {
        toast.error(result.error || 'Failed to update route')
      }
    })
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <Input
          placeholder="Search routes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={chapterFilter} onValueChange={setChapterFilter}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue placeholder="All Chapters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Chapters</SelectItem>
            {chapters.map((chapter) => (
              <SelectItem key={chapter.id} value={chapter.id}>
                {chapter.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Chapter</TableHead>
              <TableHead>Distance</TableHead>
              <TableHead>Collection</TableHead>
              <TableHead>RWGPS</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRoutes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No routes found
                </TableCell>
              </TableRow>
            ) : (
              filteredRoutes.map((route) => (
                <TableRow key={route.id} className={!route.is_active ? 'opacity-60' : ''}>
                  <TableCell>
                    <p className="font-medium">{route.name}</p>
                    <p className="text-xs text-muted-foreground">{route.slug}</p>
                  </TableCell>
                  <TableCell>{route.chapters?.name || '—'}</TableCell>
                  <TableCell>
                    {route.distance_km ? `${route.distance_km} km` : '—'}
                  </TableCell>
                  <TableCell>{route.collection || '—'}</TableCell>
                  <TableCell>
                    {route.rwgps_id ? (
                      <a
                        href={`https://ridewithgps.com/routes/${route.rwgps_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {route.rwgps_id}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={route.is_active ? 'default' : 'secondary'}>
                      {route.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleToggleActive(route.id, route.is_active)}
                        disabled={isPending}
                        title={route.is_active ? 'Mark inactive' : 'Mark active'}
                      >
                        {route.is_active ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon-sm" asChild>
                        <Link href={`/admin/routes/${route.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteRouteId(route.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteRouteId} onOpenChange={() => setDeleteRouteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Route</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this route? This action cannot be undone.
              Routes that are used by events cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

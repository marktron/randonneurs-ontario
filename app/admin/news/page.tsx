import { requireAdmin } from '@/lib/auth/get-admin'
import { getAllNews } from '@/lib/data/news'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ClickableTableRow } from '@/components/admin/clickable-table-row'
import { Badge } from '@/components/ui/badge'
import { Megaphone, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function AdminNewsPage() {
  await requireAdmin()
  const news = await getAllNews()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">News</h1>
          <p className="text-muted-foreground">Manage news and notices</p>
        </div>
        <Button asChild>
          <Link href="/admin/news/new">
            <Plus className="h-4 w-4 mr-2" />
            New Item
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All News Items</CardTitle>
          <CardDescription>
            {news.length} item{news.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {news.length === 0 ? (
            <div className="text-center py-8">
              <Megaphone className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">No news items yet</p>
              <Button asChild className="mt-4">
                <Link href="/admin/news/new">Create your first news item</Link>
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {news.map((item) => (
                    <ClickableTableRow key={item.id} href={`/admin/news/${item.id}`}>
                      <TableCell>
                        <span className="font-medium">{item.title}</span>
                        {item.body && (
                          <p className="text-sm text-muted-foreground truncate max-w-md">
                            {item.body}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.is_published ? (
                          <Badge className="bg-green-600 text-white">Published</Badge>
                        ) : (
                          <Badge variant="outline">Unpublished</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </TableCell>
                    </ClickableTableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

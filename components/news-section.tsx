import Link from 'next/link'
import { createSlug } from '@/lib/utils'

interface NewsItem {
  id: string
  title: string
  body: string
  teaser: string | null
  created_at: string
}

interface NewsSectionProps {
  items: NewsItem[]
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '') // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/__(.+?)__/g, '$1') // bold alt
    .replace(/_(.+?)_/g, '$1') // italic alt
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // images
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // code
    .replace(/>\s+/g, '') // blockquotes
    .replace(/[-*+]\s+/g, '') // unordered lists
    .replace(/\d+\.\s+/g, '') // ordered lists
    .replace(/\n+/g, ' ') // newlines to spaces
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
}

function getTeaser(item: NewsItem, maxLength = 120): string {
  if (item.teaser) return item.teaser
  const plain = stripMarkdown(item.body)
  if (plain.length <= maxLength) return plain
  return plain.slice(0, maxLength).trimEnd() + '\u2026'
}

export function NewsSection({ items }: NewsSectionProps) {
  if (!items || items.length === 0) return null

  return (
    <section className="mb-8" aria-label="News and notices">
      <h2 className="font-serif text-2xl tracking-tight">News &amp; Notices</h2>

      <div>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          const slug = createSlug(item.title)

          return (
            <div key={item.id} className={isLast ? '' : 'border-b border-border'}>
              <div className="py-3">
                <Link
                  href={`/news#${slug}`}
                  className="text-sm font-medium leading-snug group-hover:text-primary hover:text-primary transition-colors"
                >
                  {item.title}
                </Link>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{getTeaser(item)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

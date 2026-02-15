'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown, ChevronUp } from 'lucide-react'

const MarkdownContent = dynamic(
  () => import('@/components/markdown-content').then((mod) => mod.MarkdownContent),
  { loading: () => <div className="py-2 text-xs text-muted-foreground">Loading...</div> }
)

interface NewsItem {
  id: string
  title: string
  body: string
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

function getTeaser(body: string, maxLength = 120): string {
  const plain = stripMarkdown(body)
  if (plain.length <= maxLength) return plain
  return plain.slice(0, maxLength).trimEnd() + '\u2026'
}

export function NewsSection({ items }: NewsSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!items || items.length === 0) return null

  function toggleItem(id: string) {
    setExpandedId((current) => (current === id ? null : id))
  }

  return (
    <section className="mb-8" aria-label="News and notices">
      <h2 className="font-serif text-2xl tracking-tight mb-6">News &amp; Notices</h2>

      <div>
        {items.map((item, index) => {
          const isExpanded = expandedId === item.id
          const isLast = index === items.length - 1

          return (
            <div key={item.id} className={isLast ? '' : 'border-b border-border'}>
              <div className="py-3">
                {/* Title row — clickable */}
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className="flex w-full items-start justify-between gap-2 text-left cursor-pointer"
                  aria-expanded={isExpanded}
                >
                  <span className="font-serif text-sm font-medium leading-snug">{item.title}</span>
                  {isExpanded ? (
                    <ChevronUp className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  )}
                </button>

                {/* Collapsed: teaser */}
                {!isExpanded && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {getTeaser(item.body)}
                  </p>
                )}

                {/* Expanded: full markdown body */}
                {isExpanded && (
                  <div className="mt-3 overflow-hidden">
                    <MarkdownContent content={item.body} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

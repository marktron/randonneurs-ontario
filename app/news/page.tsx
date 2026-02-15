import { PageShell } from '@/components/page-shell'
import { getPublishedNews } from '@/lib/data/news'
import { createSlug } from '@/lib/utils'
import { MarkdownContent } from '@/components/markdown-content'

export default async function NewsPage() {
  const items = await getPublishedNews()

  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-serif text-4xl tracking-tight md:text-5xl">News &amp; Notices</h1>

        {items.length === 0 ? (
          <p className="mt-8 text-muted-foreground">No news items at this time.</p>
        ) : (
          <div className="mt-12 divide-y divide-border">
            {items.map((item) => {
              const slug = createSlug(item.title)
              return (
                <article key={item.id} id={slug} className="scroll-mt-24 py-12 first:pt-0">
                  <time
                    dateTime={item.created_at}
                    className="mb-2 block text-sm text-muted-foreground"
                  >
                    {new Date(item.created_at).toLocaleDateString('en-CA', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </time>
                  <h2 className="font-serif text-2xl tracking-tight">{item.title}</h2>
                  <div className="mt-4">
                    <MarkdownContent content={item.body} />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </PageShell>
  )
}

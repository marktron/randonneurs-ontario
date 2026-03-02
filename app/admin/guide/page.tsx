import { readFileSync } from 'fs'
import { join } from 'path'
import { MarkdownContent } from '@/components/markdown-content'

export default function GuidePage() {
  const content = readFileSync(join(process.cwd(), 'docs/guide.md'), 'utf-8')

  return (
    <div className="max-w-4xl mx-auto">
      <MarkdownContent content={content} />
    </div>
  )
}

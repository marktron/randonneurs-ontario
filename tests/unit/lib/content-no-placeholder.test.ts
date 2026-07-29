import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { getAllPages } from '@/lib/content'

/**
 * Regression coverage for the lorem-ipsum placeholder that shipped live at
 * /test-page (content/pages/test-page.md, listed in the sitemap). The file
 * has been deleted; these tests read the real content/pages directory
 * (no fs mocking) so a future re-add without a `draft: true` guard fails
 * loudly instead of silently going live again.
 */
describe('content/pages regression: no placeholder pages ship live', () => {
  it('does not contain a test-page.md file', () => {
    const dir = path.join(process.cwd(), 'content/pages')
    const files = fs.readdirSync(dir)

    expect(files).not.toContain('test-page.md')
  })

  it('getAllPages() does not return a test-page entry', () => {
    const slugs = getAllPages().map((page) => page.slug)

    expect(slugs).not.toContain('test-page')
  })

  it('getAllPages() includes the real about page exactly once', () => {
    const slugs = getAllPages().map((page) => page.slug)
    const aboutCount = slugs.filter((slug) => slug === 'about').length

    expect(aboutCount).toBe(1)
  })
})

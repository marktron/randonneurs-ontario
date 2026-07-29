import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { NavigationConfig, NavigationConfigRaw } from '@/types/navigation'
import { expandItem, getTemplateVariables } from '@/lib/navigation'

const contentDirectory = path.join(process.cwd(), 'content/pages')

interface PageContent {
  slug: string
  title: string
  description: string
  lastUpdated: string
  content: string
  headerImage?: string
}

export interface PageMeta {
  slug: string
  title: string
  description: string
  lastUpdated: string
  headerImage?: string
  /**
   * Best-available "last modified" signal for this page: the frontmatter
   * `lastUpdated` date when present, otherwise the markdown file's mtime.
   * Intended for consumers like the sitemap that need a real Date, as
   * opposed to `lastUpdated` above which is a display-formatted string.
   */
  lastModifiedDate: Date
}

/**
 * A page is a draft when its frontmatter sets `draft: true`. Draft pages are
 * excluded from getAllPages() (so they never appear in listings, nav
 * pickers, or the sitemap) and getPage() treats them as not-found in
 * production, while still rendering in development so authors can preview
 * work-in-progress content locally before flipping `draft` off.
 */
function isDraft(data: Record<string, unknown>): boolean {
  return data.draft === true
}

/**
 * Get a single page by slug
 */
export function getPage(slug: string): PageContent | null {
  try {
    const filePath = path.join(contentDirectory, `${slug}.md`)
    const fileContents = fs.readFileSync(filePath, 'utf8')
    const { data, content } = matter(fileContents)

    if (isDraft(data) && process.env.NODE_ENV === 'production') {
      return null
    }

    return {
      slug,
      title: data.title || slug,
      description: data.description || '',
      lastUpdated: data.lastUpdated ? String(data.lastUpdated).split('T')[0] : '',
      content: content.trim(),
      headerImage: data.headerImage || undefined,
    }
  } catch {
    return null
  }
}

/**
 * Get all pages (metadata only). Draft pages (frontmatter `draft: true`)
 * are always excluded, in every environment, so placeholder content never
 * shows up in listings, navigation pickers, or the sitemap.
 */
export function getAllPages(): PageMeta[] {
  try {
    if (!fs.existsSync(contentDirectory)) {
      return []
    }

    const files = fs.readdirSync(contentDirectory)
    const pages: PageMeta[] = []

    for (const file of files) {
      if (!file.endsWith('.md')) continue

      const slug = file.replace(/\.md$/, '')
      const filePath = path.join(contentDirectory, file)
      const fileContents = fs.readFileSync(filePath, 'utf8')
      const { data } = matter(fileContents)

      if (isDraft(data)) continue

      const lastModifiedDate = data.lastUpdated
        ? new Date(data.lastUpdated as string | number | Date)
        : fs.statSync(filePath).mtime

      pages.push({
        slug,
        title: data.title || slug,
        description: data.description || '',
        lastUpdated: data.lastUpdated ? String(data.lastUpdated).split('T')[0] : '',
        headerImage: data.headerImage || undefined,
        lastModifiedDate,
      })
    }

    return pages.sort((a, b) => a.title.localeCompare(b.title))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Navigation config (server-side, uses fs for reading from disk)
// Template resolution logic is imported from lib/navigation.ts
// ---------------------------------------------------------------------------

const navigationFile = path.join(process.cwd(), 'content/navigation.json')

const FALLBACK_NAV: NavigationConfig = {
  items: [{ label: 'Home', href: '/' }],
}

/**
 * Read raw navigation config (unexpanded, for admin editing)
 */
export function getNavigationRaw(): NavigationConfigRaw | null {
  try {
    if (!fs.existsSync(navigationFile)) return null
    const raw = fs.readFileSync(navigationFile, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Read and resolve navigation config from content/navigation.json
 * Server-side only (uses fs). For client components, use
 * getResolvedNavigation() from lib/navigation.ts instead.
 */
export function getNavigation(): NavigationConfig {
  try {
    if (!fs.existsSync(navigationFile)) return FALLBACK_NAV

    const raw = fs.readFileSync(navigationFile, 'utf8')
    const config: NavigationConfigRaw = JSON.parse(raw)
    const variables = getTemplateVariables()

    return {
      items: config.items.flatMap((item) => expandItem(item, variables)),
    }
  } catch {
    return FALLBACK_NAV
  }
}

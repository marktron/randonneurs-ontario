import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { getAllPages, getPage } from '@/lib/content'

vi.mock('fs')

// Fixture files keyed by basename, mirroring content/pages/*.md structure.
const files: Record<string, string> = {
  'draft-page.md': ['---', 'title: Draft Page', 'draft: true', '---', '', 'Hidden content.'].join(
    '\n'
  ),
  'published-page.md': [
    '---',
    'title: Published Page',
    'lastUpdated: 2026-01-10',
    '---',
    '',
    'Visible content.',
  ].join('\n'),
  'no-date-page.md': ['---', 'title: No Date Page', '---', '', 'No frontmatter date.'].join('\n'),
}

function setupFsMocks() {
  vi.mocked(fs.existsSync).mockReturnValue(true)
  // fs.readdirSync's overloads (string[] | Dirent[] | Buffer[], depending on options) don't
  // narrow from a bare mock value, so an explicit `any` cast is the least noisy escape hatch here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(fs.readdirSync).mockReturnValue(Object.keys(files) as any)
  vi.mocked(fs.readFileSync).mockImplementation(((filePath: fs.PathOrFileDescriptor) => {
    const name = path.basename(String(filePath))
    if (!(name in files)) {
      throw new Error(`ENOENT: no such file: ${name}`)
    }
    return files[name]
  }) as typeof fs.readFileSync)
  vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date('2020-05-05') } as fs.Stats)
}

describe('getAllPages draft filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupFsMocks()
  })

  it('excludes pages with draft: true frontmatter', () => {
    const slugs = getAllPages().map((page) => page.slug)

    expect(slugs).not.toContain('draft-page')
    expect(slugs).toContain('published-page')
    expect(slugs).toContain('no-date-page')
  })

  it('uses the frontmatter lastUpdated date as lastModifiedDate when present', () => {
    const published = getAllPages().find((page) => page.slug === 'published-page')

    expect(published).toBeDefined()
    expect(published!.lastModifiedDate.toISOString().slice(0, 10)).toBe('2026-01-10')
  })

  it('falls back to the file mtime when frontmatter has no lastUpdated', () => {
    const noDate = getAllPages().find((page) => page.slug === 'no-date-page')

    expect(noDate).toBeDefined()
    expect(noDate!.lastModifiedDate.toISOString().slice(0, 10)).toBe('2020-05-05')
  })
})

describe('getPage draft guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupFsMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('behaves as not-found for a draft page in production', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(getPage('draft-page')).toBeNull()
  })

  it('still renders a draft page outside production, for author preview', () => {
    vi.stubEnv('NODE_ENV', 'development')

    const page = getPage('draft-page')

    expect(page).not.toBeNull()
    expect(page!.title).toBe('Draft Page')
  })

  it('renders a non-draft page in production as usual', () => {
    vi.stubEnv('NODE_ENV', 'production')

    const page = getPage('published-page')

    expect(page).not.toBeNull()
    expect(page!.title).toBe('Published Page')
  })
})

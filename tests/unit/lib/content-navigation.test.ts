import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import { getNavigation } from '@/lib/content'

vi.mock('fs')

const mockNav = {
  items: [
    {
      label: 'About',
      children: [
        { label: 'About Us', href: '/about' },
        { label: 'Blog', href: 'https://example.com', external: true },
      ],
    },
    {
      label: 'Routes',
      children: [{ label: '{{chapter}}', href: '/routes/{{chapter-slug}}', template: 'chapters' }],
    },
    {
      label: 'Results',
      children: [
        {
          label: '{{chapter}}',
          href: '/results/{{season}}/{{chapter-slug}}',
          template: 'chapters',
        },
        { separator: true },
        { label: 'PBP', href: '/results/{{pbpYear}}/pbp' },
        { label: 'Granite', href: '/results/{{graniteAnvilYear}}/granite-anvil' },
      ],
    },
    { label: 'Join', href: '/membership', style: 'cta' },
  ],
}

describe('getNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads and parses navigation.json', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()

    expect(result.items).toHaveLength(4)
    expect(result.items[0].label).toBe('About')
    expect(result.items[0].children).toHaveLength(2)
  })

  it('expands chapter templates into individual chapter links', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()
    const routesChildren = result.items[1].children!

    expect(routesChildren).toHaveLength(4)
    expect(routesChildren[0].label).toBe('Huron')
    expect(routesChildren[0].href).toBe('/routes/huron')
    expect(routesChildren[2].label).toBe('Simcoe-Muskoka')
    expect(routesChildren[2].href).toBe('/routes/simcoe-muskoka')
  })

  it('resolves {{season}} variable in hrefs', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()
    const resultsChildren = result.items[2].children!

    expect(resultsChildren[0].href).toMatch(/^\/results\/\d{4}\/huron$/)
  })

  it('resolves {{pbpYear}} and {{graniteAnvilYear}} variables', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()
    const resultsChildren = result.items[2].children!

    const pbpItem = resultsChildren.find((c) => c.label === 'PBP')!
    expect(pbpItem.href).toMatch(/^\/results\/\d{4}\/pbp$/)

    const graniteItem = resultsChildren.find((c) => c.label === 'Granite')!
    expect(graniteItem.href).toMatch(/^\/results\/\d{4}\/granite-anvil$/)
  })

  it('preserves separators during template expansion', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()
    const resultsChildren = result.items[2].children!

    const separators = resultsChildren.filter((c) => c.separator)
    expect(separators).toHaveLength(1)
  })

  it('preserves external link flag', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()
    const blog = result.items[0].children![1]

    expect(blog.external).toBe(true)
    expect(blog.href).toBe('https://example.com')
  })

  it('preserves CTA style', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockNav))
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()
    expect(result.items[3].style).toBe('cta')
  })

  it('returns fallback when navigation.json does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = getNavigation()

    expect(result.items).toHaveLength(1)
    expect(result.items[0].label).toBe('Home')
    expect(result.items[0].href).toBe('/')
  })

  it('returns fallback when navigation.json is malformed', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('not json')
    vi.mocked(fs.existsSync).mockReturnValue(true)

    const result = getNavigation()

    expect(result.items).toHaveLength(1)
    expect(result.items[0].label).toBe('Home')
  })
})

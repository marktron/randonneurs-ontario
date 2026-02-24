import { describe, it, expect } from 'vitest'
import { getResolvedNavigation, expandItem, resolveHref, getTemplateVariables } from '@/lib/navigation'

describe('resolveHref', () => {
  it('replaces template variables in href', () => {
    const variables = { season: '2026', 'chapter-slug': 'toronto' }
    const result = resolveHref('/results/{{season}}/{{chapter-slug}}', variables)
    expect(result).toBe('/results/2026/toronto')
  })

  it('preserves unknown variables as-is', () => {
    const result = resolveHref('/results/{{unknown}}', {})
    expect(result).toBe('/results/{{unknown}}')
  })

  it('returns href unchanged when no templates present', () => {
    const result = resolveHref('/about', { season: '2026' })
    expect(result).toBe('/about')
  })
})

describe('getTemplateVariables', () => {
  it('returns season, pbpYear, and graniteAnvilYear', () => {
    const vars = getTemplateVariables()
    expect(vars).toHaveProperty('season')
    expect(vars).toHaveProperty('pbpYear')
    expect(vars).toHaveProperty('graniteAnvilYear')
    expect(vars.graniteAnvilYear).toBe('2025')
  })

  it('returns numeric year strings', () => {
    const vars = getTemplateVariables()
    expect(vars.season).toMatch(/^\d{4}$/)
    expect(vars.pbpYear).toMatch(/^\d{4}$/)
  })
})

describe('expandItem', () => {
  const variables = { season: '2026', pbpYear: '2027', graniteAnvilYear: '2025' }

  it('expands a simple item with href', () => {
    const result = expandItem({ label: 'Home', href: '/' }, variables)
    expect(result).toEqual([{ label: 'Home', href: '/' }])
  })

  it('expands a separator', () => {
    const result = expandItem({ separator: true }, variables)
    expect(result).toEqual([{ label: '', separator: true }])
  })

  it('expands a heading', () => {
    const result = expandItem({ label: 'Section', type: 'heading' }, variables)
    expect(result).toEqual([{ label: 'Section', type: 'heading' }])
  })

  it('expands chapter templates into multiple items', () => {
    const result = expandItem(
      { label: '{{chapter}}', href: '/routes/{{chapter-slug}}', template: 'chapters' },
      variables,
    )
    expect(result.length).toBe(4) // 4 core chapters
    expect(result[0].label).toBe('Huron')
    expect(result[0].href).toBe('/routes/huron')
  })

  it('resolves template variables in hrefs', () => {
    const result = expandItem(
      { label: 'PBP', href: '/results/{{pbpYear}}/pbp' },
      variables,
    )
    expect(result).toEqual([{ label: 'PBP', href: '/results/2027/pbp' }])
  })

  it('preserves external flag', () => {
    const result = expandItem(
      { label: 'Blog', href: 'https://blog.example.com', external: true },
      variables,
    )
    expect(result[0].external).toBe(true)
  })

  it('preserves CTA style', () => {
    const result = expandItem(
      { label: 'Join', href: '/membership', style: 'cta' },
      variables,
    )
    expect(result[0].style).toBe('cta')
  })

  it('recursively expands children', () => {
    const result = expandItem(
      {
        label: 'Results',
        children: [
          { label: '{{chapter}}', href: '/results/{{season}}/{{chapter-slug}}', template: 'chapters' },
          { separator: true },
          { label: 'PBP', href: '/results/{{pbpYear}}/pbp' },
        ],
      },
      variables,
    )
    expect(result).toHaveLength(1)
    const children = result[0].children!
    // 4 chapters + 1 separator + 1 PBP = 6
    expect(children).toHaveLength(6)
    expect(children[0].href).toBe('/results/2026/huron')
    expect(children[4].separator).toBe(true)
    expect(children[5].href).toBe('/results/2027/pbp')
  })
})

describe('getResolvedNavigation', () => {
  it('returns a NavigationConfig with resolved items', () => {
    const nav = getResolvedNavigation()
    expect(nav).toHaveProperty('items')
    expect(Array.isArray(nav.items)).toBe(true)
    expect(nav.items.length).toBeGreaterThan(0)
  })

  it('resolves chapter templates in the real navigation.json', () => {
    const nav = getResolvedNavigation()
    // Find the Routes menu item
    const routes = nav.items.find((item) => item.label === 'Routes')
    expect(routes).toBeDefined()
    expect(routes!.children).toBeDefined()
    // Should have expanded the chapter template into 4 chapters
    expect(routes!.children!.length).toBe(4)
    expect(routes!.children![0].label).toBe('Huron')
  })

  it('resolves template variables in hrefs', () => {
    const nav = getResolvedNavigation()
    const results = nav.items.find((item) => item.label === 'Results')
    expect(results).toBeDefined()
    const children = results!.children!
    // Check that season/year variables are resolved (no {{ }} remaining)
    for (const child of children) {
      if (child.href) {
        expect(child.href).not.toMatch(/\{\{/)
      }
    }
  })

  it('preserves the CTA item', () => {
    const nav = getResolvedNavigation()
    const cta = nav.items.find((item) => item.style === 'cta')
    expect(cta).toBeDefined()
    expect(cta!.label).toBe('Join the club')
    expect(cta!.href).toBe('/membership')
  })
})

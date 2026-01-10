import { describe, it, expect } from 'vitest'
import {
  getChapterInfo,
  getAllChapterSlugs,
  getResultsChapterInfo,
  getAllResultsChapterSlugs,
  getDbSlug,
  getUrlSlugFromDbSlug,
  getResultsDescription,
} from '@/lib/chapter-config'

describe('getChapterInfo', () => {
  it('returns chapter info for valid core chapters', () => {
    const toronto = getChapterInfo('toronto')
    expect(toronto).not.toBeNull()
    expect(toronto?.name).toBe('Toronto')
    expect(toronto?.dbSlug).toBe('toronto')
  })

  it('returns chapter info for simcoe-muskoka with different dbSlug', () => {
    const simcoe = getChapterInfo('simcoe-muskoka')
    expect(simcoe).not.toBeNull()
    expect(simcoe?.name).toBe('Simcoe-Muskoka')
    expect(simcoe?.dbSlug).toBe('simcoe') // Different from URL slug
  })

  it('returns null for non-core chapters', () => {
    expect(getChapterInfo('permanent')).toBeNull()
    expect(getChapterInfo('pbp')).toBeNull()
    expect(getChapterInfo('granite-anvil')).toBeNull()
  })

  it('returns null for invalid slugs', () => {
    expect(getChapterInfo('invalid')).toBeNull()
    expect(getChapterInfo('')).toBeNull()
  })
})

describe('getAllChapterSlugs', () => {
  it('returns all core chapter slugs', () => {
    const slugs = getAllChapterSlugs()
    expect(slugs).toContain('toronto')
    expect(slugs).toContain('ottawa')
    expect(slugs).toContain('simcoe-muskoka')
    expect(slugs).toContain('huron')
  })

  it('does not include results-only chapters', () => {
    const slugs = getAllChapterSlugs()
    expect(slugs).not.toContain('permanent')
    expect(slugs).not.toContain('pbp')
    expect(slugs).not.toContain('granite-anvil')
  })

  it('returns exactly 4 core chapters', () => {
    expect(getAllChapterSlugs()).toHaveLength(4)
  })
})

describe('getResultsChapterInfo', () => {
  it('returns info for core chapters', () => {
    const toronto = getResultsChapterInfo('toronto')
    expect(toronto).not.toBeNull()
    expect(toronto?.name).toBe('Toronto')
  })

  it('returns info for results-only chapters', () => {
    const permanent = getResultsChapterInfo('permanent')
    expect(permanent).not.toBeNull()
    expect(permanent?.name).toBe('Permanents')

    const pbp = getResultsChapterInfo('pbp')
    expect(pbp).not.toBeNull()
    expect(pbp?.name).toBe('Paris-Brest-Paris')
  })

  it('returns info for granite-anvil with null dbSlug', () => {
    const graniteAnvil = getResultsChapterInfo('granite-anvil')
    expect(graniteAnvil).not.toBeNull()
    expect(graniteAnvil?.name).toBe('Granite Anvil')
    expect(graniteAnvil?.dbSlug).toBeNull()
  })

  it('returns null for invalid slugs', () => {
    expect(getResultsChapterInfo('invalid')).toBeNull()
  })
})

describe('getAllResultsChapterSlugs', () => {
  it('includes all core chapters', () => {
    const slugs = getAllResultsChapterSlugs()
    expect(slugs).toContain('toronto')
    expect(slugs).toContain('ottawa')
    expect(slugs).toContain('simcoe-muskoka')
    expect(slugs).toContain('huron')
  })

  it('includes results-only chapters', () => {
    const slugs = getAllResultsChapterSlugs()
    expect(slugs).toContain('permanent')
    expect(slugs).toContain('pbp')
    expect(slugs).toContain('granite-anvil')
    expect(slugs).toContain('niagara')
    expect(slugs).toContain('other')
  })

  it('returns more slugs than core chapters', () => {
    const coreSlugs = getAllChapterSlugs()
    const resultsSlugs = getAllResultsChapterSlugs()
    expect(resultsSlugs.length).toBeGreaterThan(coreSlugs.length)
  })
})

describe('getDbSlug', () => {
  it('returns same slug for most chapters', () => {
    expect(getDbSlug('toronto')).toBe('toronto')
    expect(getDbSlug('ottawa')).toBe('ottawa')
    expect(getDbSlug('huron')).toBe('huron')
  })

  it('returns different dbSlug for simcoe-muskoka', () => {
    expect(getDbSlug('simcoe-muskoka')).toBe('simcoe')
  })

  it('returns dbSlug for results-only chapters', () => {
    expect(getDbSlug('permanent')).toBe('permanent')
    expect(getDbSlug('niagara')).toBe('niagara')
  })

  it('returns other for pbp (stored in other chapter)', () => {
    expect(getDbSlug('pbp')).toBe('other')
  })

  it('returns null for granite-anvil (uses collection)', () => {
    expect(getDbSlug('granite-anvil')).toBeNull()
  })

  it('returns null for invalid slugs', () => {
    expect(getDbSlug('invalid')).toBeNull()
    expect(getDbSlug('')).toBeNull()
  })
})

describe('getUrlSlugFromDbSlug', () => {
  it('returns same slug for most db slugs', () => {
    expect(getUrlSlugFromDbSlug('toronto')).toBe('toronto')
    expect(getUrlSlugFromDbSlug('ottawa')).toBe('ottawa')
    expect(getUrlSlugFromDbSlug('huron')).toBe('huron')
    expect(getUrlSlugFromDbSlug('permanent')).toBe('permanent')
  })

  it('converts simcoe to simcoe-muskoka', () => {
    expect(getUrlSlugFromDbSlug('simcoe')).toBe('simcoe-muskoka')
  })

  it('returns input for unknown db slugs', () => {
    expect(getUrlSlugFromDbSlug('unknown')).toBe('unknown')
  })
})

describe('getResultsDescription', () => {
  it('returns results-specific descriptions for core chapters', () => {
    const torontoDesc = getResultsDescription('toronto')
    expect(torontoDesc).toContain('Results from brevets')
    expect(torontoDesc).toContain('Greater Toronto Area')
  })

  it('returns chapter description for results-only chapters', () => {
    const permanentDesc = getResultsDescription('permanent')
    expect(permanentDesc).toContain('Brevet schedule')
  })

  it('returns empty string for invalid slugs', () => {
    expect(getResultsDescription('invalid')).toBe('')
  })
})

/**
 * Centralized chapter configuration
 * Single source of truth for chapter metadata and slug mappings
 */

export interface ChapterInfo {
  slug: string
  name: string
  description: string
  coverImage?: string
  dbSlug: string | null // null means uses collection field instead of chapter
}

// Core chapters (calendar, routes)
const coreChapters: Record<string, ChapterInfo> = {
  toronto: {
    slug: 'toronto',
    name: 'Toronto',
    description:
      'Brevets and populaires through the Greater Toronto Area, Niagara Peninsula, and the rolling hills beyond.',
    coverImage: '/toronto.jpg',
    dbSlug: 'toronto',
  },
  ottawa: {
    slug: 'ottawa',
    name: 'Ottawa',
    description:
      'Explore the scenic routes of Eastern Ontario, from the Ottawa Valley to the St. Lawrence.',
    coverImage: '/ottawa.jpg',
    dbSlug: 'ottawa',
  },
  'simcoe-muskoka': {
    slug: 'simcoe-muskoka',
    name: 'Simcoe-Muskoka',
    description:
      'Brevets and populaires through the lakes and forests of Muskoka, Georgian Bay, and the Kawarthas.',
    coverImage: '/simcoe.jpg',
    dbSlug: 'simcoe',
  },
  huron: {
    slug: 'huron',
    name: 'Huron',
    description:
      'Discover the shores of Lake Huron and the rolling farmland of Southwestern Ontario.',
    coverImage: '/huron.jpg',
    dbSlug: 'huron',
  },
}

// Additional chapters for results pages
const resultsOnlyChapters: Record<string, ChapterInfo> = {
  niagara: {
    slug: 'niagara',
    name: 'Niagara',
    description: 'Historical results from the Niagara chapter.',
    dbSlug: 'niagara',
  },
  other: {
    slug: 'other',
    name: 'Other',
    description: 'Results from miscellaneous events.',
    dbSlug: 'other',
  },
  permanent: {
    slug: 'permanent',
    name: 'Permanents',
    description: 'Routes ridden outside of the normal Brevet schedule.',
    dbSlug: 'permanent',
  },
  pbp: {
    slug: 'pbp',
    name: 'Paris-Brest-Paris',
    description: 'Ontario randonneurs who have completed Paris-Brest-Paris.',
    coverImage: '/pbp.jpg',
    dbSlug: 'other', // PBP events are stored in the 'other' chapter
  },
  'granite-anvil': {
    slug: 'granite-anvil',
    name: 'Granite Anvil',
    description: 'Results from the Granite Anvil 1000km+ series.',
    coverImage: '/granite-anvil.jpg',
    dbSlug: null, // Uses collection field instead of chapter
  },
}

// Combined chapters for results pages
const allChapters: Record<string, ChapterInfo> = {
  ...coreChapters,
  ...resultsOnlyChapters,
}

/**
 * Get chapter info by URL slug
 */
export function getChapterInfo(urlSlug: string): ChapterInfo | null {
  return coreChapters[urlSlug] || null
}

/**
 * Get all core chapter URL slugs (for calendar/routes)
 */
export function getAllChapterSlugs(): string[] {
  return Object.keys(coreChapters)
}

/**
 * Get chapter info for results pages (includes special collections)
 */
export function getResultsChapterInfo(urlSlug: string): ChapterInfo | null {
  return allChapters[urlSlug] || null
}

/**
 * Get all chapter slugs for results pages
 */
export function getAllResultsChapterSlugs(): string[] {
  return Object.keys(allChapters)
}

/**
 * Convert URL slug to database slug
 * Returns null for chapters that use collection field instead
 */
export function getDbSlug(urlSlug: string): string | null {
  return allChapters[urlSlug]?.dbSlug ?? null
}

/**
 * Convert database slug to URL slug
 * Note: 'other' dbSlug maps to 'other' by default (not 'pbp')
 */
export function getUrlSlugFromDbSlug(dbSlug: string): string {
  // Handle special cases where URL slug differs from db slug
  const dbToUrlMap: Record<string, string> = {
    simcoe: 'simcoe-muskoka',
  }
  return dbToUrlMap[dbSlug] || dbSlug
}

/**
 * Get descriptions for results pages (may differ from calendar descriptions)
 */
export function getResultsDescription(urlSlug: string): string {
  const chapter = allChapters[urlSlug]
  if (!chapter) return ''

  // Results-specific descriptions
  const resultsDescriptions: Record<string, string> = {
    toronto: 'Results from brevets and populaires in the Greater Toronto Area.',
    ottawa: 'Results from brevets and populaires in the Ottawa Valley region.',
    'simcoe-muskoka': 'Results from brevets and populaires in Simcoe County and Muskoka.',
    huron: 'Results from brevets and populaires along Lake Huron and Bruce County.',
  }

  return resultsDescriptions[urlSlug] || chapter.description
}

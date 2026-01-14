/**
 * URL Builder for Randonneurs Ontario result pages.
 *
 * Generates URLs based on chapter and year following the pattern:
 * https://www.randonneursontario.ca/result/{code}res{YY}.html
 */

import { CHAPTER_URL_CONFIGS, type ChapterUrlConfig } from './types'

const BASE_URL = 'https://www.randonneursontario.ca/result'

/**
 * Build the results URL for a specific chapter and year.
 */
export function buildResultsUrl(chapter: string, year: number): string {
  const config = CHAPTER_URL_CONFIGS[chapter]
  if (!config) {
    throw new Error(
      `Unknown chapter: ${chapter}. Valid chapters: ${Object.keys(CHAPTER_URL_CONFIGS).join(', ')}`
    )
  }

  // Validate year range
  const currentYear = new Date().getFullYear()
  if (year < config.startYear) {
    throw new Error(`No results available for ${chapter} before ${config.startYear}`)
  }
  if (config.endYear && year > config.endYear) {
    throw new Error(`No results available for ${chapter} after ${config.endYear}`)
  }
  if (year > currentYear) {
    throw new Error(`Cannot fetch results for future year ${year}`)
  }

  // Build URL with 2-digit year suffix
  const yearSuffix = String(year).slice(-2)
  return `${BASE_URL}/${config.code}res${yearSuffix}.html`
}

/**
 * Get all valid chapters.
 */
export function getValidChapters(): string[] {
  return Object.keys(CHAPTER_URL_CONFIGS)
}

/**
 * Get chapter configuration.
 */
export function getChapterConfig(chapter: string): ChapterUrlConfig | undefined {
  return CHAPTER_URL_CONFIGS[chapter]
}

/**
 * Get all URLs for a chapter across all valid years.
 */
export function getAllUrlsForChapter(chapter: string): { year: number; url: string }[] {
  const config = CHAPTER_URL_CONFIGS[chapter]
  if (!config) {
    throw new Error(`Unknown chapter: ${chapter}`)
  }

  const currentYear = new Date().getFullYear()
  const endYear = config.endYear ?? currentYear
  const urls: { year: number; url: string }[] = []

  for (let year = config.startYear; year <= endYear; year++) {
    urls.push({
      year,
      url: buildResultsUrl(chapter, year),
    })
  }

  return urls
}

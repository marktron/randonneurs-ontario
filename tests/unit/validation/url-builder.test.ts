import { describe, it, expect } from 'vitest'
import {
  buildResultsUrl,
  getValidChapters,
  getChapterConfig,
  getAllUrlsForChapter,
} from '../../../scripts/lib/validation/url-builder'

describe('url-builder', () => {
  describe('buildResultsUrl', () => {
    it('builds correct URL for Toronto', () => {
      expect(buildResultsUrl('toronto', 2024)).toBe(
        'https://www.randonneursontario.ca/result/torres24.html'
      )
    })

    it('builds correct URL for Ottawa', () => {
      expect(buildResultsUrl('ottawa', 2023)).toBe(
        'https://www.randonneursontario.ca/result/ottres23.html'
      )
    })

    it('builds correct URL for Simcoe', () => {
      expect(buildResultsUrl('simcoe', 2022)).toBe(
        'https://www.randonneursontario.ca/result/simres22.html'
      )
    })

    it('builds correct URL for Huron', () => {
      expect(buildResultsUrl('huron', 2021)).toBe(
        'https://www.randonneursontario.ca/result/hurres21.html'
      )
    })

    it('builds correct URL for Permanents', () => {
      expect(buildResultsUrl('permanent', 2020)).toBe(
        'https://www.randonneursontario.ca/result/permres20.html'
      )
    })

    it('builds correct URL for Niagara', () => {
      expect(buildResultsUrl('niagara', 2006)).toBe(
        'https://www.randonneursontario.ca/result/niagres06.html'
      )
    })

    it('handles year 2000 correctly', () => {
      expect(buildResultsUrl('toronto', 2000)).toBe(
        'https://www.randonneursontario.ca/result/torres00.html'
      )
    })

    it('throws for unknown chapter', () => {
      expect(() => buildResultsUrl('invalid', 2024)).toThrow('Unknown chapter')
    })

    it('throws for year before chapter start', () => {
      expect(() => buildResultsUrl('ottawa', 1998)).toThrow('before 1999')
    })

    it('throws for year after chapter end (niagara)', () => {
      expect(() => buildResultsUrl('niagara', 2007)).toThrow('after 2006')
    })

    it('throws for future year', () => {
      const futureYear = new Date().getFullYear() + 1
      expect(() => buildResultsUrl('toronto', futureYear)).toThrow('future year')
    })
  })

  describe('getValidChapters', () => {
    it('returns all valid chapters', () => {
      const chapters = getValidChapters()
      expect(chapters).toContain('toronto')
      expect(chapters).toContain('ottawa')
      expect(chapters).toContain('simcoe')
      expect(chapters).toContain('huron')
      expect(chapters).toContain('permanent')
      expect(chapters).toContain('niagara')
    })
  })

  describe('getChapterConfig', () => {
    it('returns config for valid chapter', () => {
      const config = getChapterConfig('toronto')
      expect(config).toBeDefined()
      expect(config?.code).toBe('tor')
      expect(config?.startYear).toBe(1997)
    })

    it('returns undefined for invalid chapter', () => {
      expect(getChapterConfig('invalid')).toBeUndefined()
    })
  })

  describe('getAllUrlsForChapter', () => {
    it('returns all URLs for niagara (limited range)', () => {
      const urls = getAllUrlsForChapter('niagara')
      expect(urls).toHaveLength(2)
      expect(urls[0].year).toBe(2005)
      expect(urls[1].year).toBe(2006)
    })

    it('throws for unknown chapter', () => {
      expect(() => getAllUrlsForChapter('invalid')).toThrow('Unknown chapter')
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import { getHeroImages } from '@/lib/hero-images'

vi.mock('fs')

describe('getHeroImages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only image files, sorted by code point regardless of readdir order', () => {
    const scrambledOrder = [
      'hero.jpg',
      'IMG_0009.jpeg',
      '.DS_Store',
      '2026-windel-womens.jpeg',
      'notes.txt',
      'group-ride.jpeg',
      'Screen-Shot.png',
      'photo.webp',
    ]
    vi.mocked(fs.readdirSync).mockReturnValue(
      scrambledOrder as unknown as ReturnType<typeof fs.readdirSync>
    )

    const result = getHeroImages()

    expect(result.map((i) => i.src)).toStrictEqual([
      '/hero-carousel/2026-windel-womens.jpeg',
      '/hero-carousel/IMG_0009.jpeg',
      '/hero-carousel/Screen-Shot.png',
      '/hero-carousel/group-ride.jpeg',
      '/hero-carousel/hero.jpg',
      '/hero-carousel/photo.webp',
    ])
  })

  it('every image has the shared alt text', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['hero.jpg', 'photo.webp'] as unknown as ReturnType<
      typeof fs.readdirSync
    >)

    const result = getHeroImages()

    expect(result.every((img) => img.alt === 'Randonneurs Ontario cycling')).toBe(true)
  })

  it('reads from public/hero-carousel', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['hero.jpg'] as unknown as ReturnType<
      typeof fs.readdirSync
    >)

    getHeroImages()

    expect(vi.mocked(fs.readdirSync)).toHaveBeenCalledWith(
      expect.stringMatching(/public\/hero-carousel$/)
    )
  })
})

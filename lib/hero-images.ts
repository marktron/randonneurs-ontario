import fs from 'fs'
import path from 'path'

export type HeroImage = {
  src: string
  alt: string
}

export function getHeroImages(): HeroImage[] {
  const heroDir = path.join(process.cwd(), 'public/hero-carousel')

  const files = fs
    .readdirSync(heroDir)
    .filter((file) => {
      const ext = path.extname(file).toLowerCase()
      return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)
    })
    // Sort by code point to ensure slide 0 (the priority/LCP image) is the same locally and on Vercel.
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  return files.map((file) => ({
    src: `/hero-carousel/${file}`,
    alt: 'Randonneurs Ontario cycling',
  }))
}

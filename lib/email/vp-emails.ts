// VP email addresses by chapter slug, derived from the shared VP list
// (the same contacts shown on the /contact page).
import { CHAPTER_VPS } from '@/lib/chapter-vps'

export function getVpEmail(chapterSlug: string): string | null {
  return CHAPTER_VPS[chapterSlug]?.email || null
}

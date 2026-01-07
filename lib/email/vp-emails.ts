// VP email addresses by chapter slug
// These match the contacts on /contact page

export const VP_EMAILS: Record<string, string> = {
  huron: 'vp-huron@randonneursontario.ca',
  ottawa: 'vp-ottawa@randonneursontario.ca',
  simcoe: 'vp-simcoe@randonneursontario.ca',
  toronto: 'vp-toronto@randonneursontario.ca',
}

export function getVpEmail(chapterSlug: string): string | null {
  return VP_EMAILS[chapterSlug] || null
}

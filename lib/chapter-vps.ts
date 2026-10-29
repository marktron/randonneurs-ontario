// Single source of truth for chapter vice-presidents, keyed by chapter slug.
// Used by the /contact page, VP email lookups and the ACP calendar export.
export const CHAPTER_VPS: Record<string, { name: string; email: string }> = {
  huron: { name: 'Fred Chagnon', email: 'vp-huron@randonneursontario.ca' },
  ottawa: { name: 'Charles Major', email: 'vp-ottawa@randonneursontario.ca' },
  simcoe: { name: 'Dave Thompson', email: 'vp-simcoe@randonneursontario.ca' },
  toronto: { name: 'Mark Allen', email: 'vp-toronto@randonneursontario.ca' },
}

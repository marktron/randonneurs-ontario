import { acpSeasonWindow } from '@/lib/acp-season'
import ExcelJS from 'exceljs'
import { CHAPTER_VPS } from '@/lib/chapter-vps'

export interface AcpCalendarSourceEvent {
  eventDate: string // yyyy-mm-dd
  distanceKm: number
  chapterSlug: string
  eventType: string
  status: string
  rwgpsId: string | null
  elevationGainM: number | null
}

export type AcpCalendarCell = string | number | null

const CHAPTER_ORDER = ['toronto', 'ottawa', 'huron', 'simcoe']

/** ACP club codes per chapter, as used on the calendar submission. */
export const CHAPTER_ACP_CODES: Record<string, string> = {
  toronto: 'CA011801',
  ottawa: 'CA011802',
  simcoe: 'CA011803',
  huron: 'CA011804',
}

const CLUB_WEBSITE = 'https://www.randonneursontario.ca'
const MIN_DISTANCE_KM = 200

const HEADERS_EN = [
  'COUNTRY',
  'ACP representative',
  'email address',
  'ORGANISER CLUB NAME',
  'ACP CODE',
  'RIDE ORGANISER',
  'EMAIL ADDRESS',
  'Distance',
  'Date',
  'Town of departure',
  'Department/county of departure',
  'Region/State of departure',
  'Elevation (m)',
  'Event or organiser website',
  'Link to BRM road map',
]

const HEADERS_FR = [
  'PAYS',
  'REPRESENTANT ACP',
  'ADRESSE MAIL',
  'CLUB ORGANISATEUR',
  'CODE ACP',
  "NOM DE L'ORGANISATEUR",
  'ADRESSE MAIL organisateur',
  'Distance',
  'Date',
  'Ville du départ',
  'Département',
  'Région',
  'Dénivelé (en m)',
  'Site web',
  'Lien vers le parcours',
]

// Approximate widths (characters) from the ACP sample; unlisted columns use the default.
const COLUMN_WIDTHS: Record<number, number> = {
  1: 8,
  2: 14,
  3: 20,
  4: 17,
  5: 9,
  6: 14,
  7: 19,
  8: 8,
  9: 12,
  11: 14,
  13: 16,
  14: 20,
  15: 28,
}

/** "Fred Chagnon" -> "Fred CHAGNON". A single token is uppercased whole. */
export function formatAcpOrganizerName(name: string): string {
  const parts = name.trim().split(/\s+/)
  parts[parts.length - 1] = parts[parts.length - 1].toUpperCase()
  return parts.join(' ')
}

function chapterRank(slug: string): number {
  const i = CHAPTER_ORDER.indexOf(slug)
  return i === -1 ? CHAPTER_ORDER.length : i
}

export function selectAcpCalendarEvents(
  events: AcpCalendarSourceEvent[],
  year: number
): AcpCalendarSourceEvent[] {
  const { start, end } = acpSeasonWindow(year)
  const selected = events.filter(
    (e) =>
      e.eventType === 'brevet' &&
      (e.status === 'draft' || e.status === 'scheduled') &&
      e.eventDate >= start &&
      e.eventDate <= end &&
      e.distanceKm >= MIN_DISTANCE_KM &&
      e.chapterSlug !== 'other'
  )
  for (const e of selected) {
    if (!CHAPTER_VPS[e.chapterSlug]) {
      throw new Error(`No VP configured for chapter "${e.chapterSlug}" (see lib/chapter-vps.ts)`)
    }
    if (!CHAPTER_ACP_CODES[e.chapterSlug]) {
      throw new Error(
        `No ACP code configured for chapter "${e.chapterSlug}" (see CHAPTER_ACP_CODES)`
      )
    }
  }
  return selected.sort(
    (a, b) =>
      chapterRank(a.chapterSlug) - chapterRank(b.chapterSlug) ||
      a.distanceKm - b.distanceKm ||
      a.eventDate.localeCompare(b.eventDate)
  )
}

export function buildAcpCalendarRows(events: AcpCalendarSourceEvent[]): AcpCalendarCell[][] {
  return events.map((e) => {
    const vp = CHAPTER_VPS[e.chapterSlug]
    const acpCode = CHAPTER_ACP_CODES[e.chapterSlug]
    if (!vp || !acpCode) {
      throw new Error(`No VP or ACP code configured for chapter "${e.chapterSlug}"`)
    }
    return [
      'Canada',
      'Peter LEISS',
      'vp-admin@randonneursontario.ca',
      'Randonneurs Ontario',
      acpCode,
      formatAcpOrganizerName(vp.name),
      vp.email,
      e.distanceKm,
      e.eventDate,
      null,
      null,
      'Ontario',
      e.elevationGainM,
      CLUB_WEBSITE,
      e.rwgpsId ? `https://ridewithgps.com/routes/${e.rwgpsId}` : null,
    ]
  })
}

export async function generateAcpCalendarXlsx(rows: AcpCalendarCell[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Calendrier')
  for (const [col, width] of Object.entries(COLUMN_WIDTHS)) {
    sheet.getColumn(Number(col)).width = width
  }
  sheet.addRow(HEADERS_EN).font = { bold: true }
  sheet.addRow(HEADERS_FR).font = { bold: true }
  for (const row of rows) {
    const added = sheet.addRow(row)
    // Dates are stored as text, matching the ACP sample.
    added.getCell(9).numFmt = '@'
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

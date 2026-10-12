import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildAcpCalendarRows,
  formatAcpOrganizerName,
  generateAcpCalendarXlsx,
  selectAcpCalendarEvents,
  type AcpCalendarSourceEvent,
} from '@/lib/acp-calendar'

function ev(overrides: Partial<AcpCalendarSourceEvent> = {}): AcpCalendarSourceEvent {
  return {
    eventDate: '2027-05-01',
    distanceKm: 200,
    chapterSlug: 'toronto',
    eventType: 'brevet',
    status: 'scheduled',
    rwgpsId: null,
    elevationGainM: null,
    ...overrides,
  }
}

describe('formatAcpOrganizerName', () => {
  it('uppercases the surname', () => {
    expect(formatAcpOrganizerName('Fred Chagnon')).toBe('Fred CHAGNON')
  })
  it('uppercases a single-token name', () => {
    expect(formatAcpOrganizerName('Madonna')).toBe('MADONNA')
  })
  it('uppercases only the last token of a longer name', () => {
    expect(formatAcpOrganizerName('Mary Jo  Smith')).toBe('Mary Jo SMITH')
  })
})

describe('selectAcpCalendarEvents', () => {
  it('drops events under 200 km', () => {
    expect(
      selectAcpCalendarEvents([ev({ distanceKm: 150 }), ev({ distanceKm: 200 })], 2027)
    ).toHaveLength(1)
  })
  it('drops the other chapter', () => {
    expect(selectAcpCalendarEvents([ev({ chapterSlug: 'other' })], 2027)).toEqual([])
  })
  it('keeps only brevets', () => {
    for (const eventType of ['populaire', 'permanent', 'fleche']) {
      expect(selectAcpCalendarEvents([ev({ eventType })], 2027)).toEqual([])
    }
  })
  it('keeps only draft and scheduled', () => {
    for (const status of ['cancelled', 'completed', 'submitted']) {
      expect(selectAcpCalendarEvents([ev({ status })], 2027)).toEqual([])
    }
    expect(
      selectAcpCalendarEvents([ev({ status: 'draft' }), ev({ status: 'scheduled' })], 2027)
    ).toHaveLength(2)
  })
  it('includes both window boundaries and excludes the days outside', () => {
    const result = selectAcpCalendarEvents(
      [
        ev({ eventDate: '2026-10-31' }),
        ev({ eventDate: '2026-11-01' }),
        ev({ eventDate: '2027-10-31' }),
        ev({ eventDate: '2027-11-01' }),
      ],
      2027
    )
    expect(result.map((e) => e.eventDate)).toEqual(['2026-11-01', '2027-10-31'])
  })
  it('throws naming a chapter with no VP', () => {
    expect(() => selectAcpCalendarEvents([ev({ chapterSlug: 'nowhere' })], 2027)).toThrow(/nowhere/)
  })
  it('sorts by chapter order, then distance, then date', () => {
    const result = selectAcpCalendarEvents(
      [
        ev({ chapterSlug: 'simcoe', eventDate: '2027-04-01' }),
        ev({ chapterSlug: 'huron', eventDate: '2027-03-01' }),
        ev({ chapterSlug: 'toronto', eventDate: '2027-06-01', distanceKm: 200 }),
        ev({ chapterSlug: 'ottawa', eventDate: '2027-02-01' }),
        ev({ chapterSlug: 'toronto', eventDate: '2027-05-01', distanceKm: 300 }),
        ev({ chapterSlug: 'toronto', eventDate: '2027-04-01', distanceKm: 200 }),
      ],
      2027
    )
    expect(result.map((e) => `${e.chapterSlug} ${e.distanceKm} ${e.eventDate}`)).toEqual([
      'toronto 200 2027-04-01',
      'toronto 200 2027-06-01',
      'toronto 300 2027-05-01',
      'ottawa 200 2027-02-01',
      'huron 200 2027-03-01',
      'simcoe 200 2027-04-01',
    ])
  })
})

describe('buildAcpCalendarRows', () => {
  it('maps every column', () => {
    const [row] = buildAcpCalendarRows([
      ev({ chapterSlug: 'huron', distanceKm: 300, rwgpsId: '555', elevationGainM: 1800 }),
    ])
    expect(row).toEqual([
      'Canada',
      'Peter LEISS',
      'vp-admin@randonneursontario.ca',
      'Randonneurs Ontario',
      'CA011804',
      'Fred CHAGNON',
      'vp-huron@randonneursontario.ca',
      300,
      '2027-05-01',
      null,
      null,
      'Ontario',
      1800,
      'https://www.randonneursontario.ca',
      'https://ridewithgps.com/routes/555',
    ])
  })
  it('uses each chapter ACP code', () => {
    const rows = buildAcpCalendarRows(
      ['toronto', 'ottawa', 'simcoe', 'huron'].map((chapterSlug) => ev({ chapterSlug }))
    )
    expect(rows.map((r) => r[4])).toEqual(['CA011801', 'CA011802', 'CA011803', 'CA011804'])
  })
  it('leaves elevation and link blank when unknown', () => {
    const [row] = buildAcpCalendarRows([ev()])
    expect(row[12]).toBeNull()
    expect(row[14]).toBeNull()
  })
})

describe('generateAcpCalendarXlsx', () => {
  it('writes the Calendrier sheet with two headers and typed data', async () => {
    const buffer = await generateAcpCalendarXlsx(buildAcpCalendarRows([ev({ rwgpsId: '9' })]))
    const workbook = new ExcelJS.Workbook()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any)
    expect(workbook.worksheets).toHaveLength(1)
    const sheet = workbook.getWorksheet('Calendrier')!
    expect(sheet).toBeDefined()
    expect(sheet.getRow(1).getCell(1).value).toBe('COUNTRY')
    expect(sheet.getRow(1).getCell(15).value).toBe('Link to BRM road map')
    expect(sheet.getRow(2).getCell(1).value).toBe('PAYS')
    expect(sheet.getRow(2).getCell(6).value).toBe("NOM DE L'ORGANISATEUR")
    expect(sheet.getRow(2).getCell(10).value).toBe('Ville du départ')
    expect(sheet.getRow(2).getCell(13).value).toBe('Dénivelé (en m)')
    const data = sheet.getRow(3)
    expect(data.getCell(9).value).toBe('2027-05-01')
    expect(typeof data.getCell(9).value).toBe('string')
    expect(data.getCell(8).value).toBe(200)
    expect(typeof data.getCell(8).value).toBe('number')
    expect(data.getCell(6).value).toBe('Mark ALLEN')
    expect(data.getCell(15).value).toBe('https://ridewithgps.com/routes/9')
  })
})

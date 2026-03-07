import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  generateAcpXlsx,
  generateAcpCsv,
  type SpreadsheetData,
  type AcpResultRow,
} from '@/lib/email/results-spreadsheet'

async function loadXlsx(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any)
  return workbook
}

const sampleResults: AcpResultRow[] = [
  { lastName: 'Wiechers-Maxwell', firstName: 'Brenda', finishTime: '12:05:00', gender: 'F' },
  { lastName: 'Russwurm', firstName: 'Anneli', finishTime: '12:05:00', gender: 'F' },
  { lastName: 'Smith', firstName: 'John', finishTime: '10:30:00', gender: 'M' },
]

const sampleData: SpreadsheetData = {
  eventName: 'Spring 200',
  eventDate: '2025-04-15',
  distanceKm: 200,
  chapterName: 'Toronto',
  results: sampleResults,
}

describe('generateAcpXlsx', () => {
  it('produces a valid XLSX buffer', async () => {
    const result = await generateAcpXlsx(sampleData)
    expect(result.buffer).toBeInstanceOf(Buffer)
    expect(result.buffer.length).toBeGreaterThan(0)
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  })

  it('generates correct filename', async () => {
    const result = await generateAcpXlsx(sampleData)
    expect(result.filename).toBe('20250415-Spring-200-200.xlsx')
  })

  it('sanitizes special characters in filename', async () => {
    const data = { ...sampleData, eventName: 'Brevet / Populaire (Spring)' }
    const result = await generateAcpXlsx(data)
    expect(result.filename).toBe('20250415-Brevet-Populaire-Spring-200.xlsx')
  })

  // ── Header rows (rows 1-3) ──

  it('has CLUB ORGANISATEUR label in row 1', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    expect(sheet.getRow(1).getCell(2).value).toBe('CLUB ORGANISATEUR')
  })

  it('has club name with chapter in row 2', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    expect(sheet.getRow(2).getCell(2).value).toBe('Randonneurs Ontario Toronto')
  })

  it('includes event date in row 2', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    expect(sheet.getRow(2).getCell(6).value).toBe('2025-04-15')
  })

  it('includes distance in row 2', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    expect(sheet.getRow(2).getCell(7).value).toBe('200 km')
  })

  it('includes column headers in row 3', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    const headerRow = sheet.getRow(3)
    expect(headerRow.getCell(2).value).toBe('NOM')
    expect(headerRow.getCell(3).value).toBe('PRENOM')
    expect(headerRow.getCell(4).value).toBe('CLUB DU PARTICIPANT')
    expect(headerRow.getCell(6).value).toBe('CODE ACP')
    expect(headerRow.getCell(7).value).toBe('TEMPS')
    expect(headerRow.getCell(8).value).toBe('(x)')
    expect(headerRow.getCell(9).value).toBe('(F)')
  })

  // ── Data rows (starting at row 4) ──

  it('sorts results by last name alphabetically', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    // Data starts at row 4
    expect(sheet.getRow(4).getCell(2).value).toBe('Russwurm')
    expect(sheet.getRow(5).getCell(2).value).toBe('Smith')
    expect(sheet.getRow(6).getCell(2).value).toBe('Wiechers-Maxwell')
  })

  it('marks female riders with F in gender column', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    // Col I (9) is gender
    expect(sheet.getRow(4).getCell(9).value).toBe('F') // Russwurm
    expect(sheet.getRow(5).getCell(9).value).toBe('') // Smith (M)
    expect(sheet.getRow(6).getCell(9).value).toBe('F') // Wiechers-Maxwell
  })

  it('formats finish time as Xh MM', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    // Col G (7) is TEMPS — Smith has 10:30:00
    expect(sheet.getRow(5).getCell(7).value).toBe('10h 30')
  })

  it('preserves leading zero in minutes', async () => {
    const data: SpreadsheetData = {
      ...sampleData,
      results: [{ lastName: 'Doe', firstName: 'Jane', finishTime: '9:01:00', gender: 'F' }],
    }
    const result = await generateAcpXlsx(data)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    expect(sheet.getRow(4).getCell(7).value).toBe('9h 01')
  })

  it('sets club to Randonneurs Ontario for all rows', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    // Col D (4) is CLUB DU PARTICIPANT
    expect(sheet.getRow(4).getCell(4).value).toBe('Randonneurs Ontario')
    expect(sheet.getRow(5).getCell(4).value).toBe('Randonneurs Ontario')
    expect(sheet.getRow(6).getCell(4).value).toBe('Randonneurs Ontario')
  })

  it('handles empty results', async () => {
    const data = { ...sampleData, results: [] }
    const result = await generateAcpXlsx(data)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    // Should have 3 header rows but no data rows
    expect(sheet.getRow(3).getCell(2).value).toBe('NOM')
    expect(sheet.getRow(4).getCell(2).value).toBeNull()
  })

  it('handles null gender', async () => {
    const data: SpreadsheetData = {
      ...sampleData,
      results: [{ lastName: 'Doe', firstName: 'Jane', finishTime: '11:00:00', gender: null }],
    }
    const result = await generateAcpXlsx(data)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    expect(sheet.getRow(4).getCell(9).value).toBe('')
  })

  // ── Styling ──

  it('uses Arial 9pt font on data cells', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    const cell = sheet.getRow(4).getCell(2)
    expect(cell.font.name).toBe('Arial')
    expect(cell.font.size).toBe(9)
  })

  it('uses center alignment on data cells', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    const cell = sheet.getRow(4).getCell(2)
    expect(cell.alignment?.horizontal).toBe('center')
    expect(cell.alignment?.vertical).toBe('middle')
  })

  it('uses medium border on outer frame', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)
    const sheet = workbook.getWorksheet('Homologation')!
    // Top-left corner
    const a1 = sheet.getCell('A1')
    expect(a1.border?.left?.style).toBe('medium')
    expect(a1.border?.top?.style).toBe('medium')
    // Right edge of header
    const i3 = sheet.getCell('I3')
    expect(i3.border?.right?.style).toBe('medium')
  })
})

describe('generateAcpCsv', () => {
  it('produces correct CSV header row', () => {
    const result = generateAcpCsv(sampleData)
    const lines = result.content.split('\n')
    expect(lines[0]).toBe('NOM,PRENOM,CLUB DU PARTICIPANT,,CODE ACP,TEMPS,Medal (x),(F)')
  })

  it('sorts results by last name', () => {
    const result = generateAcpCsv(sampleData)
    const lines = result.content.split('\n')
    expect(lines[1]).toContain('Russwurm')
    expect(lines[2]).toContain('Smith')
    expect(lines[3]).toContain('Wiechers-Maxwell')
  })

  it('marks female riders with F', () => {
    const result = generateAcpCsv(sampleData)
    const lines = result.content.split('\n')
    // Russwurm line ends with ,F
    expect(lines[1]).toMatch(/,F$/)
    // Smith line ends with empty gender
    expect(lines[2]).toMatch(/,$/)
  })

  it('formats finish time as Xh MM', () => {
    const result = generateAcpCsv(sampleData)
    const lines = result.content.split('\n')
    expect(lines[2]).toContain('10h 30')
    expect(lines[2]).not.toContain('10:30')
  })

  it('generates correct filename', () => {
    const result = generateAcpCsv(sampleData)
    expect(result.filename).toBe('20250415-Spring-200-200.csv')
    expect(result.mimeType).toBe('text/csv')
  })

  it('escapes fields containing commas', () => {
    const data: SpreadsheetData = {
      ...sampleData,
      results: [{ lastName: 'Smith, Jr.', firstName: 'John', finishTime: '10:00:00', gender: 'M' }],
    }
    const result = generateAcpCsv(data)
    const lines = result.content.split('\n')
    expect(lines[1]).toContain('"Smith, Jr."')
  })

  it('escapes fields containing quotes', () => {
    const data: SpreadsheetData = {
      ...sampleData,
      results: [{ lastName: 'O"Brien', firstName: 'Pat', finishTime: '10:00:00', gender: 'M' }],
    }
    const result = generateAcpCsv(data)
    const lines = result.content.split('\n')
    expect(lines[1]).toContain('"O""Brien"')
  })

  it('handles empty results', () => {
    const data = { ...sampleData, results: [] }
    const result = generateAcpCsv(data)
    const lines = result.content.split('\n')
    expect(lines.length).toBe(1) // header only
  })
})

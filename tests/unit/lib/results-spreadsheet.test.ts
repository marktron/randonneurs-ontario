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
    expect(result.filename).toBe('ACP_Homologation_Spring_200_2025-04-15.xlsx')
  })

  it('sanitizes special characters in filename', async () => {
    const data = { ...sampleData, eventName: 'Brevet / Populaire (Spring)' }
    const result = await generateAcpXlsx(data)
    expect(result.filename).toBe(
      'ACP_Homologation_Brevet___Populaire__Spring__2025-04-15.xlsx'
    )
  })

  it('includes event name and distance in header', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)

    const sheet = workbook.getWorksheet('Homologation')!
    expect(sheet.getRow(1).getCell(1).value).toBe('Spring 200 — 200km')
  })

  it('includes event date in header', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)

    const sheet = workbook.getWorksheet('Homologation')!
    expect(sheet.getRow(2).getCell(1).value).toBe('2025-04-15')
  })

  it('includes column headers in row 4', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)

    const sheet = workbook.getWorksheet('Homologation')!
    const headerRow = sheet.getRow(4)
    expect(headerRow.getCell(1).value).toBe('NOM')
    expect(headerRow.getCell(2).value).toBe('PRENOM')
    expect(headerRow.getCell(3).value).toBe('CLUB DU PARTICIPANT')
    expect(headerRow.getCell(5).value).toBe('CODE ACP')
    expect(headerRow.getCell(6).value).toBe('TEMPS')
    expect(headerRow.getCell(7).value).toBe('Medal (x)')
    expect(headerRow.getCell(8).value).toBe('(F)')
  })

  it('sorts results by last name alphabetically', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)

    const sheet = workbook.getWorksheet('Homologation')!
    // Data starts at row 5 (after title, date, blank, headers)
    expect(sheet.getRow(5).getCell(1).value).toBe('Russwurm')
    expect(sheet.getRow(6).getCell(1).value).toBe('Smith')
    expect(sheet.getRow(7).getCell(1).value).toBe('Wiechers-Maxwell')
  })

  it('marks female riders with F in gender column', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)

    const sheet = workbook.getWorksheet('Homologation')!
    // Russwurm (row 5) - F
    expect(sheet.getRow(5).getCell(8).value).toBe('F')
    // Smith (row 6) - M, should be blank
    expect(sheet.getRow(6).getCell(8).value).toBe('')
    // Wiechers-Maxwell (row 7) - F
    expect(sheet.getRow(7).getCell(8).value).toBe('F')
  })

  it('strips seconds from finish time', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)

    const sheet = workbook.getWorksheet('Homologation')!
    expect(sheet.getRow(6).getCell(6).value).toBe('10:30')
  })

  it('sets club to Randonneurs Ontario for all rows', async () => {
    const result = await generateAcpXlsx(sampleData)
    const workbook = await loadXlsx(result.buffer)

    const sheet = workbook.getWorksheet('Homologation')!
    expect(sheet.getRow(5).getCell(3).value).toBe('Randonneurs Ontario')
    expect(sheet.getRow(6).getCell(3).value).toBe('Randonneurs Ontario')
    expect(sheet.getRow(7).getCell(3).value).toBe('Randonneurs Ontario')
  })

  it('handles empty results', async () => {
    const data = { ...sampleData, results: [] }
    const result = await generateAcpXlsx(data)
    const workbook = await loadXlsx(result.buffer)

    const sheet = workbook.getWorksheet('Homologation')!
    // Should have header rows but no data rows
    expect(sheet.getRow(4).getCell(1).value).toBe('NOM')
    expect(sheet.getRow(5).getCell(1).value).toBeNull()
  })

  it('handles null gender', async () => {
    const data: SpreadsheetData = {
      ...sampleData,
      results: [{ lastName: 'Doe', firstName: 'Jane', finishTime: '11:00:00', gender: null }],
    }
    const result = await generateAcpXlsx(data)
    const workbook = await loadXlsx(result.buffer)

    const sheet = workbook.getWorksheet('Homologation')!
    expect(sheet.getRow(5).getCell(8).value).toBe('')
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

  it('strips seconds from finish time', () => {
    const result = generateAcpCsv(sampleData)
    const lines = result.content.split('\n')
    expect(lines[2]).toContain('10:30')
    expect(lines[2]).not.toContain('10:30:00')
  })

  it('generates correct filename', () => {
    const result = generateAcpCsv(sampleData)
    expect(result.filename).toBe('ACP_Homologation_Spring_200_2025-04-15.csv')
    expect(result.mimeType).toBe('text/csv')
  })

  it('escapes fields containing commas', () => {
    const data: SpreadsheetData = {
      ...sampleData,
      results: [
        { lastName: 'Smith, Jr.', firstName: 'John', finishTime: '10:00:00', gender: 'M' },
      ],
    }
    const result = generateAcpCsv(data)
    const lines = result.content.split('\n')
    expect(lines[1]).toContain('"Smith, Jr."')
  })

  it('escapes fields containing quotes', () => {
    const data: SpreadsheetData = {
      ...sampleData,
      results: [
        { lastName: 'O"Brien', firstName: 'Pat', finishTime: '10:00:00', gender: 'M' },
      ],
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

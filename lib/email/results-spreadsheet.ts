import ExcelJS from 'exceljs'

export interface AcpResultRow {
  lastName: string
  firstName: string
  finishTime: string
  gender: string | null
}

export interface SpreadsheetData {
  eventName: string
  eventDate: string // yyyy-mm-dd
  distanceKm: number
  results: AcpResultRow[]
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function formatFinishTime(time: string): string {
  // PostgreSQL interval comes back as "HH:MM:SS" — strip seconds
  const parts = time.split(':')
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`
  }
  return time
}

const COLUMN_HEADERS = [
  'NOM',
  'PRENOM',
  'CLUB DU PARTICIPANT',
  '',
  'CODE ACP',
  'TEMPS',
  'Medal (x)',
  '(F)',
]

/**
 * Generate an XLSX buffer in ACP homologation format.
 */
export async function generateAcpXlsx(data: SpreadsheetData): Promise<{
  buffer: Buffer
  filename: string
  mimeType: string
}> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Homologation')

  // Header rows
  const titleRow = sheet.addRow([`${data.eventName} — ${data.distanceKm}km`])
  titleRow.font = { bold: true, size: 14 }

  sheet.addRow([data.eventDate])
  sheet.addRow([]) // blank row

  // Column headers
  const headerRow = sheet.addRow(COLUMN_HEADERS)
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.border = {
      bottom: { style: 'thin' },
    }
  })

  // Set column widths
  sheet.columns = [
    { width: 20 }, // NOM
    { width: 20 }, // PRENOM
    { width: 25 }, // CLUB
    { width: 3 },  // blank
    { width: 12 }, // CODE ACP
    { width: 10 }, // TEMPS
    { width: 10 }, // Medal
    { width: 5 },  // (F)
  ]

  // Data rows — sorted by last name
  const sorted = [...data.results].sort((a, b) => a.lastName.localeCompare(b.lastName))

  for (const row of sorted) {
    sheet.addRow([
      row.lastName,
      row.firstName,
      'Randonneurs Ontario',
      '',
      '',
      row.finishTime ? formatFinishTime(row.finishTime) : '',
      '',
      row.gender === 'F' ? 'F' : '',
    ])
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const filename = `ACP_Homologation_${sanitizeFilename(data.eventName)}_${data.eventDate}.xlsx`

  return {
    buffer,
    filename,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
}

/**
 * Generate a CSV string as fallback if XLSX generation fails.
 */
export function generateAcpCsv(data: SpreadsheetData): {
  content: string
  filename: string
  mimeType: string
} {
  const lines: string[] = []

  // Header line
  lines.push(COLUMN_HEADERS.map(escapeCsvField).join(','))

  // Data rows — sorted by last name
  const sorted = [...data.results].sort((a, b) => a.lastName.localeCompare(b.lastName))

  for (const row of sorted) {
    lines.push(
      [
        row.lastName,
        row.firstName,
        'Randonneurs Ontario',
        '',
        '',
        row.finishTime ? formatFinishTime(row.finishTime) : '',
        '',
        row.gender === 'F' ? 'F' : '',
      ]
        .map(escapeCsvField)
        .join(',')
    )
  }

  const filename = `ACP_Homologation_${sanitizeFilename(data.eventName)}_${data.eventDate}.csv`

  return {
    content: lines.join('\n'),
    filename,
    mimeType: 'text/csv',
  }
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

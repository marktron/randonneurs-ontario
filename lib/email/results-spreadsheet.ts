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
  chapterName: string
  results: AcpResultRow[]
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

function formatFinishTime(time: string): string {
  // PostgreSQL interval comes back as "HH:MM:SS" — format as "Xh MM"
  const parts = time.split(':')
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10)
    const minutes = parts[1]
    return `${hours}h ${minutes}`
  }
  return time
}

// Shared border styles
const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } }
const medium: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF000000' } }

const baseFont: Partial<ExcelJS.Font> = {
  name: 'Arial',
  size: 9,
  color: { argb: 'FF000000' },
}

const baseFill: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFFFF' },
}

const baseAlignment: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true,
}

function applyStyle(
  cell: ExcelJS.Cell,
  borders: Partial<ExcelJS.Borders>,
  fontOverrides?: Partial<ExcelJS.Font>
) {
  cell.font = { ...baseFont, ...fontOverrides }
  cell.fill = baseFill
  cell.alignment = baseAlignment
  cell.numFmt = '@'
  cell.border = borders
}

/**
 * Generate an XLSX buffer in ACP homologation format.
 *
 * Matches the 9-column, 3-row header layout used by the ACP
 * homologation template with merged cells, Arial 9pt, centered
 * text, and a medium outer border frame.
 */
export async function generateAcpXlsx(data: SpreadsheetData): Promise<{
  buffer: Buffer
  filename: string
  mimeType: string
}> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Homologation')

  // Column widths matching original template
  sheet.columns = [
    { width: 12 }, // A: N° Homologation
    { width: 18 }, // B: NOM
    { width: 18 }, // C: PRENOM
    { width: 16 }, // D: CLUB DU PARTICIPANT (left half)
    { width: 12 }, // E: CLUB DU PARTICIPANT (right half)
    { width: 12 }, // F: CODE ACP
    { width: 12 }, // G: TEMPS
    { width: 9 }, // H: Medal (x)
    { width: 9 }, // I: (F)
  ]

  // ── Row 1: Top header labels ──
  sheet.addRow([
    'N° Homologation',
    'CLUB ORGANISATEUR',
    '',
    '',
    'code ACP',
    'DATE',
    'DISTANCE',
    'INFORMATIONS',
    '',
  ])
  sheet.mergeCells('B1:D1')
  sheet.mergeCells('H1:I1')

  applyStyle(sheet.getCell('A1'), { left: medium, right: thin, top: medium, bottom: thin })
  applyStyle(
    sheet.getCell('B1'),
    { left: thin, right: thin, top: medium, bottom: thin },
    { size: 11 }
  )
  applyStyle(
    sheet.getCell('E1'),
    { left: thin, right: thin, top: medium, bottom: thin },
    { size: 11 }
  )
  applyStyle(
    sheet.getCell('F1'),
    { left: thin, right: thin, top: medium, bottom: thin },
    { size: 11 }
  )
  applyStyle(
    sheet.getCell('G1'),
    { left: thin, right: thin, top: medium, bottom: thin },
    { size: 11 }
  )
  applyStyle(
    sheet.getCell('H1'),
    { left: thin, right: medium, top: medium, bottom: thin },
    { size: 11 }
  )

  // ── Row 2: Club name + metadata values ──
  sheet.addRow([
    '',
    `Randonneurs Ontario ${data.chapterName}`,
    '',
    '',
    '',
    data.eventDate,
    `${data.distanceKm} km`,
    'Médaille',
    'Sexe',
  ])
  sheet.mergeCells('B2:D2')

  applyStyle(sheet.getCell('A2'), { left: medium, right: thin, top: thin, bottom: thin })
  applyStyle(sheet.getCell('B2'), { left: thin, right: thin, top: thin, bottom: thin })
  applyStyle(sheet.getCell('E2'), { left: thin, right: thin, top: thin, bottom: thin })
  applyStyle(sheet.getCell('F2'), { left: thin, right: thin, top: thin, bottom: thin })
  applyStyle(sheet.getCell('G2'), { left: thin, right: thin, top: thin, bottom: thin })
  applyStyle(
    sheet.getCell('H2'),
    { left: thin, right: thin, top: thin, bottom: thin },
    { size: 10 }
  )
  applyStyle(sheet.getCell('I2'), { left: thin, right: medium, top: thin, bottom: thin })

  // ── Row 3: Column headers ──
  sheet.addRow(['', 'NOM', 'PRENOM', 'CLUB DU PARTICIPANT', '', 'CODE ACP', 'TEMPS', '(x)', '(F)'])
  sheet.mergeCells('D3:E3')

  // A1:A3 merged — must merge after all 3 rows exist
  sheet.mergeCells('A1:A3')
  // Re-apply A1 style after merge (ExcelJS needs this)
  applyStyle(sheet.getCell('A1'), { left: medium, right: thin, top: medium, bottom: medium })

  applyStyle(sheet.getCell('B3'), { left: thin, right: thin, top: thin, bottom: medium })
  applyStyle(sheet.getCell('C3'), { left: thin, right: thin, top: thin, bottom: medium })
  applyStyle(sheet.getCell('D3'), { left: thin, right: thin, top: thin, bottom: medium })
  applyStyle(sheet.getCell('F3'), { left: thin, right: thin, top: thin, bottom: medium })
  applyStyle(sheet.getCell('G3'), { left: thin, right: thin, top: thin, bottom: medium })
  applyStyle(
    sheet.getCell('H3'),
    { left: thin, right: thin, top: thin, bottom: medium },
    { size: 10 }
  )
  applyStyle(sheet.getCell('I3'), { left: thin, right: medium, top: thin, bottom: medium })

  // ── Data rows — sorted by last name ──
  const sorted = [...data.results].sort((a, b) => a.lastName.localeCompare(b.lastName))

  sorted.forEach((rider, index) => {
    const rowNum = 4 + index
    const isFirst = index === 0
    const isLast = index === sorted.length - 1
    const topBdr = isFirst ? medium : thin
    const bottomBdr = isLast ? medium : thin

    sheet.addRow([
      '',
      rider.lastName,
      rider.firstName,
      'Randonneurs Ontario',
      '',
      '',
      rider.finishTime ? formatFinishTime(rider.finishTime) : '',
      '',
      rider.gender === 'F' ? 'F' : '',
    ])
    sheet.mergeCells(`D${rowNum}:E${rowNum}`)

    applyStyle(sheet.getCell(`A${rowNum}`), {
      left: medium,
      right: thin,
      top: topBdr,
      bottom: bottomBdr,
    })
    applyStyle(sheet.getCell(`B${rowNum}`), {
      left: thin,
      right: thin,
      top: topBdr,
      bottom: bottomBdr,
    })
    applyStyle(sheet.getCell(`C${rowNum}`), {
      left: thin,
      right: thin,
      top: topBdr,
      bottom: bottomBdr,
    })
    applyStyle(sheet.getCell(`D${rowNum}`), {
      left: thin,
      right: thin,
      top: topBdr,
      bottom: bottomBdr,
    })
    applyStyle(sheet.getCell(`F${rowNum}`), {
      left: thin,
      right: thin,
      top: topBdr,
      bottom: bottomBdr,
    })
    applyStyle(sheet.getCell(`G${rowNum}`), {
      left: thin,
      right: thin,
      top: topBdr,
      bottom: bottomBdr,
    })
    applyStyle(sheet.getCell(`H${rowNum}`), {
      left: thin,
      right: thin,
      top: topBdr,
      bottom: bottomBdr,
    })
    applyStyle(sheet.getCell(`I${rowNum}`), {
      left: thin,
      right: medium,
      top: topBdr,
      bottom: bottomBdr,
    })
  })

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const dateCompact = data.eventDate.replace(/-/g, '')
  const filename = `${dateCompact}-${sanitizeFilename(data.eventName)}-${data.distanceKm}.xlsx`

  return {
    buffer,
    filename,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
}

const CSV_HEADERS = [
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
 * Generate a CSV string as fallback if XLSX generation fails.
 */
export function generateAcpCsv(data: SpreadsheetData): {
  content: string
  filename: string
  mimeType: string
} {
  const lines: string[] = []

  // Header line
  lines.push(CSV_HEADERS.map(escapeCsvField).join(','))

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

  const dateCompact = data.eventDate.replace(/-/g, '')
  const filename = `${dateCompact}-${sanitizeFilename(data.eventName)}-${data.distanceKm}.csv`

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

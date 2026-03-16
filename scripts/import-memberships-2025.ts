/**
 * Import 2025 membership data from CCN CSV export into rider_memberships.
 *
 * Steps:
 * 1. Parse CSV, deduplicate by Identity ID
 * 2. Fuzzy match CSV rows against existing riders
 * 3. For matched riders: update ccn_id and birth_year
 * 4. For unmatched riders: create new rider records
 * 5. Insert rider_memberships records
 *
 * Usage: npx tsx scripts/import-memberships-2025.ts <csv-file-path>
 *        npx tsx scripts/import-memberships-2025.ts <csv-file-path> --dry-run
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fuzzyNameScore } from '../lib/utils/fuzzy-match'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const SEASON = 2025

// Chapter name from CSV -> chapter UUID
const CHAPTER_MAP: Record<string, string> = {
  Huron: 'f5ff7f81-fa76-4ee6-b2db-7b3c22363315',
  Ottawa: '6c44658e-8f0d-4569-9f79-a5f2d1dd6db6',
  Simcoe: 'f333c259-1232-4a48-9b46-8ad42ab5d800', // Simcoe-Muskoka
  Toronto: 'ad83d0b9-4d25-472b-9d3e-5732730d761c',
}

// Manual overrides for ambiguous matches confirmed by the user.
// CSV "First Last" -> DB rider UUID
const MANUAL_OVERRIDES: Record<string, string> = {
  'Jerome Cornet': '757aeb4b-1fce-59fa-90fa-f28ab8411198',
  'Pascal Laperriere': '010e211c-0517-5891-b848-3495061681f8',
  'Emerson Lover': '924b75d4-5b80-5705-b685-24da3443be94',
  'Max Perisiol/Shtapler': '5d273d97-7894-594f-bdab-6e08cf47271e',
  'Dragi Gasevski': '46a09b5a-49d2-5c75-bfd3-1a629da94ced',
  // Also confirmed fuzzy matches from the double-check list
  'Mike Benard': 'f3538edd-b405-59c7-b6ba-f46fb5b6f173',
  'Jonathan Myers': 'd08323fd-b161-51f4-b737-33a1d8dccfdb',
}

interface CsvRow {
  'Reg ID': string
  'Identity ID': string
  'First Name': string
  'Last Name': string
  Category: string
  DOB: string
  Email: string
  Chapter: string
  'Registrant City': string
  'Registrant Province': string
  'Registrant Country': string
}

interface Rider {
  id: string
  first_name: string
  last_name: string
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  result.push(current)
  return result
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split('\n').filter((l) => l.trim())
  const header = parseCSVLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    header.forEach((h, i) => {
      row[h] = values[i] || ''
    })
    return row as unknown as CsvRow
  })
}

function deduplicateCsvRows(rows: CsvRow[]): CsvRow[] {
  const byIdentity = new Map<string, CsvRow[]>()
  for (const row of rows) {
    const id = row['Identity ID']
    if (!id) continue // skip empty rows
    if (!byIdentity.has(id)) byIdentity.set(id, [])
    byIdentity.get(id)!.push(row)
  }

  const deduped: CsvRow[] = []
  for (const [, group] of byIdentity) {
    const primary = group.find(
      (r) =>
        r.Category === 'Individual Membership' ||
        r.Category === 'Family Membership > PRIMARY FAMILY MEMBER'
    )
    deduped.push(primary || group[0])
  }
  return deduped
}

function parseBirthYear(dob: string): number | null {
  if (!dob) return null
  // Format: YYYY/MM/DD
  const year = parseInt(dob.split('/')[0], 10)
  return isNaN(year) ? null : year
}

function parseCcnId(identityId: string): number | null {
  if (!identityId) return null
  const num = parseInt(identityId.replace('.0', ''), 10)
  return isNaN(num) ? null : num
}

function createSlug(firstName: string, lastName: string): string {
  return `${firstName}-${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function matchRider(
  csvFirst: string,
  csvLast: string,
  riders: Rider[]
): { rider: Rider; score: number } | null {
  // Check manual overrides first
  const csvFullName = `${csvFirst} ${csvLast}`
  const overrideId = MANUAL_OVERRIDES[csvFullName]
  if (overrideId) {
    const rider = riders.find((r) => r.id === overrideId)
    if (rider) return { rider, score: 1.0 }
  }

  const scored = riders
    .map((r) => ({
      rider: r,
      score: fuzzyNameScore(csvFirst, csvLast, r.first_name, r.last_name),
    }))
    .filter((r) => r.score >= 0.7)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null

  if (scored[0].score >= 0.95) return scored[0]

  if (
    scored[0].score >= 0.85 &&
    (scored.length === 1 || scored[0].score - scored[1].score >= 0.1)
  ) {
    return scored[0]
  }

  // If we get here, it's ambiguous — shouldn't happen because all ambiguous
  // cases were resolved via MANUAL_OVERRIDES or confirmed as new riders
  return null
}

async function main() {
  const csvPath = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')

  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-memberships-2025.ts <csv-file-path> [--dry-run]')
    process.exit(1)
  }

  if (dryRun) console.log('*** DRY RUN — no database changes will be made ***\n')

  const csvContent = readFileSync(csvPath, 'utf-8')
  const allCsvRows = parseCsv(csvContent)
  const csvRows = deduplicateCsvRows(allCsvRows)

  console.log(`CSV: ${allCsvRows.length} total rows, ${csvRows.length} unique people`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: riders, error } = await supabase
    .from('riders')
    .select('id, first_name, last_name')
    .order('last_name')
    .order('first_name')

  if (error || !riders) {
    console.error('Error fetching riders:', error)
    process.exit(1)
  }

  console.log(`Database: ${riders.length} riders\n`)

  let matchedCount = 0
  let createdCount = 0
  let membershipCount = 0
  let errorCount = 0

  for (const row of csvRows) {
    const csvFirst = row['First Name'].trim()
    const csvLast = row['Last Name'].trim()
    if (!csvFirst && !csvLast) continue // skip empty rows
    if (csvFirst.toLowerCase() === 'test') continue // skip test rows

    const ccnId = parseCcnId(row['Identity ID'])
    const birthYear = parseBirthYear(row.DOB)
    const chapterId = CHAPTER_MAP[row.Chapter] || null
    const membershipType = row.Category
    const city = row['Registrant City'] || null
    const province = row['Registrant Province'] || null
    const country = row['Registrant Country'] || null

    if (!membershipType) {
      console.error(`  SKIP: ${csvFirst} ${csvLast} — no membership type`)
      errorCount++
      continue
    }

    const match = matchRider(csvFirst, csvLast, riders)
    let riderId: string

    if (match) {
      riderId = match.rider.id
      matchedCount++
      const label =
        match.score < 1.0 ? ` (fuzzy: ${match.rider.first_name} ${match.rider.last_name})` : ''
      console.log(`  MATCH: ${csvFirst} ${csvLast}${label}`)

      // Update ccn_id and birth_year on the matched rider
      if (!dryRun) {
        const updates: Record<string, number> = {}
        if (ccnId) updates.ccn_id = ccnId
        if (birthYear) updates.birth_year = birthYear

        if (Object.keys(updates).length > 0) {
          const { error: updateErr } = await supabase
            .from('riders')
            .update(updates)
            .eq('id', riderId)

          if (updateErr) {
            console.error(`    ERROR updating rider: ${updateErr.message}`)
            errorCount++
          }
        }
      }
    } else {
      // Create new rider
      createdCount++
      console.log(`  CREATE: ${csvFirst} ${csvLast}`)

      if (!dryRun) {
        const slug = createSlug(csvFirst, csvLast)
        const { data: newRider, error: insertErr } = await supabase
          .from('riders')
          .insert({
            first_name: csvFirst,
            last_name: csvLast,
            email: row.Email || null,
            slug,
            ccn_id: ccnId,
            birth_year: birthYear,
          })
          .select('id')
          .single()

        if (insertErr || !newRider) {
          console.error(`    ERROR creating rider: ${insertErr?.message}`)
          errorCount++
          continue
        }
        riderId = newRider.id

        // Add to our in-memory riders list so we don't create duplicates
        // (e.g. if a family member appears with same Identity ID)
        riders.push({ id: riderId, first_name: csvFirst, last_name: csvLast })
      } else {
        riderId = 'dry-run-id'
      }
    }

    // Insert rider_membership
    if (!dryRun) {
      const { error: membershipErr } = await supabase.from('rider_memberships').insert({
        rider_id: riderId,
        season: SEASON,
        chapter_id: chapterId,
        membership_type: membershipType,
        city,
        province,
        country,
      })

      if (membershipErr) {
        console.error(
          `    ERROR inserting membership for ${csvFirst} ${csvLast}: ${membershipErr.message}`
        )
        errorCount++
        continue
      }
    }
    membershipCount++
  }

  console.log(`\n=== RESULTS ===`)
  console.log(`Matched to existing riders: ${matchedCount}`)
  console.log(`New riders created: ${createdCount}`)
  console.log(`Memberships inserted: ${membershipCount}`)
  console.log(`Errors: ${errorCount}`)
  if (dryRun) console.log(`\n*** DRY RUN — re-run without --dry-run to apply ***`)
}

main()

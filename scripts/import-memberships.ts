/**
 * Import membership data from CCN CSV export into rider_memberships.
 *
 * Steps:
 * 1. Parse CSV, deduplicate by Identity ID
 * 2. Fuzzy match CSV rows against existing riders
 * 3. For matched riders: update ccn_id, birth_year, and fill empty email/gender
 * 4. For unmatched riders: create new rider records
 * 5. Insert rider_memberships records
 *
 * Usage: npx tsx scripts/import-memberships.ts <season> <csv-file-path> [--dry-run]
 * Example: npx tsx scripts/import-memberships.ts 2024 ~/Downloads/membership-2024.csv
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fuzzyNameScore } from '../lib/utils/fuzzy-match'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

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
  'Mike Benard': 'f3538edd-b405-59c7-b6ba-f46fb5b6f173',
  'Jonathan Myers': 'd08323fd-b161-51f4-b737-33a1d8dccfdb',
  'Marc-Antoine Robin': 'f1178563-cd8d-5115-939a-496e3223ef62',
  'Sean Keesler': '73df93f2-d149-442b-bbb9-f3ce692eab81',
  'Jing Xi Zhou': '8f2e3abd-f2b3-5fd8-8f0e-96c8d387f0d4', // Stanley Zhou
  'Patrick Dornian': 'bc35af68-27d7-5690-ae8d-14daa5bbc57b', // Patrick Domian
  'Brenda Wiechers': '0d83a481-c7ba-52bb-bd64-2773c7dacd17', // Brenda Wiechers-Maxwell
  'ozzie ala': '61ca0a2b-b46f-5ee5-853a-c7ae76b205d8', // Orazio Ala
  'Gerardo isaac fernandez campos': '8880fbc8-21e2-5b93-8d40-4f1bfbb256d6',
  'Geevan Lal Soman': 'a0738693-b1b3-5ede-8ab0-b5b95e66e595',
}

// Names that fuzzy matching incorrectly matches to someone else.
// Listed here so they go through the MANUAL_OVERRIDES path instead.
const FORCE_NEW_RIDER = new Set<string>([])

// CSV Sex field -> riders.gender
function mapGender(sex: string): string | null {
  switch (sex?.trim().toLowerCase()) {
    case 'male':
      return 'M'
    case 'female':
      return 'F'
    default:
      return null
  }
}

interface CsvRow {
  'Reg ID': string
  'Identity ID': string
  'First Name': string
  'Last Name': string
  Category: string
  Sex: string
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
  email: string | null
  gender: string | null
  ccn_id: number | null
  birth_year: number | null
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
  // Find the header row (older exports have a title row before the actual header)
  const headerIdx = lines.findIndex((l) => l.startsWith('Reg ID'))
  if (headerIdx === -1) {
    console.error('Could not find header row starting with "Reg ID"')
    process.exit(1)
  }
  const header = parseCSVLine(lines[headerIdx])
  return lines.slice(headerIdx + 1).map((line) => {
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
    if (!id) continue
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
  const csvFullName = `${csvFirst} ${csvLast}`
  if (FORCE_NEW_RIDER.has(csvFullName)) return null
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

  return null
}

async function main() {
  const season = parseInt(process.argv[2], 10)
  const csvPath = process.argv[3]
  const dryRun = process.argv.includes('--dry-run')

  if (!season || !csvPath) {
    console.error(
      'Usage: npx tsx scripts/import-memberships.ts <season> <csv-file-path> [--dry-run]'
    )
    process.exit(1)
  }

  if (dryRun) console.log('*** DRY RUN — no database changes will be made ***\n')

  const csvContent = readFileSync(csvPath, 'utf-8')
  const allCsvRows = parseCsv(csvContent)
  const csvRows = deduplicateCsvRows(allCsvRows)

  console.log(`Season: ${season}`)
  console.log(`CSV: ${allCsvRows.length} total rows, ${csvRows.length} unique people`)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: riders, error } = await supabase
    .from('riders')
    .select('id, first_name, last_name, email, gender, ccn_id, birth_year')
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
    if (!csvFirst && !csvLast) continue
    if (csvFirst.toLowerCase() === 'test') continue

    const ccnId = parseCcnId(row['Identity ID'])
    const birthYear = parseBirthYear(row.DOB)
    const gender = mapGender(row.Sex)
    const email = row.Email?.trim() || null
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

      // Only update fields that are currently empty on the rider
      if (!dryRun) {
        const updates: Record<string, string | number> = {}
        if (ccnId && !match.rider.ccn_id) updates.ccn_id = ccnId
        if (birthYear && !match.rider.birth_year) updates.birth_year = birthYear
        if (email && !match.rider.email) updates.email = email
        if (gender && !match.rider.gender) updates.gender = gender

        if (Object.keys(updates).length > 0) {
          const { error: updateErr } = await supabase
            .from('riders')
            .update(updates)
            .eq('id', riderId)

          if (updateErr) {
            console.error(`    ERROR updating rider: ${updateErr.message}`)
            errorCount++
          } else {
            // Update in-memory rider so subsequent matches see the new data
            Object.assign(match.rider, updates)
          }
        }
      }
    } else {
      createdCount++
      console.log(`  CREATE: ${csvFirst} ${csvLast}`)

      if (!dryRun) {
        const slug = createSlug(csvFirst, csvLast)
        const { data: newRider, error: insertErr } = await supabase
          .from('riders')
          .insert({
            first_name: csvFirst,
            last_name: csvLast,
            email,
            gender,
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
        riders.push({
          id: riderId,
          first_name: csvFirst,
          last_name: csvLast,
          email,
          gender,
          ccn_id: ccnId,
          birth_year: birthYear,
        })
      } else {
        riderId = 'dry-run-id'
      }
    }

    if (!dryRun) {
      const { error: membershipErr } = await supabase.from('rider_memberships').insert({
        rider_id: riderId,
        season,
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

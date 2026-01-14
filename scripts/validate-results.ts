#!/usr/bin/env npx tsx

/**
 * CLI tool for validating database results against HTML source pages.
 *
 * Usage:
 *   npx tsx scripts/validate-results.ts -c toronto -y 2024
 *   npx tsx scripts/validate-results.ts -c ottawa -y 2023 -o json > report.json
 *   npx tsx scripts/validate-results.ts -c permanent -y 2022 -o markdown
 */

import { parseArgs } from 'util'
import { config } from 'dotenv'
import { join } from 'path'

// Load environment variables from .env.local
config({ path: join(process.cwd(), '.env.local') })

import { buildResultsUrl, getValidChapters, getChapterConfig } from './lib/validation/url-builder'
import { fetchHtml } from './lib/validation/html-fetcher'
import { parseHtmlWithLLM } from './lib/validation/llm-parser'
import { getDbEventsForChapterYear } from './lib/validation/db-fetcher'
import { compareData } from './lib/validation/comparator'
import {
  generateConsoleReport,
  generateJsonReport,
  generateMarkdownReport,
} from './lib/validation/report-generator'
import type { ValidationReport, ValidationSummary } from './lib/validation/types'

// Parse command line arguments
const { values } = parseArgs({
  options: {
    chapter: { type: 'string', short: 'c' },
    year: { type: 'string', short: 'y' },
    output: { type: 'string', short: 'o', default: 'console' },
    'no-cache': { type: 'boolean', default: false },
    verbose: { type: 'boolean', short: 'v', default: false },
    help: { type: 'boolean', short: 'h' },
  },
})

function printHelp(): void {
  console.log(`
Validate database results against HTML source pages.

Usage: npx tsx scripts/validate-results.ts [options]

Options:
  -c, --chapter    Chapter to validate (${getValidChapters().join(', ')})
  -y, --year       Year to validate (e.g., 2024)
  -o, --output     Output format: console (default), json, markdown
  --no-cache       Force re-fetch of HTML (ignore cache)
  -v, --verbose    Show detailed progress
  -h, --help       Show this help

Examples:
  npx tsx scripts/validate-results.ts -c toronto -y 2024
  npx tsx scripts/validate-results.ts -c ottawa -y 2023 -o json > report.json
  npx tsx scripts/validate-results.ts -c permanent -y 2022 -o markdown
`)
}

async function main(): Promise<void> {
  if (values.help) {
    printHelp()
    process.exit(0)
  }

  const chapter = values.chapter
  const year = parseInt(values.year || '', 10)
  const output = values.output || 'console'
  const useCache = !values['no-cache']
  const verbose = values.verbose

  // Validate inputs
  if (!chapter) {
    console.error('Error: --chapter is required')
    console.error(`Valid chapters: ${getValidChapters().join(', ')}`)
    process.exit(1)
  }

  if (!getValidChapters().includes(chapter)) {
    console.error(`Error: Unknown chapter "${chapter}"`)
    console.error(`Valid chapters: ${getValidChapters().join(', ')}`)
    process.exit(1)
  }

  if (!year || isNaN(year)) {
    console.error('Error: --year is required and must be a number')
    process.exit(1)
  }

  const chapterConfig = getChapterConfig(chapter)
  if (chapterConfig) {
    if (year < chapterConfig.startYear) {
      console.error(`Error: No results available for ${chapter} before ${chapterConfig.startYear}`)
      process.exit(1)
    }
    if (chapterConfig.endYear && year > chapterConfig.endYear) {
      console.error(`Error: No results available for ${chapter} after ${chapterConfig.endYear}`)
      process.exit(1)
    }
  }

  if (!['console', 'json', 'markdown'].includes(output)) {
    console.error('Error: --output must be one of: console, json, markdown')
    process.exit(1)
  }

  // Run validation
  const log = (msg: string) => {
    if (verbose || output === 'console') {
      console.error(msg) // Use stderr for progress so stdout is clean for JSON/markdown
    }
  }

  try {
    log(`Validating ${chapter} ${year}...`)

    // 1. Build URL
    const url = buildResultsUrl(chapter, year)
    log(`Fetching: ${url}`)

    // 2. Fetch HTML
    const { html, fromCache, error: fetchError } = await fetchHtml(url, useCache)
    if (fetchError) {
      console.error(`Error fetching HTML: ${fetchError}`)
      process.exit(1)
    }
    log(fromCache ? '(from cache)' : '(fetched fresh)')

    if (!html) {
      console.error('Error: Empty HTML response')
      process.exit(1)
    }

    // 3. Parse with OpenAI
    log('Parsing HTML with OpenAI...')
    const htmlEvents = await parseHtmlWithLLM(html, { verbose })
    log(`Found ${htmlEvents.length} events in HTML`)

    // 4. Fetch DB data
    log('Fetching database data...')
    const dbEvents = await getDbEventsForChapterYear(chapter, year)
    log(`Found ${dbEvents.length} events in database`)

    // 5. Compare
    log('Comparing data...')
    const eventMatches = compareData(htmlEvents, dbEvents)

    // 6. Build report
    const summary: ValidationSummary = {
      eventsInHtml: htmlEvents.length,
      eventsInDb: dbEvents.length,
      eventsMatched: eventMatches.filter((e) => e.dbEvent && e.matchConfidence > 0.6).length,
      ridersValidated: htmlEvents.reduce((sum, e) => sum + e.riders.length, 0),
      errorsFound: eventMatches
        .flatMap((e) => e.discrepancies)
        .filter((d) => d.severity === 'error').length,
      warningsFound: eventMatches
        .flatMap((e) => e.discrepancies)
        .filter((d) => d.severity === 'warning').length,
      infosFound: eventMatches.flatMap((e) => e.discrepancies).filter((d) => d.severity === 'info')
        .length,
    }

    const report: ValidationReport = {
      chapter,
      year,
      url,
      fetchedAt: new Date().toISOString(),
      fromCache,
      summary,
      events: eventMatches,
    }

    // 7. Output
    switch (output) {
      case 'json':
        console.log(generateJsonReport(report))
        break
      case 'markdown':
        console.log(generateMarkdownReport(report))
        break
      default:
        generateConsoleReport(report)
    }
  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error))
    if (verbose && error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()

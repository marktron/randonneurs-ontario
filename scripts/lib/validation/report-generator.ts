/**
 * Report Generator for validation results.
 *
 * Supports console, JSON, and Markdown output formats.
 */

import type { ValidationReport } from './types'

/**
 * Generate a console report with colored output.
 */
export function generateConsoleReport(report: ValidationReport): void {
  const divider = '='.repeat(70)
  const subDivider = '-'.repeat(40)

  console.log('')
  console.log(divider)
  console.log(`VALIDATION REPORT: ${report.chapter.toUpperCase()} ${report.year}`)
  console.log(divider)
  console.log(`Source: ${report.url}`)
  console.log(`Fetched: ${report.fetchedAt}${report.fromCache ? ' (from cache)' : ''}`)
  console.log('')

  // Summary
  console.log('SUMMARY')
  console.log(subDivider)
  console.log(`Events in HTML:     ${report.summary.eventsInHtml}`)
  console.log(`Events in DB:       ${report.summary.eventsInDb}`)
  console.log(`Events matched:     ${report.summary.eventsMatched}`)
  console.log(`Riders validated:   ${report.summary.ridersValidated}`)
  console.log(`Errors:             ${report.summary.errorsFound}`)
  console.log(`Warnings:           ${report.summary.warningsFound}`)
  console.log(`Info:               ${report.summary.infosFound}`)
  console.log('')

  // Discrepancies by event
  const eventsWithIssues = report.events.filter((e) => e.discrepancies.length > 0)

  if (eventsWithIssues.length === 0) {
    console.log('No discrepancies found!')
  } else {
    console.log('DISCREPANCIES')
    console.log(subDivider)

    for (const event of eventsWithIssues) {
      const eventName = event.dbEvent?.name || event.htmlEvent.name
      const eventDate = event.dbEvent?.date || event.htmlEvent.date
      console.log(`\n${eventDate} - ${eventName}`)

      for (const d of event.discrepancies) {
        const icon = getIcon(d.severity)
        console.log(`  ${icon} ${d.description}`)
        if (d.htmlValue) console.log(`     HTML: ${d.htmlValue}`)
        if (d.dbValue) console.log(`     DB:   ${d.dbValue}`)
      }
    }
  }

  console.log('')
  console.log(divider)
}

/**
 * Get icon for severity level.
 */
function getIcon(severity: 'error' | 'warning' | 'info'): string {
  switch (severity) {
    case 'error':
      return '[ERROR]'
    case 'warning':
      return '[WARN]'
    case 'info':
      return '[INFO]'
  }
}

/**
 * Generate a JSON report.
 */
export function generateJsonReport(report: ValidationReport): string {
  return JSON.stringify(report, null, 2)
}

/**
 * Generate a Markdown report.
 */
export function generateMarkdownReport(report: ValidationReport): string {
  const lines: string[] = []

  lines.push(`# Validation Report: ${report.chapter} ${report.year}`)
  lines.push('')
  lines.push(`- **Source:** ${report.url}`)
  lines.push(`- **Generated:** ${report.fetchedAt}`)
  lines.push(`- **From cache:** ${report.fromCache ? 'Yes' : 'No'}`)
  lines.push('')

  // Summary table
  lines.push('## Summary')
  lines.push('')
  lines.push('| Metric | Count |')
  lines.push('|--------|------:|')
  lines.push(`| Events in HTML | ${report.summary.eventsInHtml} |`)
  lines.push(`| Events in DB | ${report.summary.eventsInDb} |`)
  lines.push(`| Events matched | ${report.summary.eventsMatched} |`)
  lines.push(`| Riders validated | ${report.summary.ridersValidated} |`)
  lines.push(`| Errors | ${report.summary.errorsFound} |`)
  lines.push(`| Warnings | ${report.summary.warningsFound} |`)
  lines.push(`| Info | ${report.summary.infosFound} |`)
  lines.push('')

  // Discrepancies
  const eventsWithIssues = report.events.filter((e) => e.discrepancies.length > 0)

  if (eventsWithIssues.length === 0) {
    lines.push('## Results')
    lines.push('')
    lines.push('No discrepancies found.')
  } else {
    lines.push('## Discrepancies')
    lines.push('')

    for (const event of eventsWithIssues) {
      const eventName = event.dbEvent?.name || event.htmlEvent.name
      const eventDate = event.dbEvent?.date || event.htmlEvent.date
      lines.push(`### ${eventDate} - ${eventName}`)
      lines.push('')

      for (const d of event.discrepancies) {
        const badge = getBadge(d.severity)
        lines.push(`- ${badge} **${d.type}**: ${d.description}`)
        if (d.htmlValue) lines.push(`  - HTML: \`${d.htmlValue}\``)
        if (d.dbValue) lines.push(`  - DB: \`${d.dbValue}\``)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

/**
 * Get markdown badge for severity level.
 */
function getBadge(severity: 'error' | 'warning' | 'info'): string {
  switch (severity) {
    case 'error':
      return '🔴'
    case 'warning':
      return '🟡'
    case 'info':
      return '🔵'
  }
}

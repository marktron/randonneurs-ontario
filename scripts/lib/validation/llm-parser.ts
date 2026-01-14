/**
 * LLM Parser for extracting structured data from HTML result pages.
 *
 * Uses OpenAI to parse the inconsistent, hand-coded HTML into
 * structured event and rider result data.
 */

import OpenAI from 'openai'
import type { ParsedEvent } from './types'

const SYSTEM_PROMPT = `You are a data extraction assistant for cycling event results.
You will receive HTML content from randonneuring (long-distance cycling) result pages.

Your task is to extract ALL events and rider results from the HTML.

For each event, extract:
- date: The event date in YYYY-MM-DD format
- name: The route/event name (e.g., "Merrickville 200", "Lake and Vines 300")
- distance: The distance in kilometers (extract from the name if mentioned, e.g., "200" from "Merrickville 200")

For each rider in each event, extract:
- name: Full name as written
- firstName: The first name (typically the first word, but be careful with names like "Jean-Pierre")
- lastName: The last name (remaining words after the first name)
- time: Completion time in H:MM or HH:MM format, or null if DNF/DNS
- status: "finished" if they have a time, "dnf" if marked DNF, "dns" if marked DNS

IMPORTANT:
- The format is typically "Rider Name - HH:MM" or "Rider Name - DNF"
- Names may have variations: "O'Callahan", "MacGregor", "Van der Berg", "de Vries"
- Times are in hours:minutes format (e.g., "10:30" means 10 hours 30 minutes)
- Normalize times: "13:2" should become "13:02", "9:05" stays as "9:05"
- Some entries might be marked "(unofficial)" - still include them with status "finished"
- Events are separated by headers with dates and event names
- Dates may be in various formats: "October 18, 2025", "Apr 15, 2024", etc. - always convert to YYYY-MM-DD
- For hyphenated first names like "Jean-Pierre", treat the whole hyphenated part as the first name

Return ONLY valid JSON in this exact format:
{
  "events": [
    {
      "date": "2025-04-15",
      "name": "Merrickville 200",
      "distance": 200,
      "riders": [
        {
          "name": "John Smith",
          "firstName": "John",
          "lastName": "Smith",
          "time": "10:30",
          "status": "finished"
        }
      ]
    }
  ]
}`

/**
 * Clean HTML by removing scripts, styles, navigation, and other noise.
 */
function cleanHtml(html: string): string {
  return (
    html
      // Remove script tags and contents
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove style tags and contents
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // Remove nav elements
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      // Remove header elements
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      // Remove footer elements
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * Validate the parsed response structure.
 */
function validateParsedResponse(data: unknown): data is { events: ParsedEvent[] } {
  if (typeof data !== 'object' || data === null) return false
  if (!('events' in data)) return false
  if (!Array.isArray((data as { events: unknown }).events)) return false
  return true
}

/**
 * Parse HTML using OpenAI to extract structured event and rider data.
 */
export async function parseHtmlWithLLM(
  html: string,
  options: { verbose?: boolean } = {}
): Promise<ParsedEvent[]> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  const cleanedHtml = cleanHtml(html)

  if (options.verbose) {
    console.log(`Sending ${cleanedHtml.length} characters to OpenAI...`)
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Extract all events and results from this HTML:\n\n${cleanedHtml}` },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 16000,
  })

  const content = response.choices[0].message.content
  if (!content) {
    throw new Error('Empty response from OpenAI')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    throw new Error(`Failed to parse OpenAI response as JSON: ${e}`)
  }

  if (!validateParsedResponse(parsed)) {
    throw new Error('OpenAI response does not match expected format')
  }

  // Post-process to normalize times
  for (const event of parsed.events) {
    for (const rider of event.riders) {
      if (rider.time) {
        // Normalize time format: ensure minutes have 2 digits
        const match = rider.time.match(/^(\d+):(\d+)$/)
        if (match) {
          const hours = match[1]
          const minutes = match[2].padStart(2, '0')
          rider.time = `${hours}:${minutes}`
        }
      }
    }
  }

  if (options.verbose) {
    console.log(`Parsed ${parsed.events.length} events`)
    const totalRiders = parsed.events.reduce((sum, e) => sum + e.riders.length, 0)
    console.log(`Total riders: ${totalRiders}`)
  }

  return parsed.events
}

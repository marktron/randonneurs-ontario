# Data Validation Tool

A CLI tool for validating database results against the original HTML source pages from randonneursontario.ca.

## Overview

The validation tool fetches result pages from the legacy website, uses OpenAI to parse the inconsistent HTML into structured data, and compares it against the Supabase database to identify discrepancies.

## Prerequisites

1. **OpenAI API Key**: Add your OpenAI API key to `.env.local`:

   ```
   OPENAI_API_KEY=sk-...
   ```

2. **Supabase Connection**: The tool requires the Supabase service role key to bypass RLS and access rider data:

   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...   # Required - get from Supabase dashboard > Settings > API
   ```

   You can find the service role key in your Supabase dashboard under Settings > API > Project API keys > service_role.

## Usage

```bash
# Basic usage
npm run validate -- -c toronto -y 2024

# With JSON output (for programmatic use)
npm run validate -- -c ottawa -y 2023 -o json > report.json

# With Markdown output
npm run validate -- -c permanent -y 2022 -o markdown > report.md

# Force fresh fetch (bypass cache)
npm run validate -- -c toronto -y 2024 --no-cache

# Verbose mode
npm run validate -- -c toronto -y 2024 -v
```

### Options

| Option       | Short | Description                                                              |
| ------------ | ----- | ------------------------------------------------------------------------ |
| `--chapter`  | `-c`  | Chapter to validate (toronto, ottawa, simcoe, huron, permanent, niagara) |
| `--year`     | `-y`  | Year to validate                                                         |
| `--output`   | `-o`  | Output format: console (default), json, markdown                         |
| `--no-cache` |       | Force re-fetch of HTML (ignore cache)                                    |
| `--verbose`  | `-v`  | Show detailed progress                                                   |
| `--help`     | `-h`  | Show help                                                                |

### Available Chapters

| Chapter   | URL Code | Years Available |
| --------- | -------- | --------------- |
| toronto   | tor      | 1997-present    |
| ottawa    | ott      | 2006-present    |
| simcoe    | sim      | 2006-present    |
| huron     | hur      | 2006-present    |
| permanent | perm     | 2013-present    |
| niagara   | niag     | 2005-2006 only  |

## Output

### Console Output

```
======================================================================
VALIDATION REPORT: TORONTO 2024
======================================================================
Source: https://www.randonneursontario.ca/result/torres24.html
Fetched: 2025-01-13T15:30:00Z

SUMMARY
----------------------------------------
Events in HTML:     45
Events in DB:       44
Events matched:     43
Riders validated:   312
Errors:             3
Warnings:           8
Info:               12

DISCREPANCIES
----------------------------------------

2024-04-15 - Spring 200
  [ERROR] Rider not found in database
     HTML: Jean-Pierre Dubois - 10:45
  [WARN] Time mismatch
     HTML: 11:30
     DB:   11:35

2024-06-22 - Midsummer 300
  [INFO] Name variation (92% match)
     HTML: Bob O'Callahan
     DB:   Robert O'Callahan
```

### Discrepancy Types

| Type                    | Severity | Description                             |
| ----------------------- | -------- | --------------------------------------- |
| `missing_in_db`         | error    | Result in HTML not found in database    |
| `missing_in_html`       | warning  | Result in database not found in HTML    |
| `time_mismatch`         | warning  | Finish times don't match                |
| `status_mismatch`       | warning  | Status (finished/dnf/dns) doesn't match |
| `name_variation`        | info     | Names matched but have variations       |
| `event_missing_in_db`   | error    | Event in HTML not found in database     |
| `event_missing_in_html` | warning  | Event in database not found in HTML     |

## How It Works

1. **URL Building**: Constructs the URL for the result page based on chapter and year
2. **HTML Fetching**: Downloads the HTML with caching to avoid repeated fetches
3. **LLM Parsing**: Uses OpenAI (gpt-5-mini) to parse the inconsistent HTML into structured data
4. **DB Fetching**: Queries Supabase for events and results in the same chapter/year
5. **Matching**: Uses fuzzy name matching to correlate riders between HTML and database
6. **Comparison**: Identifies discrepancies between the two data sources
7. **Reporting**: Generates a report in the requested format

## Caching

HTML responses are cached in `.validation-cache/` to avoid repeated fetches during development. Use `--no-cache` to force a fresh fetch.

To clear all cached files:

```bash
rm -rf .validation-cache
```

## Cost

The tool uses OpenAI's gpt-5-mini model, which is cost-effective for structured data extraction. A typical results page costs less than $0.01 to process.

## Fuzzy Matching

The tool uses the project's existing fuzzy matching utilities (`lib/utils/fuzzy-match.ts`) which handles:

- Common nicknames (Bob/Robert, Dave/David, etc.)
- Typos and minor spelling variations
- Name order variations (John Smith vs Smith John)
- Special characters (O'Callahan, MacGregor, van der Berg)

## Architecture

```
scripts/
├── validate-results.ts              # CLI entry point
└── lib/
    └── validation/
        ├── types.ts                 # Type definitions
        ├── url-builder.ts           # URL pattern generation
        ├── html-fetcher.ts          # HTML fetching with cache
        ├── llm-parser.ts            # OpenAI-based HTML parsing
        ├── db-fetcher.ts            # Supabase data fetching
        ├── matcher.ts               # Fuzzy matching logic
        ├── comparator.ts            # Data comparison logic
        └── report-generator.ts      # Report formatting
```

## Troubleshooting

### "OPENAI_API_KEY environment variable is not set"

Make sure your `.env.local` file contains a valid OpenAI API key.

### "Chapter not found" errors

The chapter slug in the database must match exactly. Check `lib/chapter-config.ts` for the correct mappings.

### Empty results

If no events are returned from the database, verify:

1. The chapter has events in the specified year
2. The Supabase connection is working
3. The service role key has access to the data

# Event Results Spreadsheet (ACP Homologation)

When an admin submits event results, the system generates an ACP (Audax Club Parisien) homologation spreadsheet and attaches it to the email sent to the VP of Brevet Administration.

## Format

The spreadsheet follows the ACP homologation format with these columns:

| Column | Description | Source |
|--------|-------------|--------|
| NOM | Rider last name | `riders.last_name` |
| PRENOM | Rider first name | `riders.first_name` |
| CLUB DU PARTICIPANT | Always "Randonneurs Ontario" | Hardcoded |
| _(blank)_ | Empty column | — |
| CODE ACP | ACP membership code | Left blank (not tracked) |
| TEMPS | Finish time (HH:MM) | `results.finish_time` |
| Medal (x) | Medal requested | Left blank |
| (F) | Female gender marker | "F" if `riders.gender === 'F'`, blank otherwise |

The spreadsheet header includes the event name, distance (km), and date (yyyy-mm-dd).

## What's included

- Only riders with `status === 'finished'` appear in the spreadsheet
- Results are sorted alphabetically by last name
- Finish times are formatted as HH:MM (seconds stripped)

## File format

The system generates an `.xlsx` file using ExcelJS. If XLSX generation fails for any reason, it falls back to a `.csv` file with the same column structure.

The file is named `ACP_Homologation_{event_name}_{date}.xlsx` (or `.csv` for the fallback).

## Implementation

- Spreadsheet generation: `lib/email/results-spreadsheet.ts`
- Email attachment logic: `lib/actions/events.ts` (`submitEventResults()`)
- Tests: `tests/unit/lib/results-spreadsheet.test.ts`

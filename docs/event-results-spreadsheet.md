# Event Results Spreadsheet (ACP Homologation)

When an admin submits results for a **brevet**, **fleche**, or **populaire** event, the system generates an ACP (Audax Club Parisien) homologation spreadsheet and attaches it to the email sent to the VP of Brevet Administration. Permanent events do not send an email.

## Format

The spreadsheet follows the ACP homologation template with a 9-column, 3-row merged header:

**Header rows (1-3):**

- Row 1: "N° Homologation" (merged A1:A3), "CLUB ORGANISATEUR" (merged B1:D1), "code ACP", "DATE", "DISTANCE", "INFORMATIONS" (merged H1:I1)
- Row 2: Club name "Randonneurs Ontario {chapter}" (merged B2:D2), event date, distance (km), "Médaille", "Sexe"
- Row 3: Column headers — "NOM", "PRENOM", "CLUB DU PARTICIPANT" (merged D3:E3), "CODE ACP", "TEMPS", "(x)", "(F)"

**Data columns (row 4+):**

| Column                   | Description                  | Source                                          |
| ------------------------ | ---------------------------- | ----------------------------------------------- |
| A: N° Homologation       | Homologation number          | Left blank                                      |
| B: NOM                   | Rider last name              | `riders.last_name`                              |
| C: PRENOM                | Rider first name             | `riders.first_name`                             |
| D-E: CLUB DU PARTICIPANT | Always "Randonneurs Ontario" | Hardcoded (merged)                              |
| F: CODE ACP              | ACP membership code          | Left blank (not tracked)                        |
| G: TEMPS                 | Finish time (Xh MM)          | `results.finish_time`                           |
| H: Medal (x)             | Medal requested              | Left blank                                      |
| I: (F)                   | Female gender marker         | "F" if `riders.gender === 'F'`, blank otherwise |

**Styling:** Arial 9pt, center-aligned, white fill, thin inner borders with medium outer frame — matching the ACP template used for manual submissions.

## What's included

- Only riders with `status === 'finished'` and a non-null finish time appear in the spreadsheet and email
- Results are sorted alphabetically by last name
- Finish times are formatted as "Xh MM" (e.g. "10h 30", "9h 01")

## File format

The system generates an `.xlsx` file using ExcelJS. If XLSX generation fails for any reason, it falls back to a `.csv` file with the same column structure.

The file is named `{yyyymmdd}-{event-name}-{distance}.xlsx` (e.g. `20250920-Warmup-200.xlsx`), or `.csv` for the fallback.

## Implementation

- Spreadsheet generation: `lib/email/results-spreadsheet.ts`
- Email attachment logic: `lib/actions/events.ts` (`submitEventResults()`)
- Tests: `tests/unit/lib/results-spreadsheet.test.ts`

# ACP calendar export

A one-off script that writes the club's brevet calendar as an .xlsx in the Audax Club Parisien calendar-form layout (sheet `Calendrier`, two header rows, 15 columns, one row per event). The VP of Brevet Administration submits it to the ACP.

## Run

```
npx tsx scripts/export-acp-calendar.ts --env-file=.env.production.local --year=2027
```

Options: `--year` (default: next calendar year), `--out=<path>` (default `acp-calendar-<year>.xlsx`), `--skip-elevation` (don't call RWGPS). Read-only against the database. Elevation needs `RWGPS_API_KEY` and `RWGPS_AUTH_TOKEN` in the env file.

## Selection rules

- `event_type = 'brevet'`, status `draft` or `scheduled`
- Date from Nov 1 of the previous year to Oct 31 of the year, inclusive (the ACP year)
- 200 km or more (the ACP only homologates 200+)
- Chapter `other` excluded (Flèche and PBP)
- A chapter with no VP in `lib/chapter-vps.ts` or no ACP code in `CHAPTER_ACP_CODES` (`lib/acp-calendar.ts`) throws an error
- Sorted by chapter (Toronto, Ottawa, Huron, Simcoe), then distance, then date

## Columns

Fixed: country `Canada`, ACP representative Peter LEISS (`vp-admin@`), club `Randonneurs Ontario`, region `Ontario`, website `https://www.randonneursontario.ca`. Town and county are blank.

Per event: ACP code (chapter club code: Toronto CA011801, Ottawa CA011802, Simcoe CA011803, Huron CA011804), organiser (chapter VP, surname uppercased), organiser email, distance (number), date (text `YYYY-MM-DD`, as in the ACP sample), elevation in metres from the RWGPS route, road map link `https://ridewithgps.com/routes/<id>`.

## Known gaps

- Town and county of departure are left blank.
- Elevation and road map link are filled only for events with a route that has an RWGPS id; a failed RWGPS fetch leaves elevation blank.
- VP names and emails live in `lib/chapter-vps.ts`, which also feeds `/contact` and `getVpEmail`.

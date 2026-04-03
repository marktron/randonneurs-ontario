# llms.txt Support

The site serves two files following the [llms.txt specification](https://llmstxt.org/) to help large language models understand the site content.

## Routes

### `/llms.txt`

A concise overview of Randonneurs Ontario with links to key pages, organized into sections:

- **Core Pages** — About, intro, first brevet guide, rules, membership, contact
- **Live Data** — Calendar, results, riders, news, routes
- **Optional** — Origins, policies, newsletters, records

### `/llms-full.txt`

Same structure but inlines the full markdown content of pages sourced from `content/pages/`:

- About (`about.md`)
- Your First Brevet (`your-first-brevet.md`)
- Rules (`rules.md`)
- Origins (`origins.md`)

Pages with hardcoded JSX content (intro, membership, contact) remain as links only.

## Implementation

Both routes are in `app/llms.txt/route.ts` and `app/llms-full.txt/route.ts`. They use `export const dynamic = 'force-static'` so content is generated at build time. The full variant reads markdown via `getPage()` from `lib/content.ts`.

## Updating

To add or remove pages from llms.txt, edit the route handler directly. If new markdown content pages are added to `content/pages/`, consider adding them to llms-full.txt as well.

# Admin-Configurable Navigation

## Problem

When an admin creates a CMS page, it gets committed to the repo and triggers a Vercel build, but there's no way to add that page to the site navigation without editing code. The navigation is hard-coded in `components/navbar.tsx`.

## Solution

Make the entire navigation data-driven via a JSON config file managed through the admin tool.

## Data Model

A new file `content/navigation.json` stores the full nav structure. The navbar component reads from this file instead of hard-coding items.

```json
{
  "items": [
    {
      "label": "About",
      "children": [
        { "label": "About Us", "href": "/about" },
        { "label": "What is Randonneuring?", "href": "/intro" },
        { "label": "Blog", "href": "https://blog.randonneursontario.ca", "external": true },
        { "label": "Club Policies", "href": "/policies" },
        { "label": "Mailing List", "href": "/mailing-list" },
        { "label": "Contact", "href": "/contact" }
      ]
    },
    {
      "label": "Routes",
      "children": [
        { "label": "{{chapter}}", "href": "/routes/{{chapter-slug}}", "template": "chapters" }
      ]
    },
    {
      "label": "Calendar",
      "children": [
        { "label": "All Chapters", "href": "/calendar" },
        { "label": "{{chapter}}", "href": "/calendar/{{chapter-slug}}", "template": "chapters" },
        { "separator": true },
        { "label": "Permanents", "href": "/calendar/permanents" },
        { "label": "Devil Week 2026", "href": "/devil-week-2026" }
      ]
    },
    {
      "label": "Results",
      "children": [
        { "label": "Chapters", "type": "heading" },
        {
          "label": "{{chapter}}",
          "href": "/results/{{season}}/{{chapter-slug}}",
          "template": "chapters"
        },
        { "separator": true },
        { "label": "Permanents", "href": "/results/{{season}}/permanent" },
        { "label": "Granite Anvil", "href": "/results/{{graniteAnvilYear}}/granite-anvil" },
        { "label": "Paris-Brest-Paris", "href": "/results/{{pbpYear}}/pbp" },
        { "separator": true },
        { "label": "Rider Directory", "href": "/riders" },
        { "label": "Records", "href": "/records" }
      ]
    },
    {
      "label": "Join the club",
      "href": "/membership",
      "style": "cta"
    }
  ]
}
```

### Item types

- **Dropdown**: Top-level item with `children` array
- **CTA button**: Top-level item with `"style": "cta"` — renders as the red button
- **Regular link**: Child with `label` and `href`
- **External link**: Child with `"external": true` — opens in new tab
- **Separator**: `{ "separator": true }` — renders as a horizontal rule
- **Heading**: `{ "type": "heading" }` — renders as a small muted label
- **Chapter template**: `{ "template": "chapters" }` — expands into one link per chapter at render time

### Template variables

These are resolved at read time, not stored literally:

- `{{season}}` — from `NEXT_PUBLIC_CURRENT_SEASON`
- `{{chapter}}` / `{{chapter-slug}}` — expanded from the chapters list
- `{{pbpYear}}` — computed from current year
- `{{graniteAnvilYear}}` — most recent Granite Anvil year

### Constraints

- One level of nesting only (top-level items can have children, but no deeper)
- Template variables are auto-resolved; admins don't edit them directly

## Admin UI

New admin route at `/admin/navigation`, visible to full admins.

### Main view

- Vertical sortable list of top-level nav items
- Each shows label, link count, and drag handles for reordering
- "Add item" button at the bottom
- "Save" button in the top-right

### Editing a top-level item

- Click to expand inline (accordion-style)
- Fields: label, optional direct href
- Style selector: "Dropdown" (default) or "CTA Button"
- Children shown as a sortable sub-list with edit/delete per child
- "Add link" button at the bottom of children

### Adding/editing a child link

- Inline form or dialog with fields:
  - Label (text)
  - URL (text, with dropdown of existing CMS pages)
  - Type: Link / External link / Separator / Heading / Chapter template
  - For chapter template: URL pattern with `{{chapter-slug}}` placeholder

### Save flow

- Same pattern as page saving: GitHub API in production, local filesystem in dev
- Commits `content/navigation.json` to the repo
- Triggers Vercel rebuild
- Audit logged

## Navbar Rendering

### Data loading

- New `getNavigation()` function in `lib/content.ts`
- Reads and parses `content/navigation.json`
- Resolves template variables and expands chapter templates
- Returns fully resolved nav items ready to render

### Component changes

- Root layout (server component) calls `getNavigation()` and passes data as a prop to `Navbar`
- `Navbar` maps over resolved items and renders appropriate components for each type
- Both desktop and mobile nav render from the same data
- Fallback: if `navigation.json` is missing or malformed, render a minimal nav (homepage link) and log an error

## Testing

- Unit tests for `getNavigation()`: parsing, template expansion, variable resolution, fallback behavior
- Unit tests for `saveNavigation()` server action: validation rules
- Component tests for Navbar rendering from nav data

## Migration

- Create initial `content/navigation.json` that exactly reproduces the current hard-coded nav
- Replace the hard-coded navbar code with data-driven rendering
- Site should look identical before and after

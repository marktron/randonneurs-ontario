## Style guide brief: Randonneurs Ontario club site redesign (Rouleur / Rapha-inspired)

### 1) Design intent

- **Tone:** premium editorial + calm utility. Feels like a magazine that also happens to run a club.
- **Keywords:** understated, precise, durable, typographic, photo-led, quietly technical.
- **North star:** long-form reading is first-class; forms/tables feel equally considered, not “admin UI”.

### 2) Layout system

- **Grid:** 12-col at lg+, 6-col at md, 4-col at sm. Strong baseline rhythm.
- **Page widths (Tailwind):**
	- Reading pages: `max-w-3xl` to `max-w-4xl` for body.
	- Article w/ media: body `max-w-3xl` + media breakout to `max-w-6xl`.
	- Data-heavy pages: `max-w-6xl` to `max-w-7xl`.
- **Spacing rhythm:** 4/8/12/16/24/32px steps (Tailwind: `space-y-4/6/8`, `py-12/16`, `gap-6/8`).
- **Breakouts:** allow images, pull quotes, and route maps to “break the column” on desktop; keep body line-length stable.

### 3) Color + surfaces

- **Palette:** mostly neutral with one restrained accent.
	- Base: near-black ink, warm off-white background, a single muted midtone for borders.
	- Accent (1): deep “club” color (red) used sparingly for links, focus, badges.
- **Surface hierarchy (3 levels):**
	1. Primary background (paper)
	2. Elevated cards/panels (subtle tint)
	3. Interactive/selected states (slightly stronger tint)
- **Borders over shadows:** prefer hairline borders (`border`, `ring-1`) and soft elevation only when necessary.

### 4) Typography

- **Pairing:** classic editorial serif for headlines + modern grotesk for UI/body.
	- Headings: Noto Serif, high contrast, tight tracking.
	- UI/body: Noto Sans, high legibility, slightly generous leading.
- **Scale (guideline):**
	- Article H1: 42–56 / tight leading
	- H2: 28–36
	- Body: 16–18 with `leading-7` / `leading-8`
	- Small/meta: 12–14 with increased tracking
- **Text conventions:**
	- Dates/distances/elevations are “data”—render in tabular numerals.
	- Overlines for taxonomy (Region / Series / Year) in small caps or tracked uppercase.

### 5) Photography + imagery

- **Photography rules:** large, confident, minimal framing chrome. Let photos do the branding.
- **Treatment:** natural color, slightly muted; avoid heavy filters.
- **Captions:** present, but quiet (small sans; subtle color).
- **Image composition templates:**
	- Full-bleed hero (desktop) + constrained body.
	- Split layout: text column + vertical image.
	- Gallery: 2–3 column masonry-like with consistent gutters (no chaotic grids).

### 6) Components (Tailwind + shadcn/ui)

Use shadcn primitives, but style them to feel “print” rather than “SaaS”.

**Editorial components**

- Article header (kicker, title, dek, meta, hero)
- Pull quote
- Callout box (route notes, “hard-won lessons”)
- Inline figure with caption
- Related stories module (3-up)

**Club/utility components**

- Event card (brevets/populaires): date, distance, start, registration status
- Registration form: step-by-step sections, calm validation, strong summary panel
- Results table: sticky header, zebra subtle, responsive row “cardification” on mobile
- Schedule view: list-first (fast scanning), optional calendar overlay later
- Badge system: status (open/closed/waitlist), series, distance

**Interaction principles**

- Default states are quiet; **focus/hover are crisp** (underline links, ring focus).
- Avoid loud animations. Use subtle transitions only (`transition-colors`, 150–200ms).

### 7) Tables, data, and dense content

- **Tables must be beautiful.** They’re a core artifact for randonneuring.
- Rules:
	- Tabular numerals for time/power-like data (`font-variant-numeric: tabular-nums`).
	- Right-align numeric columns; left-align labels.
	- Sticky header on desktop; on mobile convert rows to stacked cards with label/value pairs.
	- Provide “copyable” snippets for key fields (route link, start location, time limits).
- **Filters:** always present above dense lists (distance, date range, region, status).

### 8) Voice + microcopy (UI)

- **Style:** concise, factual, encouraging. No hype.
- **Patterns:**
	- Replace “Submit” with specific actions (“Register”, “Save details”, “Confirm entry”).
	- Validation: state what happened and what to do next (“Email is required to send confirmation.”).
	- Status language: “Registration open”, “Waitlist”, “Registration closed”.

### 9) Accessibility + quality bar

- Contrast passes WCAG AA minimum for all text.
- Visible focus rings everywhere.
- Hit targets >= 44px for primary actions.
- Motion reduced when `prefers-reduced-motion`.
- Typography: line length ~60–80 chars for articles.

### 10) Implementation notes (Tailwind + shadcn/ui)

- Define tokens in CSS variables (shadcn theme): `background/foreground`, `muted`, `border`, `ring`, `accent`.
- Add utility classes for editorial typography (Prose layer):
	- Use `@tailwindcss/typography` but **override** for tighter headings, nicer blockquotes, caption style, link underline behavior.
- Create two “modes”:
	- **Editorial**: uses `prose` + bespoke article components.
	- **Utility**: uses shadcn forms/tables with club styling and calmer density.
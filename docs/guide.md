# Admin guide

If you have an admin account on the Randonneurs Ontario site, this is your reference for how everything works.

## Getting in

Head to `/admin/login` and sign in with the email and password you were given. Once you're in, you'll see a sidebar on the left with the main navigation. Your name, email, and role are shown at the bottom of the sidebar, along with links to Settings and a Logout button.

There are three admin roles:

- **Super admin** can see everything, including admin user management. Only super admins can create, edit, or delete other admin accounts.
- **Admin** (full access) can see everything in the Management section (Pages, Audit Log) and manage all data (events, routes, results, news, riders), but cannot manage admin accounts.
- **Chapter admin** sees events, routes, results, and news, but only for their own chapter. They don't see the Management section.

## The dashboard

The dashboard (`/admin`) is your home screen. It shows:

- **Quick stats** at the top: total events, riders, routes, and results in the system.
- **Events needing attention**: a red-bordered card listing completed events that still need results. If you see events here, that's your to-do list.
- **Upcoming events**: the next five scheduled events, with date, time, and distance.

Click any event in either list to jump straight to its detail page.

## Events

### Browsing events

The Events page (`/admin/events`) shows a filterable table of all events. You can filter by season and chapter using the dropdowns at the top. If you're a chapter admin, it defaults to your chapter's events, but you can switch to "All chapters" to see everything.

Each row shows the event name, chapter, date, distance, rider count, and status badge:

| Status    | Meaning                                  |
| --------- | ---------------------------------------- |
| Scheduled | Upcoming, not yet happened               |
| Completed | Past the event date, awaiting results    |
| Submitted | Results entered and submitted to ACP/CCN |
| Cancelled | Won't happen                             |

Click any row to open the event detail page.

### Creating an event

Click "New Event" in the top right of the Events page. The form asks for:

1. **Chapter** (required): which chapter is running the event.
2. **Route** (optional): pick from existing routes. Selecting a route auto-fills the distance and name, which saves time.
3. **Event name** (required): something descriptive like "Waterloo Spring 200."
4. **Event type**: brevet, populaire, fleche, or permanent.
5. **Distance** (required): in kilometres.
6. **Date** (required): use the date picker.
7. **Start time and location**: optional but helpful for riders.
8. **Description**: optional, supports Markdown formatting.
9. **Event image**: optional photo to display with the event.

One thing to know: you can't create new brevets for the current season. This is by design. The brevet schedule is set at the start of the year and approved by ACP. You can still edit existing brevets, and you can create populaires, permanents, and fleches for any season.

### The event detail page

You'll spend most of your time here. From this page you can:

- **Edit** the event details (pencil icon).
- **Print control cards** for the event.
- **Change the event status** using the dropdown. The system won't let you mark an event as "submitted" unless it has results entered.
- **Delete** the event (with confirmation). You'll be warned if the event has registrations.
- **Email all participants** using a pre-populated mailto link.

#### Managing results

The bottom half of the event detail page is the results manager. It shows a combined list of registered riders and any results that have been entered.

For each rider, you can:

- **Set a status**: finished, DNF (did not finish), DNS (did not start), OTL (over time limit), or DQ (disqualified).
- **Enter a finish time** in HH:MM format.
- **Add a note** if needed.
- **View rider-submitted evidence**: if a rider submitted their own result, you'll see their GPX file and control card photos.

You can also add riders who didn't pre-register using the "Add Rider" button. Search by name to find them in the system.

When all results are entered, use the "Submit Results" button to finalize. This changes the event status to "submitted."

### Auto-completion

A cron job runs hourly and automatically marks events as "completed" once their date has passed. It also sends result submission emails to registered riders. You don't need to do anything for this to happen.

## Routes

The Routes page (`/admin/routes`) lists all routes across all chapters. You can filter by chapter and search by name.

### Creating a route

Click "Add Route" and fill in:

- **Name** (required): e.g., "Waterloo-Brantford-Waterloo."
- **Chapter** (required): the chapter that owns this route.
- **Distance** in kilometres.
- **Collection**: brevets, permanents, etc.
- **RWGPS ID**: if the route is on RideWithGPS, paste the route ID here and it'll link up automatically.
- **Cue sheet URL**: link to a PDF or document with turn-by-turn directions.
- **Description and notes**: Markdown-supported fields for route details.

Routes can be toggled active or inactive. Inactive routes won't show up as options when creating new events.

## Results

The Results page (`/admin/results`) is a read-only overview of all results across chapters. Filter by season and chapter. Click the eye icon on any row to jump to that event's detail page, where you can actually edit things.

In practice, you'll manage results from the event detail page. This page is more useful for scanning the season's activity at a glance.

## News

The News page (`/admin/news`) manages the announcements shown on the homepage and the `/news` page on the public site.

### Creating a news item

Click "New Item" and fill in:

- **Title** (required): the headline.
- **Teaser**: a one-line summary for the homepage card. If you leave this blank, the first few lines of the content are used instead.
- **Content**: the full text, written in Markdown. You get a live preview as you type.
- **Published toggle**: flip this on to make the item visible on the public site. You can save an item as unpublished to draft it and publish later.

### Editing and deleting

Click any news item in the list to edit it. You can update the title, content, teaser, and published status. There's a delete button if you need to remove an item entirely.

## Pages (admin-only)

Pages are standalone content pages with their own URL, like `/about` or `/policies`.

### Creating a page

Click "New Page" and provide:

- **Title**: displayed as the page heading.
- **Description**: a brief summary (used for SEO/meta tags).
- **Slug**: the URL path. A slug of `about` creates a page at `/about`.
- **Content**: written in Markdown with a live preview panel.

Pages are stored as Markdown files and rendered on the public site with the editorial typography styles.

## Admin users (super admin only)

The Admin Users page (`/admin/users`) is only accessible to super admins. This is where you create, edit, and delete admin accounts.

When creating an admin, you need their email and name, plus a role: "super admin" for full access including user management, "admin" for full data access, or "chapter admin" for chapter-scoped access. Chapter admins also need a chapter assignment, which determines what data they can see.

## Audit log (admin and super admin)

The Audit Log (`/admin/logs`) shows the 100 most recent admin actions. Every create, update, delete, and status change is recorded with a timestamp, who did it, and what changed.

The log is read-only. Nobody can modify or delete entries. If something looks wrong in the data, check here first to figure out what happened.

## Settings

Click "Settings" in the sidebar footer to manage your own account:

- **Edit your name and phone number.**
- **Set your default chapter**: this controls which chapter's data you see by default on the Events page.
- **Change your password.**
- **View your email and role** (read-only).

## Common workflows

### Start-of-season setup

1. Create or verify routes for the season.
2. Create events for each brevet on the schedule (this is typically done all at once, early in the year).
3. Add populaires and permanents as they're planned throughout the season.

### After an event

1. Check the dashboard for the "Events needing attention" card.
2. Click into the event.
3. Enter results for each rider (status and finish time).
4. Review any rider-submitted results and their evidence.
5. Click "Submit Results" when everything is entered.

### Posting news

1. Go to News, click "New Item."
2. Write the content in Markdown.
3. Toggle "Published" on when it's ready.
4. It'll appear on the homepage immediately.

### Adding a chapter admin

1. Go to Admin Users, click "Add Admin."
2. Enter their email, name, and password.
3. Set role to "Chapter Admin" and pick their chapter.
4. Share the credentials with them.

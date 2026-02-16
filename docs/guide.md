# Admin guide

If you have an admin account on the Randonneurs Ontario site, this is your reference for how everything works.

## Getting in

Head to `/admin/login` and sign in with your randonneursontario.ca email and password you were given.

The initial password for your account is `super-randonneur`, but you should change it after you log in for the first time by going to [your Settings](/admin/settings) and choosing a new password.

Once you're in, you'll see a sidebar on the left with the main navigation. Your name, email, and role are shown at the bottom of the sidebar, along with links to Settings and a Logout button.

## The dashboard

The dashboard (`/admin`) is your home screen. It shows:

- **Events needing attention**: a red-bordered card listing completed events that still need results. If you see events here, that's your to-do list.
- **Upcoming events**: the next five scheduled events for your chapter.

Click any event in either list to jump straight to its detail page.

## Events

### Browsing events

The Events page (`/admin/events`) shows a filterable table of all events. You can filter by season and chapter using the dropdowns at the top. It defaults to your home chapter's events, but you can switch to "All chapters" to see everything.

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
7. **Start time and location**: optional but helpful for riders. _Make this required_
8. **Description**: optional, supports Markdown formatting.
9. **Event image**: optional photo to display with the event.

One thing to know: you can't create new brevets for the current season. This is by design. The brevet schedule is set at the start of the year and approved by ACP. You can still edit existing brevets, and you can create populaires, permanents, and fleches for any season. If you need to add a new brevet during the season, contact Mark Allen.

### The event detail page

You'll spend most of your time here. From this page you can:

- **Edit** the event details (pencil icon).
- **Print control cards** for the event.
- **Change the event status** using the dropdown. The system won't let you mark an event as "submitted" unless it has results entered.
- **Delete** the event (with confirmation). You'll be warned if the event has registrations.
- **Email all participants** using a pre-populated mailto link, this will open in your email client with the participants on BCC and the subject prefilled with the event name.

#### Managing results

The bottom half of the event detail page is the results manager. It shows a combined list of registered riders and any results that have been entered.

For each rider, you can:

- **Set a status**: finished, DNF (did not finish), DNS (did not start), OTL (over time limit), or DQ (disqualified).
- **Enter a finish time** in HH:MM format.
- **Add a note** if needed.
- **View rider-submitted evidence**: if a rider submitted their own result, you'll see their GPX file and control card photos.

You can also add riders who didn't pre-register using the "Add Rider" button. Search by name to find them in the system. This should probably never need to be used.

When all results are entered, use the "Submit Results" button to have the system send the results to the VP of Ride Administration (you will be cc'd on the email). This changes the event status to "submitted."

### Event status auto-completion

A cron job runs hourly and automatically marks events as "completed" once the last control's closing time has passed. It also sends result submission emails to registered riders. You don't need to do anything for this to happen. If for some reason this does not automatically trigger, you can manually mark the event as "completed" to send the emails request rider results. The email will only be sent once, when the event transitions from "scheduled" to "completed".

## Routes

The Routes page (`/admin/routes`) lists all routes across all chapters. You can filter by chapter and search by name. This list was pre-populated with all the RWGPS routes in the route library on randonneursontario.ca, and historical route names from our event records.

Routes with a RWGPS route link are "active" by default, and will appear on the site. You can edit any route to change the RWGPS URL, upload a cue sheet, or link to another source for routing information.

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

## Pages

Pages are standalone content pages with their own URL, like `/about` or `/policies`.

### Creating a page

Click "New Page" and provide:

- **Title**: displayed as the page heading.
- **Description**: a brief summary (used for SEO/meta tags).
- **Slug**: the URL path. A slug of `about` creates a page at `/about`.
- **Content**: written in Markdown with a live preview panel.

Pages are stored as Markdown files and rendered on the public site with the editorial typography styles.

After you save a new page, it may take several minutes before it appears on the website.

Currently, if you want to add a page to the site's navigation, you'll need to contact Mark Allen to add the menu item. This is a trivial update though and can be done very quickly.

## Audit log

The Audit Log (`/admin/logs`) shows the 100 most recent admin actions. Every create, update, delete, and status change is recorded with a timestamp, who did it, and what changed.

The log is read-only. Nobody can modify or delete entries. If something looks wrong in the data, check here first to figure out what happened.

## Settings

Click "Settings" in the sidebar footer to manage your own account:

- **Edit your name and phone number.**
- **Set your default chapter**: this controls which chapter's data you see by default on the Events page.
- **Change your password.**
- **View your email and role** (read-only).

## How registration works

### Brevet and populaire registration

Riders register for scheduled events (brevets and populaires) through the public site at `/register/[event-slug]`. The form collects their name, email, gender (optional), emergency contact, and any notes.

When a rider submits the form, several things happen behind the scenes:

1. **Rider lookup.** The system searches for an existing rider by email. If the email isn't found but a similar name exists without an email on file, the rider is shown a matching dialog so they can link to their existing record rather than creating a duplicate.
2. **CCN membership verification.** The system checks the Cycling Canada Network (CCN) API to confirm the rider has a current-season membership. The result is cached in our database for so we don't query CCN every time.
   - If a valid membership is found (Individual, Family, or Additional Family Member), registration proceeds normally.
   - If the rider has a **Trial Membership**, the system checks whether they've already used it (one event per season). If it's already been used, registration is blocked and they're directed to upgrade at `/membership`.
   - If **no membership** is found, registration is created with an incomplete status and the rider sees an error modal directing them to `/membership` to join the club. You'll see their missing status in the admin so that you can reach out and assist if needed.
3. **Confirmation email.** A confirmation email is sent to the rider with the event details, location, and route link. If there were membership issues, the email includes a message about them. The chapter VP is CC'd on all confirmation emails.

Rider data (name, email, emergency contact) is saved to localStorage in the browser, so returning riders don't have to re-enter it every time.

### Permanent registration

Permanents work differently from scheduled events. Instead of registering for a specific event, riders go to `/register/permanent` and build their own ride:

1. **Pick a route** from the list of active permanent routes (grouped by chapter, searchable).
2. **Choose a date** (must be at least two weeks in the future).
3. **Set a start time** and optionally specify an alternate start location or ride direction (as posted or reversed).
4. Fill in the same rider info as a brevet registration.

Behind the scenes, the system creates (or reuses) an event record for that route and date combination. If another rider has already registered for the same route on the same day, they share the same event record. Membership verification and confirmation emails work the same way as brevets.

## Common workflows

### Pre-season setup

1. Create or verify routes for the season.
2. Create events for each brevet on the schedule (this is typically done all at once, late in the calendar year).
3. Add populaires and permanents as they're planned throughout the season.

### Before an event

1. Check the event page to monitor registrations and membership statuses.
2. Print out control cards.
3. Email all participants if needed.

### After an event

1. Check the dashboard for the "Events needing attention" card.
2. Click into the event.
3. Review any rider-submitted results and their evidence.
4. Enter any additional results for riders (status and finish time).
5. Click "Submit Results" when everything is entered to submit results to VP of Brevet Administration.

### Posting news

1. Go to News, click "New Item."
2. Write the content in Markdown.
3. Toggle "Published" on when it's ready.
4. It'll appear on the homepage immediately.

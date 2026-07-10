-- Ride organizer contact for the digital brevet card. The printed control card
-- takes the organizer typed in by the logged-in admin at print time; the
-- rider-facing digital card has no admin session, so the organizer is persisted
-- here and shown to riders (see docs/digital-brevet-card.md, "Ride organizer").
-- Seeded in the admin UI from the chapter's chapter_admin, then editable.

ALTER TABLE events ADD COLUMN organizer_name TEXT;
ALTER TABLE events ADD COLUMN organizer_phone TEXT;
ALTER TABLE events ADD COLUMN organizer_email TEXT;

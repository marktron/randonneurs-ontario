# Control Cards

Control cards are printed brevet cards used by riders on events. They list the control points (checkpoints) along the route with opening/closing times calculated from BRM rules.

## Generating Control Cards

Navigate to **Admin > Events > [Event] > Control Cards** to access the control card generator.

### Control Points

Control points can be added in two ways:

1. **Manual entry** — Add controls one by one with name and distance (km).
2. **Import from RWGPS** — If the event has a linked RideWithGPS route, click "Import from RWGPS" to pull in controls automatically. Controls must be marked with type "Control" as course points in the RWGPS route editor.

### Reversed Permanent Routes

When a permanent ride is registered as "reversed", the event name includes "(Reversed)". The control card generator detects this and automatically:

- **Reverses the control order** so the last control becomes the first
- **Recalculates distances** from the new starting point using the formula: `new_distance = total_distance - original_distance`
- **Swaps the default Start/Finish labels** in the initial control list

**Example:**

| Original      | Distance | Reversed      | Distance |
| ------------- | -------- | ------------- | -------- |
| Start         | 0.0 km   | Finish        | 0.0 km   |
| Georgetown    | 45.2 km  | Campbellville | 62.2 km  |
| Little Lake   | 97.7 km  | Little Lake   | 106.8 km |
| Campbellville | 142.3 km | Georgetown    | 159.3 km |
| Finish        | 204.5 km | Start         | 204.5 km |

An info note appears on the form when the route is reversed, has a custom start, or both:

- **Reversed + custom start:** "Controls are shown in reversed direction, starting from {location}."
- **Reversed only:** "Controls are shown in reversed direction."
- **Custom start only:** "Starting from {location}."

### Route Map QR Code

If the event's route has a linked RideWithGPS route (`rwgps_id`), a QR code linking to the route page is printed on the front of each control card. This gives riders quick access to the route map on their phone.

The QR code is omitted when no RWGPS route is linked.

### Organizer Details

The ride organizer's name, phone, and email are printed on each card. These are pre-filled from the logged-in admin's profile.

### Extra Blank Cards

You can add extra blank cards for day-of registrations using the "Extra blank cards" field.

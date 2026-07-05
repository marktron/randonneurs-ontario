import { formatRideName } from '@/lib/events/format'

/**
 * Escape HTML special characters to prevent injection in email templates.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export interface RegistrationEmailData {
  registrantName: string
  registrantEmail: string
  eventName: string
  eventDate: string
  eventTime: string
  eventLocation: string
  eventDistance: number
  eventType: string
  chapterName: string
  chapterSlug: string
  routeUrl?: string
  notes?: string
  membershipType?: string
  membershipStatus?: 'valid' | 'none' | 'trial-used'
  managementUrl?: string
  digitalCardUrl?: string
}

export function buildRegistrationConfirmationEmail(data: RegistrationEmailData): {
  subject: string
  text: string
  html: string
} {
  const rideName = formatRideName(data.eventName, data.eventDistance)
  const subject = `Registration Received: ${rideName}`

  // Escape user-supplied values for safe HTML interpolation
  const safe = {
    registrantName: escapeHtml(data.registrantName),
    rideName: escapeHtml(rideName),
    chapterName: escapeHtml(data.chapterName),
    eventTime: escapeHtml(data.eventTime),
    eventDate: escapeHtml(data.eventDate),
    eventLocation: escapeHtml(data.eventLocation),
    notes: data.notes ? escapeHtml(data.notes) : '(none)',
    membershipType: data.membershipType ? escapeHtml(data.membershipType) : '',
    routeUrl: data.routeUrl ? escapeHtml(data.routeUrl) : '',
    managementUrl: data.managementUrl ? escapeHtml(data.managementUrl) : '',
    digitalCardUrl: data.digitalCardUrl ? escapeHtml(data.digitalCardUrl) : '',
  }

  // Membership warning for text version
  const membershipWarningText =
    data.membershipStatus === 'none'
      ? `
⚠️ IMPORTANT: Your registration is NOT YET VALID

We could not verify your club membership. Please join Randonneurs Ontario at ${process.env.NEXT_PUBLIC_SITE_URL}/membership before the event to complete your registration.

---

`
      : data.membershipStatus === 'trial-used'
        ? `
⚠️ IMPORTANT: Your trial membership has been used

Your trial membership was used for a previous event this season. Please upgrade to a full membership at ${process.env.NEXT_PUBLIC_SITE_URL}/membership to participate in this event.

---

`
        : ''

  // Membership warning for HTML version
  const membershipWarningHtml =
    data.membershipStatus === 'none'
      ? `
  <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="color: #dc2626; font-weight: 600; margin: 0 0 8px 0;">⚠️ Your registration is NOT YET VALID</p>
    <p style="color: #7f1d1d; margin: 0;">
      We could not verify your club membership. Please
      <a href="${process.env.NEXT_PUBLIC_SITE_URL}/membership" style="color: #dc2626;">join Randonneurs Ontario</a>
      before the event to complete your registration.
    </p>
  </div>
`
      : data.membershipStatus === 'trial-used'
        ? `
  <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="color: #dc2626; font-weight: 600; margin: 0 0 8px 0;">⚠️ Trial Membership Used</p>
    <p style="color: #7f1d1d; margin: 0;">
      Your trial membership was used for a previous event. Please
      <a href="${process.env.NEXT_PUBLIC_SITE_URL}/membership" style="color: #dc2626;">upgrade to a full membership</a>
      to participate in this event.
    </p>
  </div>
`
        : ''

  // Membership type row for table (only if valid)
  const membershipTypeRow =
    data.membershipType && data.membershipStatus === 'valid'
      ? `Membership: ${data.membershipType}`
      : ''

  const membershipTypeRowHtml =
    data.membershipType && data.membershipStatus === 'valid'
      ? `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Membership</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.membershipType}</td>
    </tr>`
      : ''

  const routeRowHtml = data.routeUrl
    ? `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Route</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><a href="${safe.routeUrl}" style="color: #0066cc;">View on Ride with GPS</a></td>
    </tr>`
    : ''

  const notesSection = data.notes
    ? `Notes for the ride organizer: ${data.notes}`
    : 'Notes for the ride organizer: (none)'

  const routeSection = data.routeUrl ? `Route: ${data.routeUrl}` : ''

  const text = `
Hi ${data.registrantName},
${membershipWarningText}
Thanks for your interest in ${rideName}. We've received your registration request and we'll be following up if we need anything more.

Rider name: ${data.registrantName}
Ride: ${rideName}
${routeSection}
Chapter: ${data.chapterName}
Start time: ${data.eventTime} ${data.eventDate}
Start location: ${data.eventLocation}
${membershipTypeRow}
${notesSection}
${data.managementUrl ? `\nNew for 2026! Cancel your event registration or submit your results: ${data.managementUrl}\n` : ''}${data.digitalCardUrl ? `\nDigital brevet card — check in at controls from your phone on event day (if your organizer has enabled it): ${data.digitalCardUrl}\n` : ''}
--------------------
Brevet Rules
--------------------

- Be an active member of Randonneurs Ontario and Ontario Cycling.
- Wear a helmet.
- Wear a reflective vest 1 hour before sunset, and 1 hour after sunrise.
- Have front and rear lights solidly affixed to your bicycle.
- Have someone sign your brevet card at the controls.

Learn more about Brevets: ${process.env.NEXT_PUBLIC_SITE_URL}/intro

--------------------
What's Next?
--------------------

Don't miss any exciting Randonneuring updates by joining our mailing list or Slack.

Join the Randolist: ${process.env.NEXT_PUBLIC_RANDOLIST_URL}
Join our Slack: ${process.env.NEXT_PUBLIC_SLACK_INVITE_URL}

The ${data.chapterName} Chapter VP is included in this email. Just hit reply if you have any questions. We're always happy to help!

See you on the road,

Randonneurs Ontario
https://randonneursontario.ca
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${safe.registrantName},</p>
${membershipWarningHtml}
  <p>Thanks for your interest in <strong>${safe.rideName}</strong>. We've received your registration request and we'll be following up if we need anything more.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600; width: 180px;">Registrant</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.registrantName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Event</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.rideName}</td>
    </tr>
     ${routeRowHtml}
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Chapter</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.chapterName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Start time</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.eventTime} ${safe.eventDate}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Start location</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.eventLocation}</td>
    </tr>
    ${membershipTypeRowHtml}
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Notes for organizer</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.notes}</td>
    </tr>
  </table>
${
  data.managementUrl
    ? `
    <div style="background-color: #E5F0FA; border: 1px solid #73ABE3; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="text-align: center;">
        <strong>New for 2026!</strong> Need to cancel your event registration or submit your results?
      </p>
      <p style="text-align: center;">
        <a href="${safe.managementUrl}" style="display: inline-block; background-color: #0066cc; color: white; padding: 8px 16px; text-decoration: none; border-radius: 6px; font-weight: 600;">Manage your registration</a>
      </p>
    </div>
`
    : ''
}
${
  data.digitalCardUrl
    ? `
    <div style="background-color: #F0FAE5; border: 1px solid #A3D373; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="text-align: center;">
        <strong>Digital brevet card</strong> — check in at controls from your phone on event day (if your organizer has enabled it). Bookmark it before the start:
      </p>
      <p style="text-align: center;">
        <a href="${safe.digitalCardUrl}" style="display: inline-block; background-color: #4d7c0f; color: white; padding: 8px 16px; text-decoration: none; border-radius: 6px; font-weight: 600;">Open your brevet card</a>
      </p>
    </div>
`
    : ''
}

  <h2 style="font-size: 18px; margin-bottom: 16px;">Brevet Rules</h2>
  <ul style="padding-left: 20px; margin: 0 0 24px 0;">
    <li>Be an active member of Randonneurs Ontario and Ontario Cycling.</li>
    <li>Wear a helmet.</li>
    <li>Wear a reflective vest 1 hour before sunset, and 1 hour after sunrise.</li>
    <li>Have front and rear lights solidly affixed to your bicycle.</li>
    <li>Have someone sign your brevet card at the controls.</li>
  </ul>
  <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/intro" style="color: #0066cc;">Learn more about Brevets</a></p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">

  <h2 style="font-size: 18px; margin-bottom: 16px;">What's Next?</h2>
  <p>Don't miss any exciting Randonneuring updates by joining our mailing list or Slack.</p>
  <p>
    <a href="${process.env.NEXT_PUBLIC_RANDOLIST_URL}" style="color: #0066cc;">Join the Randolist</a><br>
    <a href="${process.env.NEXT_PUBLIC_SLACK_INVITE_URL}" style="color: #0066cc;">Join our Slack</a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">

  <p>The ${safe.chapterName} Chapter VP is included in this email. Just hit reply if you have any questions. We're always happy to help!</p>

  <p>See you on the road,</p>

  <p>
    <strong>Randonneurs Ontario</strong><br>
    <a href="https://randonneursontario.ca" style="color: #0066cc;">randonneursontario.ca</a>
  </p>
</body>
</html>
  `.trim()

  return { subject, text, html }
}

export interface ResultSubmissionEmailData {
  riderName: string
  riderEmail: string
  eventName: string
  eventDate: string
  eventDistance: number
  chapterName: string
  submissionUrl: string
  /** Reminder variant: "Reminder:" subject and intro acknowledging no results received yet */
  reminder?: boolean
}

export function buildResultSubmissionRequestEmail(data: ResultSubmissionEmailData): {
  subject: string
  text: string
  html: string
} {
  const rideName = formatRideName(data.eventName, data.eventDistance)
  const subject = data.reminder
    ? `Reminder: Submit Your Results: ${rideName}`
    : `Submit Your Results: ${rideName}`

  // Escape user-supplied values for safe HTML interpolation
  const safe = {
    riderName: escapeHtml(data.riderName),
    rideName: escapeHtml(rideName),
    eventDate: escapeHtml(data.eventDate),
    chapterName: escapeHtml(data.chapterName),
    submissionUrl: escapeHtml(data.submissionUrl),
  }

  const textIntro = data.reminder
    ? `The ${rideName} has finished, but we haven't received your results yet. Please submit them using the link below.`
    : `The ${rideName} has finished! Please submit your results using the link below.`

  const text = `
Hi ${data.riderName},

${textIntro}

Event: ${rideName}
Date: ${data.eventDate}
Chapter: ${data.chapterName}

Submit your results here:
${data.submissionUrl}

You'll need to provide:
- Your finish status (finished, DNF, DNS)
- Your finish time (if you finished)
- A link to your Strava activity or GPX file
- Photos of your control card (front and back)

This link is unique to you - please don't share it with others.

If you have any questions, please contact your chapter VP.

Thanks for riding with us!

Randonneurs Ontario
https://randonneursontario.ca
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${safe.riderName},</p>

  ${
    data.reminder
      ? `<p>The <strong>${safe.rideName}</strong> has finished, but we haven't received your results yet. Please submit them using the button below.</p>`
      : `<p>The <strong>${safe.rideName}</strong> has finished! Please submit your results using the button below.</p>`
  }

  <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600; width: 120px;">Event</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.rideName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Date</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.eventDate}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; font-weight: 600;">Chapter</td>
      <td style="padding: 8px 0;">${safe.chapterName}</td>
    </tr>
  </table>

  <p style="text-align: center; margin: 32px 0;">
    <a href="${safe.submissionUrl}" style="display: inline-block; background-color: #0066cc; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">Submit Your Results</a>
  </p>

  <p>You'll need to provide:</p>
  <ul style="padding-left: 20px; margin: 0 0 24px 0;">
    <li>Your finish status (finished, DNF, DNS)</li>
    <li>Your finish time (if you finished)</li>
    <li>A link to your Strava activity or GPX file</li>
    <li>Photos of your control card (front and back)</li>
  </ul>

  <p style="background-color: #f5f5f5; padding: 12px 16px; border-radius: 6px; font-size: 14px;">
    <strong>Note:</strong> This link is unique to you - please don't share it with others.
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">

  <p>If you have any questions, please contact your chapter VP.</p>

  <p>Thanks for riding with us!</p>

  <p>
    <strong>Randonneurs Ontario</strong><br>
    <a href="https://randonneursontario.ca" style="color: #0066cc;">randonneursontario.ca</a>
  </p>
</body>
</html>
  `.trim()

  return { subject, text, html }
}

export interface RideCompleteEmailData {
  riderName: string
  eventName: string
  eventDate: string
  eventDistance: number
  chapterName: string
  submissionUrl: string
  /** Elapsed finish time as H:MM, from check-ins or the stored result. */
  finishTime: string
  /** Reminder variant: rider finished earlier but still has no GPS track. */
  reminder?: boolean
}

/**
 * Sent when a rider completes their final digital brevet card check-in
 * (and re-used as the "still missing your track" reminder). Messaging
 * treats the GPS track as required; the system does not enforce it.
 */
export function buildRideCompleteEmail(data: RideCompleteEmailData): {
  subject: string
  text: string
  html: string
} {
  const rideName = formatRideName(data.eventName, data.eventDistance)
  const subject = data.reminder
    ? `Reminder: Add Your Ride Track: ${rideName}`
    : `Congratulations on finishing the ${rideName}!`

  const safe = {
    riderName: escapeHtml(data.riderName),
    rideName: escapeHtml(rideName),
    eventDate: escapeHtml(data.eventDate),
    chapterName: escapeHtml(data.chapterName),
    submissionUrl: escapeHtml(data.submissionUrl),
    finishTime: escapeHtml(data.finishTime),
  }

  const textIntro = data.reminder
    ? `You finished the ${rideName} on ${data.eventDate}, but we still need your GPS track to validate your ride.`
    : `Congratulations on finishing the ${rideName}! Your finish has been recorded from your digital brevet card check-ins with an elapsed time of ${data.finishTime}.`

  const text = `
Hi ${data.riderName},

${textIntro}

One thing left: once your ride has synced, add your GPS track — a link to
your Strava activity or a GPX file. It's required to validate your ride.

Add your track here:
${data.submissionUrl}

Event: ${rideName}
Date: ${data.eventDate}
Chapter: ${data.chapterName}
Recorded time: ${data.finishTime}

This link is unique to you - please don't share it with others.

If you have any questions, please contact your chapter VP.

Thanks for riding with us!

Randonneurs Ontario
https://randonneursontario.ca
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${safe.riderName},</p>

  ${
    data.reminder
      ? `<p>You finished the <strong>${safe.rideName}</strong> on ${safe.eventDate}, but we still need your GPS track to validate your ride.</p>`
      : `<p>Congratulations on finishing the <strong>${safe.rideName}</strong>! Your finish has been recorded from your digital brevet card check-ins with an elapsed time of <strong>${safe.finishTime}</strong>.</p>`
  }

  <p>One thing left: once your ride has synced, add your GPS track &mdash; a link to your Strava activity or a GPX file. It's required to validate your ride.</p>

  <p style="text-align: center; margin: 32px 0;">
    <a href="${safe.submissionUrl}" style="display: inline-block; background-color: #0066cc; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">Add Your Ride Track</a>
  </p>

  <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600; width: 140px;">Event</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.rideName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Date</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.eventDate}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Chapter</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.chapterName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; font-weight: 600;">Recorded time</td>
      <td style="padding: 8px 0;">${safe.finishTime}</td>
    </tr>
  </table>

  <p style="background-color: #f5f5f5; padding: 12px 16px; border-radius: 6px; font-size: 14px;">
    <strong>Note:</strong> This link is unique to you - please don't share it with others.
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">

  <p>If you have any questions, please contact your chapter VP.</p>

  <p>Thanks for riding with us!</p>

  <p>
    <strong>Randonneurs Ontario</strong><br>
    <a href="https://randonneursontario.ca" style="color: #0066cc;">randonneursontario.ca</a>
  </p>
</body>
</html>
  `.trim()

  return { subject, text, html }
}

// ============================================================================
// Cancellation Confirmation Email
// ============================================================================

export interface CancellationEmailData {
  registrantName: string
  registrantEmail: string
  eventName: string
  eventDate: string
  eventDistance: number
  eventType: string
  chapterName: string
  chapterSlug: string
  registerUrl: string
}

export function buildCancellationConfirmationEmail(data: CancellationEmailData): {
  subject: string
  text: string
  html: string
} {
  const rideName = formatRideName(data.eventName, data.eventDistance)
  const subject = `Registration Cancelled: ${rideName}`

  const safe = {
    registrantName: escapeHtml(data.registrantName),
    rideName: escapeHtml(rideName),
    eventDate: escapeHtml(data.eventDate),
    chapterName: escapeHtml(data.chapterName),
    registerUrl: escapeHtml(data.registerUrl),
  }

  const text = `
Hi ${data.registrantName},

Your registration for the ${rideName} has been cancelled.

Event: ${rideName}
Date: ${data.eventDate}

If you cancelled by mistake, you can re-register at:
${data.registerUrl}

If you have any questions, please contact your chapter VP.

Randonneurs Ontario
https://randonneursontario.ca
  `.trim()

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${safe.registrantName},</p>

  <p>Your registration for the <strong>${safe.rideName}</strong> has been cancelled.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600; width: 120px;">Event</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${safe.rideName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; font-weight: 600;">Date</td>
      <td style="padding: 8px 0;">${safe.eventDate}</td>
    </tr>
  </table>

  <p>If you cancelled by mistake, you can <a href="${safe.registerUrl}" style="color: #0066cc;">re-register for this event</a>.</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">

  <p>The ${safe.chapterName} Chapter VP is included in this email. Just hit reply if you have any questions.</p>

  <p>
    <strong>Randonneurs Ontario</strong><br>
    <a href="https://randonneursontario.ca" style="color: #0066cc;">randonneursontario.ca</a>
  </p>
</body>
</html>
  `.trim()

  return { subject, text, html }
}

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
  notes?: string
}

export function buildRegistrationConfirmationEmail(data: RegistrationEmailData): {
  subject: string
  text: string
  html: string
} {
  const rideName = `${data.eventName} ${data.eventDistance}`
  const subject = `Registration Received: ${rideName}`

  const notesSection = data.notes
    ? `Notes for the ride organizer: ${data.notes}`
    : 'Notes for the ride organizer: (none)'

  const text = `
Hi ${data.registrantName},

Thanks for your interest in our ${rideName}. We've received your registration request and we'll be following up if we need anything more.

Rider name: ${data.registrantName}
Ride: ${rideName}
Chapter: ${data.chapterName}
Start time: ${data.eventTime} ${data.eventDate}
Start location: ${data.eventLocation}
${notesSection}

Thanks

--------------------
Brevet Rules
--------------------

- Be an active member of Randonneurs Ontario and Ontario Cycling.
- Wear a helmet.
- Wear a reflective vest 1 hour before sunset, and 1 hour after sunrise.
- Have front and rear lights solidly affixed to your bicycle.
- Have someone sign your brevet card at the controls.

Learn more about Brevets: https://randonneursontario.ca/about

--------------------
What's Next?
--------------------

Don't miss any exciting Randonneuring updates by joining our mailing list or Slack.

Join the Randolist: https://www.randonneursontario.ca/who/Mailing_Lists.html
Join our Slack: https://join.slack.com/t/randonneursontario/shared_invite/zt-3ephj7rw1-S_KOqcTe2DMarv5kOvUxWQ

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
  <p>Hi ${data.registrantName},</p>

  <p>Thanks for your interest in our <strong>${rideName}</strong>. We've received your registration request and we'll be following up if we need anything more.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600; width: 180px;">Rider name</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.registrantName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Ride</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${rideName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Chapter</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.chapterName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Start time</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.eventTime} ${data.eventDate}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Start location</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.eventLocation}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; font-weight: 600;">Notes for organizer</td>
      <td style="padding: 8px 0;">${data.notes || '(none)'}</td>
    </tr>
  </table>

  <p>Thanks</p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">

  <h2 style="font-size: 18px; margin-bottom: 16px;">Brevet Rules</h2>
  <ul style="padding-left: 20px; margin: 0 0 24px 0;">
    <li>Be an active member of Randonneurs Ontario and Ontario Cycling.</li>
    <li>Wear a helmet.</li>
    <li>Wear a reflective vest 1 hour before sunset, and 1 hour after sunrise.</li>
    <li>Have front and rear lights solidly affixed to your bicycle.</li>
    <li>Have someone sign your brevet card at the controls.</li>
  </ul>
  <p><a href="https://randonneursontario.ca/about" style="color: #0066cc;">Learn more about Brevets</a></p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">

  <h2 style="font-size: 18px; margin-bottom: 16px;">What's Next?</h2>
  <p>Don't miss any exciting Randonneuring updates by joining our mailing list or Slack.</p>
  <p>
    <a href="https://www.randonneursontario.ca/who/Mailing_Lists.html" style="color: #0066cc;">Join the Randolist</a><br>
    <a href="https://join.slack.com/t/randonneursontario/shared_invite/zt-3ephj7rw1-S_KOqcTe2DMarv5kOvUxWQ" style="color: #0066cc;">Join our Slack</a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;">

  <p>The ${data.chapterName} Chapter VP is included in this email. Just hit reply if you have any questions. We're always happy to help!</p>

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
}

export function buildResultSubmissionRequestEmail(data: ResultSubmissionEmailData): {
  subject: string
  text: string
  html: string
} {
  const rideName = `${data.eventName} ${data.eventDistance}km`
  const subject = `Submit Your Results: ${rideName}`

  const text = `
Hi ${data.riderName},

The ${rideName} has finished! Please submit your results using the link below.

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
  <p>Hi ${data.riderName},</p>

  <p>The <strong>${rideName}</strong> has finished! Please submit your results using the button below.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600; width: 120px;">Event</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${rideName}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: 600;">Date</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${data.eventDate}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; font-weight: 600;">Chapter</td>
      <td style="padding: 8px 0;">${data.chapterName}</td>
    </tr>
  </table>

  <p style="text-align: center; margin: 32px 0;">
    <a href="${data.submissionUrl}" style="display: inline-block; background-color: #0066cc; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">Submit Your Results</a>
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

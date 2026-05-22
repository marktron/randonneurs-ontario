// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: 'https://d4b6e63820989882a9c3bf92bea953c0@o4510700580110336.ingest.us.sentry.io/4510700583321600',

  // Only send events in production
  enabled: process.env.NODE_ENV === 'production',

  // Sample 20% of traces in production to reduce costs and data volume
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Disable sending user PII (Personally Identifiable Information) to minimize data exposure
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: false,

  ignoreErrors: [
    // Bots/fuzzers requesting URLs with control chars (e.g. /%0A) crash inside
    // Next.js when it tries to write the slug into the x-next-cache-tags
    // response header. Framework bug, no user impact.
    /Invalid character in header content/,
  ],
})

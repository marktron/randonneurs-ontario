// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { serverIgnoreErrors } from '@/lib/sentry-ignore'

Sentry.init({
  dsn: 'https://d4b6e63820989882a9c3bf92bea953c0@o4510700580110336.ingest.us.sentry.io/4510700583321600',

  // Only send events in production
  enabled: process.env.NODE_ENV === 'production',

  // Sample 20% of traces in production to reduce costs and data volume
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1,

  // Sentry 11 collects request headers, cookies, bodies, user info and query
  // params by default. Keep the pre-v11 baseline (the old sendDefaultPii: false)
  // so no PII is sent. Snippet from the SDK MIGRATION.md.
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: {
      request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
    },
    httpBodies: [],
    urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    graphQL: { document: false, variables: false },
  },

  // Benign, unactionable server noise, extracted to lib/sentry-ignore.ts so it
  // can be unit tested. Sentry runs ignoreErrors in beforeSend for all events,
  // including captureRequestError ones (instrumentation.ts).
  ignoreErrors: serverIgnoreErrors,
})

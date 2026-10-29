// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { initBotId } from 'botid/client/core'
import { clientIgnoreErrors } from '@/lib/sentry-ignore'

initBotId({
  protect: [{ path: '/register/*', method: 'POST' }],
})

Sentry.init({
  dsn: 'https://d4b6e63820989882a9c3bf92bea953c0@o4510700580110336.ingest.us.sentry.io/4510700583321600',

  // Only send events in production
  enabled: process.env.NODE_ENV === 'production',

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

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

  ignoreErrors: clientIgnoreErrors,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

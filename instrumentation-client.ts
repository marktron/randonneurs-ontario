// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { initBotId } from 'botid/client/core'

initBotId({
  protect: [{ path: '/register/*', method: 'POST' }],
})

Sentry.init({
  dsn: 'https://d4b6e63820989882a9c3bf92bea953c0@o4510700580110336.ingest.us.sentry.io/4510700583321600',

  // Only send events in production
  enabled: process.env.NODE_ENV === 'production',

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Disable sending user PII (Personally Identifiable Information) to minimize data exposure
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: false,

  ignoreErrors: [
    /Invalid call to runtime\.sendMessage/,
    /Java object is gone/,
    /window\.webkit\.messageHandlers/,
    /Event `Event` \(type=error\) captured as exception/,
    /Non-Error promise rejection captured/,
    /^Load failed$/,
    /^network error$/,
    // Browser translation extensions (Chrome Translate, etc.) mutate the DOM
    // out from under React; benign and unactionable.
    /removeChild.*not a child of this node/,
    /insertBefore.*not a child of this node/,
    // Stale tabs across deploys: server action IDs change per build, so a
    // pre-deploy tab POSTs an ID the new build doesn't know. Next.js
    // self-recovers with a reload.
    /Server Action .* was not found on the server/,
  ],
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

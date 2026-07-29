import { withSentryConfig } from '@sentry/nextjs'
import { withBotId } from 'botid/next/config'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Dev-only: origins allowed to reach the dev server's /_next assets.
  // Without this, opening the app from another device (e.g. a phone via
  // Tailscale) serves HTML that never hydrates — buttons render but do
  // nothing. Covers the Mac's Tailscale IP and `tailscale serve` HTTPS.
  // NB: the wildcard matches a single label, so it must include the
  // tailnet name — '*.ts.net' does NOT match machine.tailnet.ts.net.
  allowedDevOrigins: ['100.125.20.122', '*.taild49717.ts.net'],
  experimental: {
    serverActions: {
      // Vercel caps Serverless/Fluid Compute request bodies at 4.5 MB, so
      // setting this any higher has no effect in production. Files larger than
      // this should be uploaded directly to Supabase Storage via signed URLs
      // (see lib/actions/rider-results.ts → createResultUploadUrl for the
      // pattern).
      bodySizeLimit: '4.5mb',
    },
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
  redirects: async () => [
    {
      // register.randonneursontario.ca predates the site handling more than
      // registration; www is the canonical host for SEO.
      source: '/:path*',
      has: [{ type: 'host', value: 'register.randonneursontario.ca' }],
      destination: 'https://www.randonneursontario.ca/:path*',
      permanent: true,
    },
    {
      source: '/registration',
      destination: '/calendar',
      permanent: true,
    },
    {
      source: '/who/Mailing_Lists.html',
      destination: '/mailing-list',
      permanent: true,
    },
    {
      source: '/who',
      destination: '/intro',
      permanent: true,
    },
    {
      source: '/who/:path*',
      destination: '/intro',
      permanent: true,
    },
  ],
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'Referrer-Policy',
          value: 'strict-origin-when-cross-origin',
        },
        {
          key: 'Permissions-Policy',
          // geolocation=(self) keeps third parties blocked but lets our own
          // pages use it — the digital brevet card (/card/[token]) needs GPS
          // for control check-ins. An empty allowlist would deny it site-wide.
          value: 'camera=(), microphone=(), geolocation=(self)',
        },
      ],
    },
  ],
  images: {
    remotePatterns: [
      {
        // Local Supabase storage (development)
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54321',
        pathname: '/storage/v1/object/public/**',
      },
      {
        // Supabase storage (production)
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default withSentryConfig(withBotId(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: 'randonneurs-ontario',

  project: 'javascript-nextjs',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
})

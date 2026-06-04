/**
 * Side-effect module that loads environment variables from dotenv files.
 *
 * Import this FIRST (before any module that reads env vars at import time, e.g.
 * lib/email/ses.ts which freezes `fromEmail` from SES_FROM_EMAIL on load).
 * Bundlers (esbuild/tsx) hoist `import` statements above other top-level code,
 * so dotenv must run from within an imported module to be guaranteed early —
 * inline `config()` calls in the entry file run too late.
 *
 * If `--env-file=<path>` is given, load ONLY that file — the operator asked for
 * a specific environment, so the local dev files (which may carry e.g.
 * SES_OVERRIDE_RECIPIENT) must not bleed in. With no `--env-file`, load the
 * local dev env files for local/dry-run use.
 */
import { config } from 'dotenv'
import { join } from 'path'

const envFileArg = process.argv.slice(2).find((a) => a.startsWith('--env-file='))
if (envFileArg) {
  config({ path: join(process.cwd(), envFileArg.split('=')[1]) })
} else {
  config({ path: join(process.cwd(), '.env.development.local') })
  config({ path: join(process.cwd(), '.env.local') })
}

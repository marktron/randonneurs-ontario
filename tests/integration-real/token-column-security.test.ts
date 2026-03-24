import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getTestSupabase } from './helpers/supabase'

/** Anon client — uses the public anon key, no elevated privileges. */
function getAnonSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('[integration-real] Missing SUPABASE env vars. Is local Supabase running?')
  }
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

describe('capability token column security', () => {
  const admin = getTestSupabase()
  const anon = getAnonSupabase()

  it('anon cannot read management_token from registrations', async () => {
    // Attempt to select management_token directly from the base table
    const { data, error } = await anon.from('registrations').select('management_token').limit(1)

    // Should either error (permission denied) or return no column
    const hasToken = data?.some(
      (row: Record<string, unknown>) => row.management_token !== undefined
    )
    expect(error !== null || !hasToken).toBe(true)
  })

  it('anon cannot read submission_token from results', async () => {
    // Attempt to select submission_token directly from the base table
    const { data, error } = await anon.from('results').select('submission_token').limit(1)

    // Should either error (permission denied) or return no column
    const hasToken = data?.some(
      (row: Record<string, unknown>) => row.submission_token !== undefined
    )
    expect(error !== null || !hasToken).toBe(true)
  })

  it('admin (service role) can still read management_token', async () => {
    const { error } = await admin.from('registrations').select('management_token').limit(1)

    expect(error).toBeNull()
  })

  it('admin (service role) can still read submission_token', async () => {
    const { error } = await admin.from('results').select('submission_token').limit(1)

    expect(error).toBeNull()
  })

  it('anon can read non-token columns from public_registrations view', async () => {
    const { data, error } = await anon
      .from('public_registrations')
      .select('id, event_id, status')
      .limit(1)

    expect(error).toBeNull()
    expect(data).toBeDefined()
  })

  it('anon can read non-token columns from results', async () => {
    const { data, error } = await anon
      .from('results')
      .select('id, event_id, status, finish_time')
      .limit(1)

    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
})

import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getTestSupabase } from './helpers/supabase'

const BUCKET = 'rider-submissions'

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

describe('rider-submissions bucket policies', () => {
  const admin = getTestSupabase()
  const anon = getAnonSupabase()

  it('allows public read access', async () => {
    const { data, error } = await anon.storage.from(BUCKET).list('', { limit: 1 })
    // Should succeed (even if empty) — no auth required for reads
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })

  it('rejects anonymous uploads', async () => {
    const file = new Blob(['test'], { type: 'text/xml' })
    const { error } = await anon.storage.from(BUCKET).upload('_policy-test/anon-upload.xml', file)

    expect(error).not.toBeNull()
  })

  it('allows uploads via service-role client', async () => {
    const path = '_policy-test/service-role-upload.xml'
    const file = new Blob(['<gpx/>'], { type: 'text/xml' })

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true })
    expect(uploadError).toBeNull()

    // Clean up
    const { error: deleteError } = await admin.storage.from(BUCKET).remove([path])
    expect(deleteError).toBeNull()
  })
})

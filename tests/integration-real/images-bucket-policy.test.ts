import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getTestSupabase } from './helpers/supabase'

const BUCKET = 'images'

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

describe('images bucket policies', () => {
  const admin = getTestSupabase()
  const anon = getAnonSupabase()

  it('allows public read access', async () => {
    const { data, error } = await anon.storage.from(BUCKET).list('', { limit: 1 })
    // Should succeed (even if empty) — no auth required for reads
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })

  it('rejects anonymous uploads', async () => {
    const file = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
    const { error } = await anon.storage.from(BUCKET).upload('_policy-test/anon-upload.png', file)

    expect(error).not.toBeNull()
  })

  it('rejects anonymous inserts into the images metadata table', async () => {
    const { error } = await anon.from('images').insert({
      storage_path: '_policy-test/anon-metadata.png',
      filename: 'anon-metadata.png',
      content_type: 'image/png',
      size_bytes: 4,
    })

    expect(error).not.toBeNull()
  })

  // The original policy was `auth.role() = 'authenticated'`, so a freshly
  // signed-up user (not an admin) could upload arbitrary files to the
  // public-read CDN bucket. Verify the policy is gone by signing up a user
  // and attempting an upload with their session.
  it('rejects uploads from a freshly signed-up authenticated user', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const authed = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const email = `policy-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
    const { data: signUpData, error: signUpError } = await authed.auth.signUp({
      email,
      password: 'policy-test-password-123!',
    })
    expect(signUpError).toBeNull()
    expect(signUpData.session).not.toBeNull()

    try {
      const file = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
      const { error: uploadError } = await authed.storage
        .from(BUCKET)
        .upload('_policy-test/authed-upload.png', file)
      expect(uploadError).not.toBeNull()

      const { error: metadataError } = await authed.from('images').insert({
        storage_path: '_policy-test/authed-metadata.png',
        filename: 'authed-metadata.png',
        content_type: 'image/png',
        size_bytes: 4,
      })
      expect(metadataError).not.toBeNull()
    } finally {
      // Clean up the test user via the service-role client
      if (signUpData.user) {
        await admin.auth.admin.deleteUser(signUpData.user.id)
      }
    }
  })

  it('allows uploads via service-role client', async () => {
    const path = '_policy-test/service-role-upload.png'
    const file = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true })
    expect(uploadError).toBeNull()

    // Clean up
    const { error: deleteError } = await admin.storage.from(BUCKET).remove([path])
    expect(deleteError).toBeNull()
  })
})

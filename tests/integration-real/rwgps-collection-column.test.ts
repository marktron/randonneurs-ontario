import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getTestSupabase } from './helpers/supabase'

// routes.rwgps_collection_id and routes.rwgps_id are mutually exclusive:
// a route embeds either a single RWGPS route or a collection of routes,
// never both (routes_rwgps_ref_exclusive CHECK constraint).

const TEST_SLUG = 'test-rwgps-collection-column'

async function deleteBySlug(supabase: ReturnType<typeof getTestSupabase>) {
  await supabase.from('routes').delete().eq('slug', TEST_SLUG)
}

describe('routes.rwgps_collection_id', () => {
  const supabase = getTestSupabase()

  beforeEach(async () => {
    await deleteBySlug(supabase)
  })

  afterEach(async () => {
    await deleteBySlug(supabase)
  })

  it('accepts a route with only rwgps_collection_id set', async () => {
    const { error } = await supabase.from('routes').insert({
      name: 'RWGPS Collection Test',
      slug: TEST_SLUG,
      rwgps_id: null,
      rwgps_collection_id: '8387874',
    })
    expect(error).toBeNull()
  })

  it('rejects a route with both rwgps_id and rwgps_collection_id set', async () => {
    const { error } = await supabase.from('routes').insert({
      name: 'RWGPS Collection Test',
      slug: TEST_SLUG,
      rwgps_id: '12345678',
      rwgps_collection_id: '8387874',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('routes_rwgps_ref_exclusive')
  })
})

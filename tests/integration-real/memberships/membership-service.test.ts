import { describe, it, expect } from 'vitest'
import { getTestSupabase } from '../helpers/supabase'

describe('integration-real infrastructure', () => {
  it('can connect to local Supabase', async () => {
    const supabase = getTestSupabase()
    const { data, error } = await supabase.from('riders').select('id').limit(1)
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
})

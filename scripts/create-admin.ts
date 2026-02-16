/**
 * Bootstrap script to create the first admin user
 * Usage: ADMIN_EMAIL=x ADMIN_PASSWORD=x ADMIN_NAME=x npx tsx scripts/create-admin.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD
const name = process.env.ADMIN_NAME

if (!email || !password || !name) {
  console.error(
    'Usage: ADMIN_EMAIL=x ADMIN_PASSWORD=x ADMIN_NAME=x npx tsx scripts/create-admin.ts'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function createAdmin() {
  console.log(`Creating admin user: ${email}`)

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    console.error('Error creating auth user:', authError?.message)
    process.exit(1)
  }

  console.log(`Auth user created: ${authData.user.id}`)

  // Create admin record
  const { error: adminError } = await supabase.from('admins').insert({
    id: authData.user.id,
    email,
    name,
    role: 'super_admin',
  })

  if (adminError) {
    console.error('Error creating admin record:', adminError.message)
    // Rollback
    await supabase.auth.admin.deleteUser(authData.user.id)
    process.exit(1)
  }

  console.log('Admin user created successfully!')
}

createAdmin()

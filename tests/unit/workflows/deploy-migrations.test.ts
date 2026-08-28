import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('deploy-migrations.yml', () => {
  const workflowPath = path.join(process.cwd(), '.github/workflows/deploy-migrations.yml')
  const workflowContent = fs.readFileSync(workflowPath, 'utf-8')

  it('triggers on push to main filtered to supabase/migrations/**', () => {
    // Assert the push trigger with branches and paths filters exist
    expect(workflowContent).toMatch(/on:\s+push:\s+branches:\s+\[main\]/)
    expect(workflowContent).toMatch(/paths:\s*\n\s*-\s*'supabase\/migrations\/\*\*'/)
  })

  it('triggers on workflow_dispatch', () => {
    expect(workflowContent).toMatch(/workflow_dispatch/)
  })

  it('concurrency group is deploy-migrations with cancel-in-progress: false', () => {
    // This is critical: cancel-in-progress: true would abort db push mid-migration,
    // unlike ci.yml which uses true for tests (which can be safely interrupted).
    expect(workflowContent).toMatch(/concurrency:\s+group:\s+deploy-migrations/)
    expect(workflowContent).toMatch(/cancel-in-progress:\s+false/)
  })

  it('supabase/setup-cli version pin matches package.json supabase devDependency', () => {
    const packageJsonPath = path.join(process.cwd(), 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    const supabaseVersion = packageJson.devDependencies.supabase

    // Strip leading ^ or ~ to get the minimum version
    const minVersion = supabaseVersion.replace(/^[\^~]/, '')

    // Assert the workflow uses this exact version
    expect(workflowContent).toMatch(new RegExp(`version:\\s+${minVersion.replace(/\./g, '\\.')}`))
  })

  it('push step invokes supabase db push with --project-ref, --password, and --yes', () => {
    expect(workflowContent).toMatch(/supabase db push/)
    expect(workflowContent).toMatch(/--project-ref/)
    expect(workflowContent).toMatch(/--password/)
    expect(workflowContent).toMatch(/--yes/)
  })

  it('permissions is exactly { contents: read }', () => {
    expect(workflowContent).toMatch(/permissions:\s+contents:\s+read/)
    // Ensure no other permissions are granted
    expect(workflowContent).not.toMatch(/permissions:[\s\S]*?[a-z-]+:\s+write/)
  })
})

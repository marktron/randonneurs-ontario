'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/get-admin'
import { logAuditEvent } from '@/lib/audit-log'
import { handleActionError, createActionResult, logError } from '@/lib/errors'
import type { NavigationConfigRaw } from '@/types/navigation'

interface SaveNavigationResult {
  success: boolean
  error?: string
}

function validateNavigation(config: NavigationConfigRaw): string | null {
  if (!config.items || config.items.length === 0) {
    return 'Navigation must have at least one item'
  }

  for (const item of config.items) {
    if (!item.label?.trim()) {
      return 'Every top-level item must have a label'
    }

    if (item.children) {
      for (const child of item.children) {
        // Separators, headings, and template items are exempt from href requirement
        if (child.separator || child.type === 'heading' || child.template) continue
        if (!child.label?.trim()) return 'Every link must have a label'
        if (!child.href?.trim()) return 'Every link must have an href'
      }
    }
  }

  return null
}

export async function saveNavigation(config: NavigationConfigRaw): Promise<SaveNavigationResult> {
  // Verify admin access
  const admin = await requireAdmin()

  // Validate input
  const validationError = validateNavigation(config)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const fileContent = JSON.stringify(config, null, 2) + '\n'

  // In development, always save locally
  if (process.env.NODE_ENV === 'development') {
    return saveLocalFile(fileContent, admin.id)
  }

  // Check for required environment variables
  const githubToken = process.env.GITHUB_TOKEN
  const githubRepo = process.env.GITHUB_REPO

  if (!githubToken || !githubRepo) {
    return { success: false, error: 'GitHub integration not configured' }
  }

  // Save via GitHub API
  try {
    const filePath = 'content/navigation.json'
    const [owner, repo] = githubRepo.split('/')

    // Get the current file (if it exists) to get its SHA
    const getResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    let sha: string | undefined
    if (getResponse.ok) {
      const data = await getResponse.json()
      sha = data.sha
    }

    // Create or update the file
    const putResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Update navigation',
          content: Buffer.from(fileContent).toString('base64'),
          sha,
        }),
      }
    )

    if (!putResponse.ok) {
      const error = await putResponse.json()
      logError(error, { operation: 'saveNavigation.github' })
      return { success: false, error: 'Failed to save to GitHub' }
    }

    revalidatePath('/', 'layout')

    await logAuditEvent({
      adminId: admin.id,
      actorLabel: admin.name,
      action: 'update',
      entityType: 'navigation',
      entityId: 'navigation',
      description: 'Updated site navigation',
    })

    return createActionResult()
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'saveNavigation' },
      'An error occurred while saving'
    )
  }
}

// For local development without GitHub
async function saveLocalFile(content: string, adminId: string): Promise<SaveNavigationResult> {
  try {
    const fs = await import('fs/promises')
    const path = await import('path')

    const filePath = path.join(process.cwd(), 'content/navigation.json')
    await fs.writeFile(filePath, content, 'utf-8')

    revalidatePath('/', 'layout')

    await logAuditEvent({
      adminId,
      action: 'update',
      entityType: 'navigation',
      entityId: 'navigation',
      description: 'Updated site navigation',
    })

    return createActionResult()
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'saveNavigation.local' },
      'Failed to save file locally'
    )
  }
}

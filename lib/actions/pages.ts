'use server'

import fs from 'fs'
import path from 'path'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/get-admin'
import { handleActionError, createActionResult, logError } from '@/lib/errors'

interface SavePageInput {
  slug: string
  title: string
  description: string
  content: string
  headerImage?: string
}

interface SavePageResult {
  success: boolean
  error?: string
}

// Get reserved slugs dynamically from app directory
function getReservedSlugs(): string[] {
  try {
    const appDir = path.join(process.cwd(), 'app')

    return fs
      .readdirSync(appDir, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && !entry.name.startsWith('[') && !entry.name.startsWith('_')
      )
      .map((entry) => entry.name)
  } catch {
    // Fallback if filesystem read fails (e.g., in some production environments)
    return [
      'about',
      'admin',
      'calendar',
      'contact',
      'intro',
      'mailing-list',
      'membership',
      'policies',
      'register',
      'results',
      'riders',
      'routes',
    ]
  }
}

export async function savePage(input: SavePageInput): Promise<SavePageResult> {
  // Verify admin access
  await requireAdmin()

  const { slug, title, description, content, headerImage } = input

  // Validate input
  if (!slug || !title) {
    return { success: false, error: 'Slug and title are required' }
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return {
      success: false,
      error: 'Slug can only contain lowercase letters, numbers, and hyphens',
    }
  }

  // Check for reserved slugs (existing routes)
  const reservedSlugs = getReservedSlugs()
  if (reservedSlugs.includes(slug)) {
    return { success: false, error: `"${slug}" is reserved and cannot be used as a page slug` }
  }

  // Build markdown file content with frontmatter
  const today = new Date().toISOString().split('T')[0]
  const headerImageLine = headerImage ? `headerImage: ${headerImage}\n` : ''
  const fileContent = `---
title: ${title}
slug: ${slug}
description: ${description}
${headerImageLine}lastUpdated: ${today}
---

${content}
`

  // In development, always save locally (getPage reads from local filesystem)
  if (process.env.NODE_ENV === 'development') {
    return saveLocalFile(slug, fileContent)
  }

  // Check for required environment variables
  const githubToken = process.env.GITHUB_TOKEN
  const githubRepo = process.env.GITHUB_REPO

  if (!githubToken || !githubRepo) {
    return { success: false, error: 'GitHub integration not configured' }
  }

  // Save via GitHub API
  try {
    const filePath = `content/pages/${slug}.md`
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
          message: `Update ${slug} page`,
          content: Buffer.from(fileContent).toString('base64'),
          sha,
        }),
      }
    )

    if (!putResponse.ok) {
      const error = await putResponse.json()
      logError(error, { operation: 'savePage.github', context: { slug } })
      return { success: false, error: 'Failed to save to GitHub' }
    }

    // Revalidate cached pages
    revalidatePath('/admin/pages')
    revalidatePath(`/admin/pages/${slug}`)
    revalidatePath(`/${slug}`)

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'savePage' }, 'An error occurred while saving')
  }
}

// For local development without GitHub
async function saveLocalFile(slug: string, content: string): Promise<SavePageResult> {
  try {
    const fs = await import('fs/promises')
    const path = await import('path')

    const filePath = path.join(process.cwd(), 'content/pages', `${slug}.md`)
    await fs.writeFile(filePath, content, 'utf-8')

    // Revalidate cached pages
    revalidatePath('/admin/pages')
    revalidatePath(`/admin/pages/${slug}`)
    revalidatePath(`/${slug}`)

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'saveLocalFile' }, 'Failed to save file locally')
  }
}

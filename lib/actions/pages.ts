"use server"

import { requireAdmin } from "@/lib/auth/get-admin"

interface SavePageInput {
  slug: string
  title: string
  description: string
  content: string
}

interface SavePageResult {
  success: boolean
  error?: string
}

export async function savePage(input: SavePageInput): Promise<SavePageResult> {
  // Verify admin access
  await requireAdmin()

  const { slug, title, description, content } = input

  // Validate input
  if (!slug || !title) {
    return { success: false, error: "Slug and title are required" }
  }

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { success: false, error: "Slug can only contain lowercase letters, numbers, and hyphens" }
  }

  // Build markdown file content with frontmatter
  const today = new Date().toISOString().split("T")[0]
  const fileContent = `---
title: ${title}
slug: ${slug}
description: ${description}
lastUpdated: ${today}
---

${content}
`

  // Check for required environment variables
  const githubToken = process.env.GITHUB_TOKEN
  const githubRepo = process.env.GITHUB_REPO

  if (!githubToken || !githubRepo) {
    // Fallback: save locally in development
    if (process.env.NODE_ENV === "development") {
      return saveLocalFile(slug, fileContent)
    }
    return { success: false, error: "GitHub integration not configured" }
  }

  // Save via GitHub API
  try {
    const filePath = `content/pages/${slug}.md`
    const [owner, repo] = githubRepo.split("/")

    // Get the current file (if it exists) to get its SHA
    const getResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
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
        method: "PUT",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Update ${slug} page`,
          content: Buffer.from(fileContent).toString("base64"),
          sha,
        }),
      }
    )

    if (!putResponse.ok) {
      const error = await putResponse.json()
      console.error("GitHub API error:", error)
      return { success: false, error: "Failed to save to GitHub" }
    }

    return { success: true }
  } catch (error) {
    console.error("Error saving page:", error)
    return { success: false, error: "An error occurred while saving" }
  }
}

// For local development without GitHub
async function saveLocalFile(slug: string, content: string): Promise<SavePageResult> {
  try {
    const fs = await import("fs/promises")
    const path = await import("path")

    const filePath = path.join(process.cwd(), "content/pages", `${slug}.md`)
    await fs.writeFile(filePath, content, "utf-8")

    return { success: true }
  } catch (error) {
    console.error("Error saving local file:", error)
    return { success: false, error: "Failed to save file locally" }
  }
}

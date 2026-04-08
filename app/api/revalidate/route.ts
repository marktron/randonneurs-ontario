import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

/**
 * On-demand cache revalidation endpoint.
 *
 * POST /api/revalidate
 * Authorization: Bearer <REVALIDATE_SECRET>
 *
 * Body (specific tags):  { "tags": ["events", "results"] }
 * Body (everything):     { "all": true }
 */

const ALL_TAGS = [
  'events',
  'permanents',
  'registrations',
  'results',
  'riders',
  'records',
  'routes',
  'news',
  'chapters',
  'slugs',
] as const

type CacheTag = (typeof ALL_TAGS)[number]

const validTags = new Set<string>(ALL_TAGS)

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  let tagsToRevalidate: CacheTag[]

  if (body.all === true) {
    tagsToRevalidate = [...ALL_TAGS]
  } else if (Array.isArray(body.tags) && body.tags.length > 0) {
    const invalidTags = body.tags.filter((t: string) => !validTags.has(t))
    if (invalidTags.length > 0) {
      return NextResponse.json({ error: 'Invalid tags', invalidTags }, { status: 400 })
    }
    tagsToRevalidate = body.tags
  } else {
    return NextResponse.json(
      { error: 'Provide { "tags": [...] } or { "all": true }' },
      { status: 400 }
    )
  }

  for (const tag of tagsToRevalidate) {
    // { expire: 0 } forces immediate path revalidation in Next.js 16.
    // Passing a named profile like 'max' would only schedule a lazy background
    // refresh — the 'max' profile is 30-day revalidate, 1-year expire.
    revalidateTag(tag, { expire: 0 })
  }

  return NextResponse.json({
    revalidated: tagsToRevalidate,
  })
}

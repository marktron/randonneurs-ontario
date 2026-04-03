import { getPage } from '@/lib/content'

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://randonneursontario.ca'

export const dynamic = 'force-static'

export function GET() {
  const about = getPage('about')
  const firstBrevet = getPage('your-first-brevet')
  const rules = getPage('rules')
  const origins = getPage('origins')

  const content = `# Randonneurs Ontario

> Randonneurs Ontario is the provincial organization for non-competitive long-distance cycling (randonneuring) in Ontario, Canada. Affiliated with Audax Club Parisien and Randonneurs Mondiaux.

Randonneuring is long-distance cycling where riders follow a prescribed course and must complete it within a time limit. Events range from 200 km brevets to 1200 km grand randonnées. Riders are self-sufficient and must check in at controls along the route. The organization has four regional chapters: Toronto, Ottawa, Huron, and Simcoe.

## About Randonneurs Ontario

Source: ${baseUrl}/about

${about?.content ?? 'Content unavailable.'}

## Your First Brevet

Source: ${baseUrl}/your-first-brevet

${firstBrevet?.content ?? 'Content unavailable.'}

## Rules and Regulations

Source: ${baseUrl}/rules

${rules?.content ?? 'Content unavailable.'}

## Origins

Source: ${baseUrl}/origins

${origins?.content ?? 'Content unavailable.'}

## Additional Pages

- [What is Randonneuring?](${baseUrl}/intro): Comprehensive guide to the sport — brevets, myths vs reality, distance ladder, history
- [Membership](${baseUrl}/membership): Membership tiers (Trial, Individual, Family) and how to join
- [Contact](${baseUrl}/contact): Board members, chapter contacts, and mailing address
- [Event Calendar](${baseUrl}/calendar): Upcoming brevets and populaires across all chapters
- [Results](${baseUrl}/results): Season results by chapter, rider completions
- [Rider Directory](${baseUrl}/riders): Directory of registered randonneurs
- [News](${baseUrl}/news): Club announcements and updates
- [Routes](${baseUrl}/routes/toronto): Chapter route directories with GPS tracks and cue sheets

## Optional

- [Policies](${baseUrl}/policies): Official club documents — bylaws, BRM rules, code of conduct, privacy policy
- [Newsletter Archive](${baseUrl}/newsletters): "The Long Road" newsletters from 2004–2012
- [Records](${baseUrl}/records): Club distance and speed records
`

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

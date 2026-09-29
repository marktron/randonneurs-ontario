import Link from 'next/link'
import { MessageSquareText } from 'lucide-react'

/**
 * Plain-href sitemap rendered on every page.
 *
 * The navbar's links live inside Radix `NavigationMenuContent` (desktop) and a
 * `Sheet` (mobile), neither of which mounts its children until the user opens
 * it -- so those hrefs never appear in the server HTML. These footer links are
 * the crawlable path to every main section of the site.
 *
 * Links marked `external` open in a new tab. Built by a function so the
 * optional Slack invite URL is read at render time, not module load.
 */
type FooterLink = { label: string; href: string; external?: boolean }

function getFooterSections(): { title: string; links: FooterLink[] }[] {
  const slackInviteUrl = process.env.NEXT_PUBLIC_SLACK_INVITE_URL
  return [
    {
      title: 'Ride',
      links: [
        { label: 'Calendar', href: '/calendar' },
        { label: 'Routes', href: '/routes' },
        { label: 'Permanents', href: '/calendar/permanents' },
        { label: 'Register a Permanent', href: '/register/permanent' },
        { label: 'Live Tracking', href: '/live-tracking' },
      ],
    },
    {
      title: 'Results',
      links: [
        { label: 'Results', href: '/results' },
        { label: 'Rider Directory', href: '/riders' },
        { label: 'Records', href: '/records' },
        { label: 'Awards', href: '/awards' },
      ],
    },
    {
      title: 'Club',
      links: [
        { label: 'About Us', href: '/about' },
        { label: 'What is Randonneuring?', href: '/intro' },
        { label: 'Membership', href: '/membership' },
        { label: 'Contact', href: '/contact' },
        { label: 'Club Policies', href: '/policies' },
        { label: 'News', href: '/news' },
      ],
    },
    {
      title: 'Community',
      links: [
        { label: 'Blog', href: 'https://blog.randonneursontario.ca', external: true },
        { label: 'Mailing List', href: '/mailing-list' },
        ...(slackInviteUrl ? [{ label: 'Slack', href: slackInviteUrl, external: true }] : []),
        {
          label: 'Facebook Group',
          href: 'https://www.facebook.com/groups/randonneursontario',
          external: true,
        },
        { label: 'Strava Club', href: 'https://www.strava.com/clubs/6774', external: true },
        {
          label: 'Ride with GPS Club',
          href: 'https://ridewithgps.com/clubs/1406-randonneurs-ontario/home',
          external: true,
        },
      ],
    },
  ]
}

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-muted/30 print:hidden">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Site sections */}
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4 lg:max-w-4xl"
        >
          {getFooterSections().map((section) => (
            <div key={section.title}>
              <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {section.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-12 flex flex-col items-center gap-6 border-t border-border pt-8 sm:flex-row sm:justify-between">
          {/* Copyright */}
          <div className="text-sm text-muted-foreground">
            <p>&copy; {currentYear} Randonneurs Ontario. All rights reserved.</p>
          </div>

          {/* Feedback */}
          <div className="flex items-center gap-4">
            <Link
              href="https://forms.gle/D342cLDardMFnxwY9"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-sm font-medium text-accent hover:bg-accent/10 transition-colors"
            >
              <MessageSquareText className="h-4 w-4" />
              Feedback
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

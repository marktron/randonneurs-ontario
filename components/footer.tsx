import Link from 'next/link'
import { MessageSquareText } from 'lucide-react'
import { siFacebook, siStrava } from 'simple-icons'

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d={siFacebook.path} />
    </svg>
  )
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.52 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.124a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.52v-2.523h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  )
}

function StravaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d={siStrava.path} />
    </svg>
  )
}

/**
 * Plain-href sitemap rendered on every page.
 *
 * The navbar's links live inside Radix `NavigationMenuContent` (desktop) and a
 * `Sheet` (mobile), neither of which mounts its children until the user opens
 * it -- so those hrefs never appear in the server HTML. These footer links are
 * the crawlable path to every main section of the site.
 */
const footerSections: { title: string; links: { label: string; href: string }[] }[] = [
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
      { label: 'Mailing List', href: '/mailing-list' },
    ],
  },
]

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Site sections */}
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:max-w-3xl"
        >
          {footerSections.map((section) => (
            <div key={section.title}>
              <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {section.title}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
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

          {/* Links */}
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
            {process.env.NEXT_PUBLIC_SLACK_INVITE_URL && (
              <Link
                href={process.env.NEXT_PUBLIC_SLACK_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Slack"
              >
                <SlackIcon className="h-5 w-5" />
              </Link>
            )}
            <Link
              href="https://www.facebook.com/groups/randonneursontario"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Facebook"
            >
              <FacebookIcon className="h-5 w-5" />
            </Link>
            <Link
              href="https://www.strava.com/clubs/6774"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Strava"
            >
              <StravaIcon className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

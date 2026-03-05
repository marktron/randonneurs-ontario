import Link from 'next/link'
import { PageShell } from '@/components/page-shell'

export const metadata = {
  title: 'Contact',
  description: 'Contact the Randonneurs Ontario board of directors and chapter vice-presidents.',
}

const contacts = [
  { role: 'President', name: "Tim O'Callahan", email: 'president@randonneursontario.ca' },
  { role: 'Secretary', name: 'Martin Cooper', email: 'secretary@randonneursontario.ca' },
  { role: 'Treasurer', name: 'Dave Thompson', email: 'treasurer@randonneursontario.ca' },
  {
    role: 'VP, Brevet Administration',
    name: 'Peter Leiss',
    email: 'vp-admin@randonneursontario.ca',
  },
  { role: 'VP, Huron', name: 'Fred Chagnon', email: 'vp-huron@randonneursontario.ca' },
  { role: 'VP, Ottawa', name: 'Charles Major', email: 'vp-ottawa@randonneursontario.ca' },
  { role: 'VP, Simcoe - Muskoka', name: 'Dave Thompson', email: 'vp-simcoe@randonneursontario.ca' },
  { role: 'VP, Toronto', name: 'Mark Allen', email: 'vp-toronto@randonneursontario.ca' },
  {
    role: 'Member-at-large, Huron',
    name: 'Brenda Wiechers-Maxwell',
    email: 'director1@randonneursontario.ca',
  },
  {
    role: 'Member-at-large, Ottawa',
    name: 'Bojana Kolbah',
    email: 'director2@randonneursontario.ca',
  },
  {
    role: 'Member-at-large, Toronto',
    name: 'David Cole',
    email: 'director4@randonneursontario.ca',
  },
  {
    role: 'Member-at-large, Toronto',
    name: 'Tiago Varella-Cid',
    email: 'director5@randonneursontario.ca',
  },
  {
    role: 'Member-at-large, Toronto',
    name: 'Bob Macleod',
    email: 'director3@randonneursontario.ca',
  },
  { role: 'Social Media', name: 'Marc Deshaies', email: 'editor@randonneursontario.ca' },
  {
    role: 'Director of Communications',
    name: 'Vytas Janusauskas',
    email: 'webmaster@randonneursontario.ca',
  },
]

export default function ContactPage() {
  return (
    <PageShell>
      {/* Header */}
      <div className="content-container py-20 md:py-28">
        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight">Contact</h1>
        <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
          Randonneurs Ontario is led by a volunteer board of directors. Reach out to any of us with
          questions about randonneuring in the province.
        </p>
      </div>

      {/* Contacts Grid */}
      <div className="content-container pb-20 md:pb-28">
        <div className="grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {contacts.map((contact) => (
            <div key={contact.email}>
              <p className="text-sm text-muted-foreground">{contact.role}</p>
              <p className="mt-1 font-medium">{contact.name}</p>
              <a
                href={`mailto:${contact.email}`}
                className="mt-1 text-sm text-primary hover:underline inline-block"
              >
                {contact.email}
              </a>
            </div>
          ))}
        </div>

        {/* Slack CTA */}
        {process.env.NEXT_PUBLIC_SLACK_INVITE_URL && (
          <div className="mt-20 pt-12 border-t border-border">
            <h2 className="font-serif text-2xl tracking-tight">Join us on Slack</h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Connect with fellow randonneurs, ask questions, share ride reports, and stay up to
              date on club news in our Slack workspace.
            </p>
            <Link
              href={process.env.NEXT_PUBLIC_SLACK_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-foreground/90 transition-colors"
            >
              Join Slack
            </Link>
          </div>
        )}

        {/* Mailing Address */}
        <div className="mt-20 pt-12 border-t border-border">
          <h2 className="font-serif text-2xl tracking-tight">Mailing Address</h2>
          <address className="mt-3 not-italic text-muted-foreground  leading-relaxed">
            Randonneurs Ontario
            <br />
            P.O. Box 20
            <br />
            Loring, Ontario
            <br />
            Canada, P0H 1S0
          </address>
        </div>
      </div>
    </PageShell>
  )
}

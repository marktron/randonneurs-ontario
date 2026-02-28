import { PageShell } from '@/components/page-shell'
import { PageHero } from '@/components/page-hero'
import { FileTextIcon, ExternalLinkIcon } from 'lucide-react'

export const metadata = {
  title: 'Club Policies',
  description: 'Randonneurs Ontario club policies and guidelines.',
}

const policies = [
  {
    title: 'By-Laws',
    href: '/policies/RANDONNEURS-ONTARIO-LONG-DISTANCE-CYCLING-ASSOCIATION-INC-Bylaws---20240825.pdf',
    description:
      'Club structure, board roles, membership rules, and financial procedures under Ontario\u2019s Not-for-Profit Corporations Act.',
  },
  {
    title: 'Rules of Brevets Randonneurs Mondiaux (200\u20131000 km)',
    href: '/policies/RULES-OF-BREVETS-RANDONNEURS-MONDIAUX-from-200-km-to-1000-km.pdf',
    description:
      'ACP regulations for BRM events: rider eligibility, equipment requirements, checkpoint validation, time limits, and homologation.',
  },
  {
    title: 'Code of Conduct and Ethics',
    href: '/policies/2020-RO-Code-of-Conduct-and-Ethics.pdf',
    description:
      'Expectations for behaviour at all RO activities, including harassment and discrimination definitions and disciplinary processes.',
  },
  {
    title: 'Concussion / Head Injury Policy',
    href: '/policies/2020-RO-Concussion-Policy.pdf',
    description:
      'Recognizing and managing head injuries at events, including mandatory withdrawal and return-to-ride requirements.',
  },
  {
    title: 'Discipline and Complaints Policy',
    href: '/policies/2020-RO-Discipline-and-Complaints-Policy.pdf',
    description:
      'How complaints and policy breaches are reported, investigated, and resolved, including sanctions and appeals.',
  },
  {
    title: 'Membership Policy',
    href: '/policies/2020-RO-Membership-Policy.pdf',
    description:
      'Membership eligibility, dues, renewal, voting privileges, and conditions for suspension or termination.',
  },
  {
    title: 'Privacy Policy',
    href: '/policies/2020-RO-Privacy-Policy.pdf',
    description:
      'How member personal information is collected, used, and protected in compliance with PIPEDA.',
  },
  {
    title: 'Risk Management Policy',
    href: '/policies/RANDONNEURS-ONTARIO-RISK-MANAGEMENT-PLAN-FINAL-07FEB2024.pdf',
    description:
      'Safety standards, equipment requirements, incident reporting, and organizational risk mitigation.',
  },
  {
    title: 'Screening Policy',
    href: '/policies/2020-RO-Screening-Policy.pdf',
    description: 'Background check requirements for volunteers in positions of trust.',
  },
  {
    title: 'Social Media Policy',
    href: '/policies/2020-RO-Social-Media-Policy.pdf',
    description:
      'Content standards and editorial guidelines for RO\u2019s blog, Facebook, and Strava.',
  },
]

export default function PoliciesPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Policies"
        title="Club Policies"
        description="Guidelines and policies for Randonneurs Ontario members and events."
      />
      <div className="content-container py-16 md:py-20">
        <div className="grid gap-4 sm:grid-cols-2">
          {policies.map((policy) => (
            <a
              key={policy.href}
              href={policy.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl border border-border bg-card p-6 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start gap-4">
                <FileTextIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                <div className="min-w-0">
                  <p className="font-serif text-lg tracking-tight group-hover:text-primary transition-colors">
                    {policy.title}
                    <ExternalLinkIcon className="ml-1.5 inline-block h-3.5 w-3.5 text-muted-foreground" />
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {policy.description}
                  </p>
                </div>
              </div>
            </a>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          All policy documents open as PDF in a new tab.
        </p>
      </div>
    </PageShell>
  )
}

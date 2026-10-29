import Image from 'next/image'
import { ArrowDownIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PageShell } from '@/components/page-shell'
import { RecordSection } from '@/components/record-section'
import { ClubHonourSection } from '@/components/club-honour-section'
import { AwardRecipientTable } from '@/components/award-recipient-table'
import { AwardRecipientDistanceTable } from '@/components/award-recipient-distance-table'
import { getOntarioAwards, getAcpAwards, getClubHonours } from '@/lib/data/awards'

export const revalidate = 86400 // Revalidate every 24 hours (historical data)

export const metadata = {
  title: 'Awards',
  description:
    'Club awards and recognitions for Randonneurs Ontario. View recipients of Ontario and ACP distance awards and the club honours voted on by members.',
}

const JUMP_LINKS = [
  { href: '#achievement-awards', label: 'Achievement awards' },
  { href: '#club-honours', label: 'Club honours' },
  { href: '#acp-awards', label: 'ACP awards' },
]

const GROUP_HEADING_CLASS = 'font-serif text-3xl md:text-4xl tracking-tight'

export default async function AwardsPage() {
  const [ontario, acp, honours] = await Promise.all([
    getOntarioAwards(),
    getAcpAwards(),
    getClubHonours(),
  ])

  return (
    <PageShell>
      <div className="content-container pt-20 md:pt-28">
        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight">Awards</h1>
        <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
          Recognizing the dedication and achievements of Randonneurs Ontario members.
        </p>
        <nav aria-label="Award groups" className="mt-8">
          <ul className="flex flex-wrap gap-2">
            {JUMP_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className={cn(
                    buttonVariants({ variant: 'outline', size: 'sm' }),
                    'group min-h-11 rounded-full px-4 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {link.label}
                  <ArrowDownIcon
                    aria-hidden="true"
                    className="size-3.5 transition-transform group-hover:translate-y-0.5"
                  />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div id="achievement-awards" className="scroll-mt-24 border-b border-border">
        <div className="content-container pt-12 md:pt-16">
          <h2 className={GROUP_HEADING_CLASS}>Achievement awards</h2>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Notify the club Awards Administrator for verification when you have completed the
            requirements for an award.{' '}
            <a
              href="/awards/RandonneursOntarioAchievementAwards-rev 20241122.pdf"
              className="text-muted-foreground hover:text-primary underline underline-offset-4 decoration-(--foreground)/20 hover:decoration-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              More details here.
            </a>
          </p>
        </div>

        <RecordSection
          title="O-12"
          description="This award goes to members who make a year-round commitment to randonneuring. Complete a club-sanctioned 200k ride (brevet or permanent) for 12 consecutive months beginning in any month. At least 8 of these monthly rides must be Randonneurs Ontario brevets or permanents. Can be earned multiple times."
          image={
            <Image
              src="/awards/o-12.png"
              alt="O-12 award badge"
              width={96}
              height={96}
              className="w-full h-full object-contain"
            />
          }
        >
          <AwardRecipientTable recipients={ontario.o12} />
        </RecordSection>

        <RecordSection
          title="Ontario Explorer"
          description="This award goes to the randonneurs who travel between chapters. Complete at least one brevet in each of the four chapters in a calendar year and you will be designated an Ontario Explorer. Can be earned multiple times."
          image={
            <Image
              src="/awards/ontario-explorer.png"
              alt="Ontario Explorer award badge"
              width={96}
              height={96}
              className="w-full h-full object-contain"
            />
          }
        >
          <AwardRecipientTable recipients={ontario.ontarioExplorer} />
        </RecordSection>

        <RecordSection
          title="O-5000"
          description="This award recognizes randonneuring mileage. Complete at least 5,000 km of sanctioned events within Ontario (includes populaires, permanents, brevets, and flèche) in a calendar year. Can be earned multiple times."
          image={
            <Image
              src="/awards/o-5000.png"
              alt="O-5000 award badge"
              width={96}
              height={96}
              className="w-full h-full object-contain"
            />
          }
        >
          <AwardRecipientDistanceTable recipients={ontario.o5000} />
        </RecordSection>

        <RecordSection
          title="Ontario Rouleur"
          description="This award is primarily intended for new randonneurs, designed to encourage a warm welcome into the randonneuring community. Complete six rides in a single season or over several: 4 club populaires (of any distance), a 200 km brevet, and an Audax-style ride (a brevet, flèche, or tracé)."
          image={
            <Image
              src="/awards/ontario-rouleur.png"
              alt="Ontario Rouleur award badge"
              width={96}
              height={96}
              className="w-full h-full object-contain"
            />
          }
        >
          <AwardRecipientTable recipients={ontario.ontarioRouleur} />
        </RecordSection>

        <RecordSection
          title="Ontario Rover"
          description="This award encourages participation in the Permanents Program. Accumulate 1,200 km of permanents (over any period) with at least two permanent routes being 300 km. Can be earned multiple times."
          image={
            <Image
              src="/awards/ontario-rover.png"
              alt="Ontario Rover award badge"
              width={96}
              height={96}
              className="w-full h-full object-contain"
            />
          }
        >
          <AwardRecipientTable recipients={ontario.ontarioRover} />
        </RecordSection>
      </div>

      <div id="club-honours" className="scroll-mt-24 border-b border-border">
        <div className="content-container pt-12 md:pt-16">
          <h2 className={GROUP_HEADING_CLASS}>Club honours</h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Club honours are voted on by members and presented at the annual banquet. No awards were
            presented for 2020.
          </p>
        </div>

        <RecordSection
          title="Mike Barry/Jock Wadley Award"
          description="Awarded to a rider who is outstanding in one year or over several years, actively participating in brevets, and acting as an exemplary participant in the sport of randonneuring."
          subtitle="Outstanding Rider"
        >
          <AwardRecipientTable recipients={honours.mikeBarryJockWadley} />
        </RecordSection>

        <section className="py-12 md:py-16">
          <div className="content-container grid gap-x-12 gap-y-14 lg:grid-cols-2">
            <ClubHonourSection
              title="Beryl Burton Award"
              subtitle="Best Female Rider"
              description="A female rider who has demonstrated outstanding performance and/or leadership and ambassadorship in the sport of randonneuring."
              recipients={honours.berylBurton}
            />
            <ClubHonourSection
              title="Coronation Cup"
              subtitle="Most Improved Rider"
              description="A rider with at least one previous year in the club, and has shown consistency in participation and demonstrated continuous improvement over the previous season."
              recipients={honours.coronationCup}
            />
            <ClubHonourSection
              title="Jim Griffin Rookie of the Year"
              description="Awarded to a rider who joined the club and rode their first brevet this year and demonstrated enthusiasm and interest in continuing in the sport of randonneuring. "
              recipients={honours.jimGriffinRookieOfTheYear}
            />
            <ClubHonourSection
              title="Organiser of the Year"
              description="The person who has organized or supported club events, assisted with the growth of the club, and supported the club administratively or through other voluntary endeavours."
              recipients={honours.organiserOfTheYear}
            />
            <ClubHonourSection
              title="Outstanding Performance on a Brevet"
              description="A rider who has demonstrated fortitude, courage or generosity on a brevet, and demonstrated physical or mental abilities beyond the usual in the conduct of a brevet."
              recipients={honours.outstandingPerformance}
            />
            <ClubHonourSection
              title="Dan Herbert Award"
              description="A rider who has benefited the club by mentoring one or more members by encouraging, educating and assisting riders to reach their full potential."
              recipients={honours.danHerbert}
            />
            <ClubHonourSection
              title="Half Wheel Award"
              description="Awarded to the club rider who consistently forced the pace of the group during brevet rides."
              recipients={honours.halfWheel}
            />
            <ClubHonourSection
              title="Special Recognition Award"
              description="Awarded to the club rider who has had a cycling accomplishment that merits special recognition."
              recipients={honours.specialRecognition}
            />
          </div>
        </section>
      </div>

      <div id="acp-awards" className="scroll-mt-24">
        <RecordSection
          title="ACP Awards"
          description={
            <>
              Recipients of the{' '}
              <a
                href="https://www.audax-club-parisien.com/en/our-organizations/randonneur-10000-en/"
                className="underline hover:text-foreground"
                target="_blank"
                rel="noopener noreferrer"
              >
                Randonneur 10000
              </a>{' '}
              and{' '}
              <a
                href="https://www.audax-club-parisien.com/en/our-organizations/randonneur-5000-en/"
                className="underline hover:text-foreground"
                target="_blank"
                rel="noopener noreferrer"
              >
                Randonneur 5000
              </a>{' '}
              distance awards from Audax Club Parisien.
            </>
          }
        >
          <div className="grid gap-10 lg:grid-cols-2">
            <AwardRecipientTable title="Randonneur 10000" recipients={acp.r10000} />
            <AwardRecipientTable title="Randonneur 5000" recipients={acp.r5000} />
          </div>
        </RecordSection>
      </div>
    </PageShell>
  )
}

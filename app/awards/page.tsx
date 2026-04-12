import Image from 'next/image'
import { PageShell } from '@/components/page-shell'
import { RecordSection } from '@/components/record-section'
import { AwardRecipientTable } from '@/components/award-recipient-table'
import { AwardRecipientDistanceTable } from '@/components/award-recipient-distance-table'
import { getOntarioAwards, getAcpAwards } from '@/lib/data/awards'

export const revalidate = 86400 // Revalidate every 24 hours (historical data)

export const metadata = {
  title: 'Awards',
  description:
    'Club awards and recognitions for Randonneurs Ontario. View recipients of Ontario and ACP distance awards.',
}

export default async function AwardsPage() {
  const [ontario, acp] = await Promise.all([getOntarioAwards(), getAcpAwards()])

  return (
    <PageShell>
      <div className="content-container pt-20 md:pt-28">
        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight">
          Achievement Awards
        </h1>
        <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
          Recognizing the dedication and achievements of Randonnuers Ontario members. Notify the
          club Awards Administrator for verification when you have completed the requirements for an
          award.
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
    </PageShell>
  )
}

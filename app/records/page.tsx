import { PageShell } from '@/components/page-shell'
import { RecordSection } from '@/components/record-section'
import {
  RiderRecordTable,
  RiderTimeRecordTable,
  SeasonRiderRecordTable,
  ClubSeasonRecordTable,
  RouteRecordTable,
  StreakRecordTable,
} from '@/components/record-table'
import {
  getLifetimeRecords,
  getSeasonRecords,
  getCurrentSeasonDistance,
  getClubAchievements,
  getRouteRecords,
  getPbpRecords,
  getGraniteAnvilRecords,
} from '@/lib/data/records'

export const revalidate = 3600 // Revalidate every hour (driven by current season data)

const currentSeason = process.env.NEXT_PUBLIC_CURRENT_SEASON || '2026'

export const metadata = {
  title: 'Records',
  description:
    'Club records and achievements for Randonneurs Ontario. View all-time rankings, season bests, and notable accomplishments.',
}

export default async function RecordsPage() {
  // Fetch all records in parallel
  const [lifetime, season, currentSeasonDistance, club, routes, pbp, graniteAnvil] =
    await Promise.all([
      getLifetimeRecords(),
      getSeasonRecords(),
      getCurrentSeasonDistance(),
      getClubAchievements(),
      getRouteRecords(),
      getPbpRecords(),
      getGraniteAnvilRecords(),
    ])

  const formatDistance = (km: number) => `${km.toLocaleString()} km`

  return (
    <PageShell>
      <div className="content-container pt-20 md:pt-28">
        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight">Club Records</h1>
        <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl">
          Celebrating the achievements and milestones of our randonneuring community.
        </p>
      </div>

      <RecordSection
        title="Lifetime Achievements"
        description="All-time rankings across the complete history of Randonneurs Ontario."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <RiderRecordTable
            title="Most Completed Events"
            records={lifetime.mostBrevets}
            valueLabel="Events"
          />
          <RiderRecordTable
            title="Highest Total Distance"
            records={lifetime.highestDistance}
            valueLabel="Distance"
            formatValue={formatDistance}
          />
        </div>
        <div className="grid gap-10 lg:grid-cols-2">
          <RiderRecordTable
            title="Most Active Seasons"
            records={lifetime.mostActiveSeasons}
            valueLabel="Seasons"
          />
          <RiderRecordTable
            title="Most Permanents Completed"
            records={lifetime.mostPermanents}
            valueLabel="Permanents"
          />
        </div>
        <div className="grid gap-10 lg:grid-cols-2">
          <RiderRecordTable
            title="Most Completed Devil Weeks"
            records={lifetime.mostDevilWeeks}
            valueLabel="Awards"
          />
          <RiderRecordTable
            title="Most Super Randonneur Awards"
            records={lifetime.mostSuperRandonneurs}
            valueLabel="Awards"
          />
        </div>
        <div className="grid gap-10 lg:grid-cols-2">
          <StreakRecordTable
            title="Longest Active Streak"
            records={lifetime.longestStreaks}
            currentSeason={parseInt(currentSeason, 10)}
            valueLabel="Seasons"
          />
          <StreakRecordTable
            title="Longest Super Randonneur Streak"
            records={lifetime.srStreaks}
            currentSeason={parseInt(currentSeason, 10)}
            valueLabel="Seasons"
          />
        </div>
      </RecordSection>

      <RecordSection
        title="Season Records"
        description="Best single-season performances by individual riders."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <SeasonRiderRecordTable
            title="Most Events in a Season"
            records={season.mostBrevetsInSeason}
            valueLabel="Events"
          />
          <SeasonRiderRecordTable
            title="Highest Season Distance"
            records={season.highestDistanceInSeason}
            valueLabel="Distance"
            formatValue={formatDistance}
          />
        </div>
        <RiderRecordTable
          title={`${currentSeason} Season Distance Leaders`}
          records={currentSeasonDistance}
          valueLabel="Distance"
          formatValue={formatDistance}
        />
      </RecordSection>

      <RecordSection
        title="Club Achievements"
        description="Season-by-season club statistics and growth milestones."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <ClubSeasonRecordTable
            title="Most Unique Riders"
            records={club.mostUniqueRiders}
            valueLabel="Riders"
          />
          <ClubSeasonRecordTable
            title="Most Events Organized"
            records={club.mostBrevetsOrganized}
            valueLabel="Events"
          />
        </div>
        <ClubSeasonRecordTable
          title="Highest Total Club Distance"
          records={club.highestCumulativeDistance}
          valueLabel="Distance"
          formatValue={formatDistance}
        />
      </RecordSection>

      <RecordSection
        title="Popular Routes"
        description="The most frequently ridden and well-attended routes in the club."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <RouteRecordTable
            title="Most Frequently Used"
            records={routes.byFrequency}
            valueLabel="Events"
          />
          <RouteRecordTable
            title="Most Riders"
            records={routes.byParticipants}
            valueLabel="Riders"
          />
        </div>
      </RecordSection>

      <RecordSection
        title="Paris-Brest-Paris"
        description="Records from the world's oldest and most prestigious cycling event."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <RiderRecordTable
            title="Most Completions"
            records={pbp.mostCompletions}
            valueLabel="Finishes"
          />
          <RiderTimeRecordTable title="Fastest Times" records={pbp.fastestTimes} />
        </div>
      </RecordSection>

      <RecordSection
        title="Granite Anvil"
        description="Records from Ontario's premier 1200km grand randonnée."
      >
        <div className="grid gap-10 lg:grid-cols-2">
          <RiderRecordTable
            title="Most Completions"
            records={graniteAnvil.mostCompletions}
            valueLabel="Finishes"
          />
          <RiderTimeRecordTable title="Fastest Times" records={graniteAnvil.fastestTimes} />
        </div>
      </RecordSection>
    </PageShell>
  )
}

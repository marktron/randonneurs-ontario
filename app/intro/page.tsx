import { PageShell } from '@/components/page-shell'
import { PageHero } from '@/components/page-hero'
import { ArrowLink } from '@/components/arrow-link'

export const metadata = {
  title: 'What is Randonneuring?',
  description:
    "An introduction to randonneuring, the non-competitive long-distance cycling tradition that's been going since 1891.",
}

const brevetDistances = [
  {
    distance: 'Populaire',
    timeLimit: 'Under 200 km',
    description:
      'Shorter organized rides that are a great introduction to the club and to randonneuring.',
  },
  {
    distance: '200 km',
    timeLimit: 'Time limit: 13.5 hours',
    description: 'Where most riders begin. A full day in the saddle.',
  },
  {
    distance: '300 km',
    timeLimit: 'Time limit: 20 hours',
    description: 'Your first taste of riding into the evening.',
  },
  {
    distance: '400 km',
    timeLimit: 'Time limit: 27 hours',
    description: 'Through the night and into the next morning.',
  },
  {
    distance: '600 km',
    timeLimit: 'Time limit: 40 hours',
    description: 'A weekend-long journey. Sleep strategy required.',
  },
  {
    distance: '1000+ km',
    timeLimit: 'Time limit: 75+ hours',
    description: 'Multi-day rides across the province, including the 1200 km Granite Anvil.',
  },
]

const myths = [
  {
    myth: 'You need race fitness.',
    reality: 'You need steady pacing and a plan. Speed is not the point.',
  },
  {
    myth: 'You ride alone all day.',
    reality:
      "You can, but you'll bump into other riders constantly. Nobody's truly alone out there.",
  },
  {
    myth: 'It sounds miserable.',
    reality:
      "It's hard and fun: sunrise starts, diner stops, night riding, and a finish you'll remember for a long time.",
  },
]

export default function IntroPage() {
  return (
    <PageShell>
      <PageHero
        image="/huron.jpg"
        eyebrow="Introduction"
        title="What is Randonneuring?"
        description="Non-competitive long-distance cycling. Harder than it sounds, and more fun."
      />

      {/* Lede */}
      <div className="content-container py-16 md:py-20">
        <div className="max-w-3xl space-y-6">
          <p className="font-serif text-2xl leading-relaxed tracking-tight md:text-3xl md:leading-snug">
            Two hundred kilometres of Ontario back roads by bicycle. Quiet farm country, small-town
            diners, into the evening and home after dark. No sag wagon. No race number. Just you,
            your bike, and a card to get stamped along the way.
          </p>
          <p className="text-lg leading-8 text-muted-foreground md:text-xl md:leading-9">
            That’s a brevet, the basic unit of randonneuring. It’s not a race, but it’s harder than
            touring. You ride a set route, look after yourself, and finish within a generous time
            limit.
          </p>
        </div>
      </div>

      {/* How It Works */}
      <div className="border-t border-border">
        <div className="content-container py-16 md:py-20">
          <p className="eyebrow">How It Works</p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight md:text-4xl">The Brevet</h2>
          <div className="mt-10 max-w-3xl space-y-6 text-lg leading-8 text-muted-foreground">
            <p>
              A <strong className="text-foreground">brevet</strong> (French for “certificate”) is a
              timed, long-distance ride on a prescribed route. You get a route file, a start time,
              and a list of <em>controls</em>, which are checkpoints where you validate your passage
              with a receipt, photo, or check-in.
            </p>
            <p>
              There are no finish-line crowds and no podiums. Results are listed alphabetically, not
              by finish time, because the only thing that matters is completing the distance within
              the time limit. You ride at whatever pace works for you, a principle the French call{' '}
              <em>allure libre</em>.
            </p>
            <p className="text-foreground font-medium">
              Your day on a brevet looks something like this:
            </p>
            <ul className="space-y-3 pl-1">
              <li className="flex gap-3">
                <span className="mt-[0.625em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>Riding at whatever pace keeps you moving (it’s not about speed)</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-[0.625em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>Stopping at controls to get your card stamped</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-[0.625em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  Stopping for actual meals (you’ll need them), refilling bottles, adding or
                  shedding layers
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-[0.625em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  Following your GPS, fixing a flat if you get one, and figuring out how you feel
                  about riding in the dark
                </span>
              </li>
            </ul>
            <p>
              Riders are self-supported, but that doesn’t mean you’re on your own. People share
              energy bars at 3 a.m. gas stations and wait for each other on dark stretches of road.
              You’ll spend hours alone with your thoughts, then share a table with someone you met
              200 km ago.
            </p>
          </div>
        </div>
      </div>

      {/* Myth vs Reality */}
      <div className="border-t border-border bg-muted/30">
        <div className="content-container py-12 md:py-16">
          <div className="grid gap-6 sm:grid-cols-3">
            {myths.map((item) => (
              <div key={item.myth}>
                <p className="text-sm font-medium tracking-wide uppercase text-muted-foreground">
                  Myth
                </p>
                <p className="mt-1 italic text-muted-foreground">{item.myth}</p>
                <p className="mt-3 text-sm font-medium tracking-wide uppercase text-muted-foreground">
                  Reality
                </p>
                <p className="mt-1 font-medium">{item.reality}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Brevet Distances */}
      <div className="border-t border-border">
        <div className="content-container py-16 md:py-20">
          <p className="eyebrow">The Distance Ladder</p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight md:text-4xl">
            From a Long Day to a Multi-Day Journey
          </h2>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">
            Brevets follow a standard set of distances recognized worldwide. Most riders work up
            through them over a season or two.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {brevetDistances.map((brevet) => (
              <div key={brevet.distance} className="rounded-xl border border-border bg-card p-6">
                <p className="font-serif text-3xl tracking-tight">{brevet.distance}</p>
                <p className="mt-1 text-sm font-medium text-muted-foreground">{brevet.timeLimit}</p>
                <p className="mt-3 text-muted-foreground leading-relaxed">{brevet.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Is This For Me? */}
      <div className="border-t border-border bg-muted/30">
        <div className="content-container py-16 md:py-20">
          <p className="eyebrow">Getting Started</p>
          <h2 className="mt-3 font-serif text-3xl tracking-tight md:text-4xl">Is This For Me?</h2>
          <div className="mt-10 max-w-3xl space-y-6 text-lg leading-8 text-muted-foreground">
            <p>
              You don’t need to be fast. What helps is patience, some preparation, and curiosity
              about what happens when you just keep riding.
            </p>
            <p>Randonneuring tends to click with people who:</p>
            <ul className="space-y-3 pl-1">
              <li className="flex gap-3">
                <span className="mt-[0.625em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>Like long, steady rides more than short, intense efforts</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-[0.625em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>Want an endurance challenge without racing culture</span>
              </li>
              <li className="flex gap-3">
                <span className="mt-[0.625em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  Enjoy riding solo but like knowing other people are out there doing the same thing
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-[0.625em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>Have looked at a map and thought “I wonder if I could ride there”</span>
              </li>
            </ul>
            <p>
              Many riders start from a base of weekend rides in the 80&ndash;120 km range. With some
              pacing discipline, a 200 km brevet is a realistic next step.
            </p>
            <p>
              Your first ride is free with a trial membership. Register, show up, ride the route,
              get your card stamped, and see what you think. If you’ve ever wondered whether you
              could ride 200 km, this is a good way to find out.
            </p>
          </div>
        </div>
      </div>

      {/* History Callout */}
      <div className="border-t border-border">
        <div className="content-container py-16 md:py-20">
          <div className="max-w-3xl">
            <p className="eyebrow">A Worldwide Tradition</p>
            <h2 className="mt-3 font-serif text-3xl tracking-tight md:text-4xl">
              Over a Century of Riding Far
            </h2>
            <div className="mt-6 space-y-6 text-lg leading-8 text-muted-foreground">
              <p>
                Randonneuring began in France in 1891, when the newspaper <em>Le Petit Journal</em>{' '}
                organized a 1,200 km ride from Paris to Brest and back on unpaved roads. It was
                meant to be impossible. Over two hundred riders showed up anyway.
              </p>
              <p>
                <a
                  href="https://paris-brest-paris.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Paris-Brest-Paris
                </a>{' '}
                still runs every four years, making it the oldest cycling event in the world.
                Thousands of riders from dozens of countries qualify and participate, and it remains
                the dream ride for many randonneurs.
              </p>
              <p>
                Randonneurs Ontario has been organizing brevets since 1982, with chapters across the
                province. Our routes wind through long quiet roads, big-sky farm country, and the
                kind of small-town Ontario that you only really see from a bicycle.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="border-t border-border bg-muted/30">
        <div className="content-container py-16 md:py-20">
          <h2 className="font-serif text-3xl tracking-tight md:text-4xl">Ready to Ride?</h2>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">
            Your first event is free. Our community is friendly and nobody will make you feel like
            you need to earn your place. Just show up.
          </p>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
            <ArrowLink href="/calendar">See upcoming brevets</ArrowLink>
            <ArrowLink href="/membership">Join Randonneurs Ontario</ArrowLink>
            <ArrowLink href="/about">About the club</ArrowLink>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

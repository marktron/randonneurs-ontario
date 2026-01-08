import Link from "next/link";

interface Ride {
  date: string;
  name: string;
  distance: string;
  slug: string;
}

interface Chapter {
  name: string;
  slug: string;
  rides: Ride[];
}

const upcomingRides: Chapter[] = [
  {
    name: "Huron",
    slug: "huron",
    rides: [
      { date: "2026-03-07", name: "Wiarton Willy", distance: "200", slug: "wiarton-willy-200km-2026-03-07" },
      { date: "2026-03-14", name: "The Roaring Lion", distance: "200", slug: "the-roaring-lion-200km-2026-03-14" },
      { date: "2026-03-28", name: "Wizard of Oz", distance: "200", slug: "wizard-of-oz-200km-2026-03-28" },
      { date: "2026-04-04", name: "Windsor", distance: "62", slug: "windsor-62km-2026-04-04" },
    ],
  },
  {
    name: "Ottawa",
    slug: "ottawa",
    rides: [
      { date: "2026-03-21", name: "Carleton Place", distance: "40", slug: "carleton-place-40km-2026-03-21" },
      { date: "2026-03-28", name: "Almonte", distance: "71", slug: "almonte-71km-2026-03-28" },
      { date: "2026-04-11", name: "Maple Syrup", distance: "100", slug: "maple-syrup-100km-2026-04-11" },
      { date: "2026-04-18", name: "Burnstown Cafe", distance: "200", slug: "burnstown-cafe-200km-2026-04-18" },
    ],
  },
  {
    name: "Simcoe-Muskoka",
    slug: "simcoe-muskoka",
    rides: [
      { date: "2026-04-11", name: "Simcoe SW Warmup", distance: "100", slug: "simcoe-sw-warmup-100km-2026-04-11" },
      { date: "2026-05-02", name: "Tour of the Headwaters", distance: "200", slug: "tour-of-the-headwaters-200km-2026-05-02" },
      { date: "2026-05-16", name: "Fleche 2026", distance: "360+", slug: "fleche-2026-360km-2026-05-16" },
      { date: "2026-06-06", name: "St Joseph Island", distance: "200", slug: "st-joseph-island-200km-2026-06-06" },
    ],
  },
  {
    name: "Toronto",
    slug: "toronto",
    rides: [
      { date: "2026-03-28", name: "Rouge Ramble", distance: "60", slug: "rouge-ramble-60km-2026-03-28" },
      { date: "2026-04-04", name: "Concord Bradford", distance: "90", slug: "concord-bradford-90km-2026-04-04" },
      { date: "2026-04-11", name: "Uxbridge Ice Classic", distance: "110", slug: "uxbridge-ice-classic-110km-2026-04-11" },
      { date: "2026-04-18", name: "Gentle Start", distance: "120", slug: "gentle-start-120km-2026-04-18" },
    ],
  },
];

function formatDate(dateString: string): { month: string; day: string } {
  const date = new Date(dateString + "T00:00:00");
  const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const day = date.getDate().toString();
  return { month, day };
}

export function UpcomingRides() {
  return (
    <aside className="w-full">
      <h2 className="font-serif text-2xl tracking-tight mb-8">Upcoming Rides</h2>

      <div className="space-y-8">
        {upcomingRides.map((chapter) => (
          <div key={chapter.slug}>
            {/* Chapter name as overline */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">
                {chapter.name}
              </h3>
              <Link
                href={`/calendar/${chapter.slug}`}
                className="text-xs font-medium text-primary hover:underline underline-offset-2"
              >
                View all
              </Link>
            </div>

            {/* Rides list */}
            <ul className="space-y-1">
              {chapter.rides.map((ride, index) => {
                const { month, day } = formatDate(ride.date);
                return (
                  <li key={index}>
                    <Link
                      href={`/register/${ride.slug}`}
                      className="group flex items-start gap-3 py-3 -mx-2 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      {/* Date block */}
                      <div className="flex-shrink-0 w-10 text-center">
                        <div className="text-[10px] font-medium tracking-wider text-muted-foreground">
                          {month}
                        </div>
                        <div className="text-lg font-semibold tabular-nums leading-tight">
                          {day}
                        </div>
                      </div>

                      {/* Ride details */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">
                          {ride.name}
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                          {ride.distance} km
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}

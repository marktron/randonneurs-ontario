export interface RiderResult {
  name: string;
  time: string | "DNF";
}

export interface EventResult {
  date: string;
  name: string;
  distance: string;
  riders: RiderResult[];
}

export interface ChapterResults {
  chapter: string;
  year: number;
  events: EventResult[];
}

// Placeholder results - same data used for all chapters initially
const placeholderEvents2025: EventResult[] = [
  {
    date: "2025-08-02",
    name: "Fort to Fort",
    distance: "400",
    riders: [
      { name: "Karl Caris", time: "20:55" },
      { name: "Dinesh Chaudhari", time: "DNF" },
      { name: "Joanne Dejong", time: "20:55" },
      { name: "Ratish Gupta", time: "DNF" },
      { name: "Darcy Haggith", time: "20:55" },
      { name: "Thomas Hughes", time: "20:55" },
      { name: "Jason Kocho", time: "20:55" },
      { name: "Ali Lalani", time: "20:55" },
      { name: "Karen Merlo", time: "20:55" },
      { name: "Ben Merritt", time: "20:55" },
      { name: "Tim O'Callahan", time: "20:55" },
      { name: "Chad Szymanski", time: "20:55" },
      { name: "Brenda Wiechers-Maxwell", time: "20:55" },
    ],
  },
  {
    date: "2025-07-26",
    name: "South Bruce",
    distance: "200",
    riders: [
      { name: "Karl Caris", time: "10:56" },
      { name: "John Kieffer", time: "9:40" },
      { name: "Rei Kawamura", time: "10:56" },
      { name: "Emily Lloyd", time: "10:56" },
      { name: "Con Melady", time: "9:40" },
    ],
  },
  {
    date: "2025-07-19",
    name: "Much Ado About Nothing",
    distance: "200",
    riders: [
      { name: "Karl Caris", time: "8:47" },
      { name: "Fred Chagnon", time: "8:47" },
      { name: "Michael Charland", time: "8:10" },
      { name: "Dinesh Chaudhari", time: "12:16" },
      { name: "Marc Deshaies", time: "7:40" },
      { name: "Paul Dolan", time: "10:42" },
      { name: "Jerzy Dziadon", time: "8:50" },
      { name: "Rhonda Gesinghaus-Vaters", time: "9:40" },
      { name: "Geoff Gowing", time: "8:50" },
      { name: "Ratish Gupta", time: "12:16" },
      { name: "Michel Hebert", time: "8:50" },
      { name: "Michael McAlpine", time: "10:08" },
      { name: "Tim Million", time: "9:59" },
      { name: "Jim Mullenix", time: "8:48" },
      { name: "David Nall", time: "9:57" },
      { name: "Tim O'Callahan", time: "8:50" },
      { name: "Stephen Van Hoesel", time: "9:47" },
      { name: "Brenda Wiechers-Maxwell", time: "8:50" },
      { name: "Carla Wilson", time: "8:50" },
    ],
  },
  {
    date: "2025-07-12",
    name: "Erie-Oh",
    distance: "300",
    riders: [
      { name: "Karl Caris", time: "17:10" },
      { name: "Ali Lalani", time: "17:10" },
      { name: "Karen Merlo", time: "16:15" },
      { name: "Ben Merritt", time: "16:15" },
      { name: "Tim O'Callahan", time: "17:10" },
      { name: "Brenda Wiechers-Maxwell", time: "17:10" },
    ],
  },
  {
    date: "2025-07-05",
    name: "Beaver Valley",
    distance: "400",
    riders: [
      { name: "Chris Ariens", time: "22:45" },
      { name: "Michael Charland", time: "DNF" },
      { name: "Marc Deshaies", time: "20:31" },
      { name: "Tim Griffin", time: "16:58" },
      { name: "Sergii Tsymbal", time: "16:58" },
    ],
  },
  {
    date: "2025-06-28",
    name: "A Midsummer Night's Grind",
    distance: "600",
    riders: [
      { name: "Victor Bui", time: "38:55" },
      { name: "Natalia Derbentseva", time: "38:00" },
      { name: "John Kieffer", time: "38:55" },
      { name: "Xinhua Luo", time: "38:55" },
      { name: "Maxine Oleka", time: "35:51" },
      { name: "Mike Siemens", time: "35:51" },
      { name: "Stanley Zhou", time: "38:55" },
    ],
  },
];

// Chapter-specific results
export const torontoResults: Record<number, EventResult[]> = {
  2025: placeholderEvents2025,
  2026: [], // Current season - no results yet
};

export const ottawaResults: Record<number, EventResult[]> = {
  2025: placeholderEvents2025,
  2026: [],
};

export const simcoeMuskokaResults: Record<number, EventResult[]> = {
  2025: placeholderEvents2025,
  2026: [],
};

export const huronResults: Record<number, EventResult[]> = {
  2025: placeholderEvents2025,
  2026: [],
};

// Available years per chapter (for navigation) - descending order
export const availableYears: Record<string, number[]> = {
  toronto: Array.from({ length: 2026 - 1999 + 1 }, (_, i) => 2026 - i),
  ottawa: Array.from({ length: 2026 - 1999 + 1 }, (_, i) => 2026 - i),
  "simcoe-muskoka": Array.from({ length: 2026 - 2005 + 1 }, (_, i) => 2026 - i), // Started 2005
  huron: Array.from({ length: 2026 - 2010 + 1 }, (_, i) => 2026 - i), // Started 2010
};

// Chapter metadata
export const chapterMeta: Record<string, { name: string; description: string; coverImage: string }> = {
  toronto: {
    name: "Toronto",
    description: "Results from brevets and populaires in the Greater Toronto Area.",
    coverImage: "/toronto.jpg",
  },
  ottawa: {
    name: "Ottawa",
    description: "Results from brevets and populaires in the Ottawa Valley region.",
    coverImage: "/ottawa.jpg",
  },
  "simcoe-muskoka": {
    name: "Simcoe-Muskoka",
    description: "Results from brevets and populaires in Simcoe County and Muskoka.",
    coverImage: "/simcoe.jpg",
  },
  huron: {
    name: "Huron",
    description: "Results from brevets and populaires along Lake Huron and Bruce County.",
    coverImage: "/huron.jpg",
  },
};

// Helper to get results for a chapter/year
export function getChapterResults(chapter: string, year: number): EventResult[] | null {
  const years = availableYears[chapter];
  if (!years || !years.includes(year)) {
    return null; // Invalid chapter or year outside range
  }

  // Return data if exists, otherwise empty array for valid years
  switch (chapter) {
    case "toronto":
      return torontoResults[year] ?? [];
    case "ottawa":
      return ottawaResults[year] ?? [];
    case "simcoe-muskoka":
      return simcoeMuskokaResults[year] ?? [];
    case "huron":
      return huronResults[year] ?? [];
    default:
      return null;
  }
}

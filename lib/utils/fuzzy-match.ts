/**
 * Fuzzy name matching utilities for rider deduplication.
 * Uses Levenshtein distance to find similar names.
 */

/**
 * Common nickname mappings. Keys are canonical names, values are nicknames.
 * All entries should be lowercase.
 */
const NICKNAME_MAP: Record<string, string[]> = {
  alexander: ['alex', 'alec', 'al', 'sandy', 'xander'],
  alexandra: ['alex', 'alexa', 'sandy', 'lexi'],
  andrew: ['andy', 'drew'],
  anthony: ['tony', 'ant'],
  barbara: ['barb', 'barbie', 'babs'],
  benjamin: ['ben', 'benny', 'benji'],
  catherine: ['cathy', 'cat', 'kate', 'katie'],
  charles: ['charlie', 'chuck', 'chas'],
  christine: ['chris', 'chrissy', 'tina'],
  christopher: ['chris', 'kit', 'topher'],
  daniel: ['dan', 'danny'],
  david: ['dave', 'davey'],
  deborah: ['deb', 'debbie', 'debby'],
  donald: ['don', 'donny', 'donnie'],
  dorothy: ['dot', 'dotty', 'dottie'],
  edward: ['ed', 'eddie', 'ted', 'teddy', 'ned'],
  elizabeth: ['liz', 'lizzy', 'beth', 'betty', 'eliza', 'libby', 'eli', 'ellie'],
  frederick: ['fred', 'freddy', 'freddie'],
  geoffrey: ['geoff', 'jeff'],
  gerald: ['gerry', 'jerry'],
  gregory: ['greg', 'gregg'],
  james: ['jim', 'jimmy', 'jamie', 'jem'],
  jeffrey: ['jeff', 'geoff'],
  jennifer: ['jen', 'jenny', 'jenn'],
  jessica: ['jess', 'jessie'],
  john: ['jack', 'johnny', 'jon'],
  jonathan: ['jon', 'jonny', 'john'],
  joseph: ['joe', 'joey', 'jo'],
  joshua: ['josh'],
  katherine: ['kate', 'kathy', 'katie', 'katy', 'kay', 'kit', 'kitty'],
  kenneth: ['ken', 'kenny'],
  lawrence: ['larry', 'lars'],
  leonard: ['leo', 'len', 'lenny'],
  margaret: ['maggie', 'meg', 'peggy', 'marge', 'margie', 'megan'],
  matthew: ['matt', 'matty'],
  michael: ['mike', 'mikey', 'mick'],
  nicholas: ['nick', 'nicky'],
  patricia: ['pat', 'patty', 'trish', 'trisha'],
  patrick: ['pat', 'paddy', 'patty'],
  pete: ['pete'],
  philip: ['phil'],
  phillip: ['phil'],
  raymond: ['ray'],
  rebecca: ['becky', 'becca'],
  richard: ['rick', 'ricky', 'dick', 'rich', 'richie'],
  robert: ['bob', 'bobby', 'rob', 'robbie', 'bert'],
  ronald: ['ron', 'ronny', 'ronnie'],
  samuel: ['sam', 'sammy'],
  sandra: ['sandy'],
  stephanie: ['steph', 'stephy'],
  stephen: ['steve', 'stevie'],
  steven: ['steve', 'stevie'],
  susan: ['sue', 'susie', 'suzy'],
  theodore: ['ted', 'teddy', 'theo'],
  thomas: ['tom', 'tommy'],
  timothy: ['tim', 'timmy'],
  victoria: ['vicky', 'vicki', 'tori'],
  william: ['bill', 'billy', 'will', 'willy', 'liam'],
}

// Build reverse lookup: nickname -> canonical names
const NICKNAME_REVERSE: Record<string, string[]> = {}
for (const [canonical, nicknames] of Object.entries(NICKNAME_MAP)) {
  for (const nick of nicknames) {
    if (!NICKNAME_REVERSE[nick]) {
      NICKNAME_REVERSE[nick] = []
    }
    NICKNAME_REVERSE[nick].push(canonical)
  }
}

/**
 * Get all name variants (nicknames) for a given name.
 * Used to expand database searches.
 * Example: "Bob" -> ["bob", "robert", "bobby", "rob", "robbie", "bert"]
 */
export function getNameVariants(name: string): string[] {
  const normalized = name.trim().toLowerCase()
  const variants = new Set<string>([normalized])

  // If it's a canonical name, add all its nicknames
  if (NICKNAME_MAP[normalized]) {
    for (const nick of NICKNAME_MAP[normalized]) {
      variants.add(nick)
    }
  }

  // If it's a nickname, add the canonical name(s) and their other nicknames
  if (NICKNAME_REVERSE[normalized]) {
    for (const canonical of NICKNAME_REVERSE[normalized]) {
      variants.add(canonical)
      for (const nick of NICKNAME_MAP[canonical] || []) {
        variants.add(nick)
      }
    }
  }

  return Array.from(variants)
}

/**
 * Check if two names are nickname equivalents.
 * Returns true if they're the same name or known nicknames of each other.
 */
function areNicknameEquivalent(name1: string, name2: string): boolean {
  const n1 = name1.toLowerCase()
  const n2 = name2.toLowerCase()

  if (n1 === n2) return true

  // Check if n1 is a nickname of n2's canonical form
  const n1Canonical = NICKNAME_REVERSE[n1] || []
  const n2Canonical = NICKNAME_REVERSE[n2] || []

  // n1 is canonical, n2 is its nickname
  if (NICKNAME_MAP[n1]?.includes(n2)) return true
  // n2 is canonical, n1 is its nickname
  if (NICKNAME_MAP[n2]?.includes(n1)) return true
  // Both are nicknames of the same canonical name
  if (n1Canonical.some(c => n2Canonical.includes(c))) return true
  // n1 is a nickname, n2 is the canonical
  if (n1Canonical.includes(n2)) return true
  // n2 is a nickname, n1 is the canonical
  if (n2Canonical.includes(n1)) return true

  return false
}

/**
 * Calculate the Levenshtein distance between two strings.
 * This is the minimum number of single-character edits (insertions,
 * deletions, or substitutions) required to change one string into the other.
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase()
  const bLower = b.toLowerCase()

  if (aLower === bLower) return 0
  if (aLower.length === 0) return bLower.length
  if (bLower.length === 0) return aLower.length

  // Create matrix
  const matrix: number[][] = []

  // Initialize first column
  for (let i = 0; i <= aLower.length; i++) {
    matrix[i] = [i]
  }

  // Initialize first row
  for (let j = 0; j <= bLower.length; j++) {
    matrix[0][j] = j
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= aLower.length; i++) {
    for (let j = 1; j <= bLower.length; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return matrix[aLower.length][bLower.length]
}

/**
 * Calculate a similarity score between 0 and 1.
 * 1 = exact match, 0 = completely different.
 */
export function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1 // Both empty strings are identical
  const distance = levenshteinDistance(a, b)
  return 1 - distance / maxLen
}

/**
 * Normalize a name for comparison - lowercase and strip special characters.
 * "O'Callahan" -> "ocallahan"
 */
function normalizeForComparison(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * Calculate a fuzzy match score for a full name.
 * Handles variations like:
 * - Different order (John Smith vs Smith John)
 * - Minor typos
 * - Missing middle names
 * - Special characters (O'Callahan vs Ocallahan)
 * - Common nicknames (Bob vs Robert, Dave vs David)
 */
export function fuzzyNameScore(
  searchFirst: string,
  searchLast: string,
  candidateFirst: string,
  candidateLast: string
): number {
  // Normalize inputs - strip special characters for comparison
  const sf = normalizeForComparison(searchFirst)
  const sl = normalizeForComparison(searchLast)
  const cf = normalizeForComparison(candidateFirst)
  const cl = normalizeForComparison(candidateLast)

  // Exact match (after normalization)
  if (sf === cf && sl === cl) return 1.0

  // Check nickname equivalence for first names
  const firstNicknameMatch = areNicknameEquivalent(sf, cf)
  const lastNicknameMatch = areNicknameEquivalent(sl, cl)

  // If both first and last are nickname matches, treat as exact match
  if (firstNicknameMatch && (sl === cl || lastNicknameMatch)) return 1.0

  // Score direct comparison
  // Use 1.0 for nickname matches, otherwise use Levenshtein similarity
  const directFirstScore = firstNicknameMatch ? 1.0 : similarityScore(sf, cf)
  const directLastScore = lastNicknameMatch ? 1.0 : similarityScore(sl, cl)
  const directScore = (directFirstScore + directLastScore) / 2

  // Score swapped comparison (in case names are in wrong order)
  const swappedFirstNickname = areNicknameEquivalent(sf, cl)
  const swappedLastNickname = areNicknameEquivalent(sl, cf)
  const swappedFirstScore = swappedFirstNickname ? 1.0 : similarityScore(sf, cl)
  const swappedLastScore = swappedLastNickname ? 1.0 : similarityScore(sl, cf)
  const swappedScore = (swappedFirstScore + swappedLastScore) / 2

  // Return the better of the two scores
  return Math.max(directScore, swappedScore)
}

export interface FuzzyMatchResult<T> {
  item: T
  score: number
}

/**
 * Find fuzzy matches for a name from a list of candidates.
 * Returns candidates sorted by match score (best first).
 */
export function findFuzzyNameMatches<T>(
  searchFirst: string,
  searchLast: string,
  candidates: T[],
  getFirstName: (item: T) => string,
  getLastName: (item: T) => string,
  options: { threshold?: number; maxResults?: number } = {}
): FuzzyMatchResult<T>[] {
  const { threshold = 0.5, maxResults = 10 } = options

  const scored = candidates
    .map(item => ({
      item,
      score: fuzzyNameScore(
        searchFirst,
        searchLast,
        getFirstName(item),
        getLastName(item)
      ),
    }))
    .filter(result => result.score >= threshold)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, maxResults)
}

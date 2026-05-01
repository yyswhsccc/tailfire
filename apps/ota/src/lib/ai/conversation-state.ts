/**
 * conversation-state.ts
 *
 * Rule-based extractor for structured facts from AI chat message history.
 * Pure logic module — no React, no API calls, no side effects.
 *
 * Usage:
 *   const facts = extractConversationFacts(messages)
 *   const context = formatConversationContext(facts)
 */

import type { UIMessage } from 'ai'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TravelDates {
  /** Raw textual expression from the user, e.g. "around November 2027" */
  raw: string
  /** ISO date string if a precise date could be parsed, e.g. "2027-11-01" */
  isoDate?: string
  /** True when the user used hedging language ("around", "ish", "maybe") */
  flexible: boolean
  /** The year, if extractable */
  year?: number
  /** Month number 1-12, if extractable */
  month?: number
}

export interface TravelerInfo {
  totalCount: number
  adults: number
  children: number
  /** Descriptive label, e.g. "couple", "family", "solo", "group" */
  groupType?: 'solo' | 'couple' | 'family' | 'group' | 'friends'
}

export type BudgetTier = 'budget' | 'mid-range' | 'luxury'

export interface BudgetInfo {
  tier: BudgetTier
  /** Raw dollar amount if mentioned (in dollars, not cents) */
  amountDollars?: number
}

export interface SearchPerformed {
  toolName: string
  destination?: string
  resultCount?: number
}

export interface BasketDecision {
  action: 'added' | 'removed'
  title?: string
  type?: string
  componentId?: string
}

export interface ConversationFacts {
  /** Departure / travel dates */
  dates?: TravelDates
  /** Who is travelling */
  travelers?: TravelerInfo
  /** IATA origin airport code, e.g. "YOW" */
  origin?: string
  /** Budget preference */
  budget?: BudgetInfo
  /** List of interest categories, e.g. ["beach", "food", "adventure"] */
  interests: string[]
  /** Travel style / trip purpose */
  travelStyle?: string
  /** Confirmed destination from lookupDestination tool (found: true only) */
  destination?: string
  /** Tools that have been called with their high-level result */
  searchesPerformed: SearchPerformed[]
  /** Basket changes tracked via manageTripBasket */
  decisionsm: BasketDecision[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
}

/** Canadian city name → primary IATA airport code */
const CITY_TO_IATA: Record<string, string> = {
  toronto: 'YYZ',
  montreal: 'YUL',
  'montréal': 'YUL',
  vancouver: 'YVR',
  calgary: 'YYC',
  edmonton: 'YEG',
  ottawa: 'YOW',
  winnipeg: 'YWG',
  halifax: 'YHZ',
  quebec: 'YQB',
  'québec': 'YQB',
  'quebec city': 'YQB',
  victoria: 'YYJ',
  london: 'YXU',
  windsor: 'YQG',
  'saint john': 'YSJ',
  'st. john\'s': 'YYT',
  'st johns': 'YYT',
  saskatoon: 'YXE',
  regina: 'YQR',
  kelowna: 'YLW',
  'thunder bay': 'YQT',
}

/** Interest keyword → canonical category */
const INTEREST_MAP: Record<string, string> = {
  // Beach / water
  beach: 'beach', beaches: 'beach', ocean: 'beach', coast: 'beach', coastal: 'beach', sea: 'beach',
  // Snorkeling / diving
  snorkel: 'snorkeling', snorkeling: 'snorkeling', snorkelling: 'snorkeling',
  dive: 'diving', diving: 'diving', scuba: 'diving',
  // Food
  food: 'food', cuisine: 'food', culinary: 'food', dining: 'food', restaurant: 'food', eat: 'food', eating: 'food',
  // Adventure
  adventure: 'adventure', hiking: 'adventure', trek: 'adventure', trekking: 'adventure',
  climbing: 'adventure', zipline: 'adventure', kayak: 'adventure', kayaking: 'adventure',
  // Relaxation / spa
  relax: 'relaxation', relaxation: 'relaxation', spa: 'relaxation', wellness: 'relaxation',
  peaceful: 'relaxation', tranquil: 'relaxation',
  // Culture / history
  culture: 'culture', cultural: 'culture', history: 'culture', historical: 'culture',
  museum: 'culture', art: 'culture', architecture: 'culture',
  // Nature / wildlife
  nature: 'nature', wildlife: 'nature', safari: 'nature', national: 'nature',
  jungle: 'nature', rainforest: 'nature', forest: 'nature',
  // Shopping
  shopping: 'shopping', shop: 'shopping', market: 'shopping',
  // Nightlife
  nightlife: 'nightlife', party: 'nightlife', club: 'nightlife', bar: 'nightlife',
  // Family / kids
  kids: 'family', children: 'family',
  // Romantic
  romantic: 'romantic', romance: 'romantic',
  // Skiing / snow
  ski: 'skiing', skiing: 'skiing', snowboard: 'skiing', snowboarding: 'skiing',
}

/** Travel style / purpose keywords → canonical label */
const TRAVEL_STYLE_MAP: Record<string, string> = {
  honeymoon: 'honeymoon',
  anniversary: 'anniversary',
  family: 'family vacation',
  'family vacation': 'family vacation',
  'girls trip': 'girls trip',
  'girls\' trip': 'girls trip',
  'girl trip': 'girls trip',
  'bachelorette': 'girls trip',
  solo: 'solo travel',
  'solo travel': 'solo travel',
  group: 'group trip',
  'group trip': 'group trip',
  corporate: 'corporate travel',
  business: 'business travel',
  retirement: 'retirement trip',
  graduation: 'graduation trip',
  'bucket list': 'bucket list',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a string to lower-case trimmed text */
function norm(s: string): string {
  return s.toLowerCase().trim()
}

/** Return all text content from user message parts */
function getUserText(msg: UIMessage): string {
  if (msg.role !== 'user') return ''
  return msg.parts
    .filter((p) => p.type === 'text')
    .map((p) => ('text' in p ? (p.text as string) : ''))
    .join(' ')
}

/** Extract tool parts from assistant messages */
function getToolParts(msg: UIMessage): Array<{
  toolName: string
  input: Record<string, unknown>
  output: Record<string, unknown>
}> {
  if (msg.role !== 'assistant') return []
  const result: Array<{ toolName: string; input: Record<string, unknown>; output: Record<string, unknown> }> = []
  for (const part of msg.parts) {
    // Tool parts have type like "tool-searchCruises", "tool-lookupDestination", etc.
    if (!part.type.startsWith('tool-')) continue
    // Only care about parts that have output available
    if (!('state' in part) || (part as any).state !== 'output-available') continue
    const toolName = part.type.slice('tool-'.length)
    const input = (part as any).input ?? {}
    const output = (part as any).output ?? {}
    result.push({ toolName, input, output })
  }
  return result
}

// ---------------------------------------------------------------------------
// Individual fact parsers
// ---------------------------------------------------------------------------

/** Parse travel dates from a user text string */
function parseDates(text: string): TravelDates | undefined {
  const lower = norm(text)

  // Flexible markers
  const flexMarkers = ['around', 'ish', 'maybe', 'approximately', 'roughly', 'sometime in', 'around the']
  const flexible = flexMarkers.some((m) => lower.includes(m))

  // ISO date pattern: 2026-11-15 or 2026/11/15
  const isoMatch = text.match(/\b(202\d|203\d)[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/)
  if (isoMatch) {
    const yr = isoMatch[1]!
    const mo = isoMatch[2]!
    const dy = isoMatch[3]!
    return {
      raw: isoMatch[0],
      isoDate: `${yr}-${mo}-${dy}`,
      flexible,
      year: parseInt(yr, 10),
      month: parseInt(mo, 10),
    }
  }

  // Month + year: "November 2027", "Nov 2027", "in March 2026"
  const monthYearPattern = new RegExp(
    `\\b(${Object.keys(MONTH_NAMES).join('|')})\\s+(202\\d|203\\d)\\b`,
    'i',
  )
  const myMatch = lower.match(monthYearPattern)
  if (myMatch) {
    const monthNum = MONTH_NAMES[myMatch[1]!.toLowerCase()] ?? 1
    const year = parseInt(myMatch[2]!, 10)
    return {
      raw: myMatch[0],
      isoDate: `${year}-${String(monthNum).padStart(2, '0')}-01`,
      flexible,
      year,
      month: monthNum,
    }
  }

  // Month only: "in November", "next March"
  const monthOnlyPattern = new RegExp(
    `\\b(?:in|next|this)?\\s*(${Object.keys(MONTH_NAMES).join('|')})\\b`,
    'i',
  )
  const moMatch = lower.match(monthOnlyPattern)
  if (moMatch) {
    const monthNum = MONTH_NAMES[moMatch[1]!.toLowerCase()]
    if (monthNum) {
      return {
        raw: moMatch[0].trim(),
        flexible,
        month: monthNum,
      }
    }
  }

  // Relative: "next summer", "this winter", "early January"
  const seasonMap: Record<string, { month: number }> = {
    spring: { month: 4 },
    summer: { month: 7 },
    fall: { month: 9 },
    autumn: { month: 9 },
    winter: { month: 12 },
  }
  for (const [season, info] of Object.entries(seasonMap)) {
    if (lower.includes(season)) {
      return { raw: `${season}`, flexible: true, month: info.month }
    }
  }

  return undefined
}

/** Parse traveler count from user text */
function parseTravelers(text: string): TravelerInfo | undefined {
  const lower = norm(text)

  // "my wife and I", "me and my husband", "me and my partner", "we two", "just the two of us"
  if (
    /\b(?:my (?:wife|husband|partner|spouse|boyfriend|girlfriend|fiancee?|fianc[eé]e?)|us two|two of us|couple)\b/.test(lower) ||
    /\bme and my (?:wife|husband|partner|spouse|boyfriend|girlfriend)\b/.test(lower)
  ) {
    return { totalCount: 2, adults: 2, children: 0, groupType: 'couple' }
  }

  // "solo", "just me", "travelling alone", "by myself"
  if (/\b(?:solo|just me|alone|by myself|travelling alone|traveling alone)\b/.test(lower)) {
    return { totalCount: 1, adults: 1, children: 0, groupType: 'solo' }
  }

  // "family of N"
  const familyOfMatch = lower.match(/family of (\d+)/)
  if (familyOfMatch) {
    const total = parseInt(familyOfMatch[1]!, 10)
    const adults = Math.max(2, Math.floor(total / 2))
    const children = total - adults
    return { totalCount: total, adults, children, groupType: 'family' }
  }

  // "N adults and M kids/children"
  const adultKidsMatch = lower.match(/(\d+)\s*adults?\s+and\s+(\d+)\s*(?:kids?|children|child)/)
  if (adultKidsMatch) {
    const adults = parseInt(adultKidsMatch[1]!, 10)
    const children = parseInt(adultKidsMatch[2]!, 10)
    return { totalCount: adults + children, adults, children, groupType: children > 0 ? 'family' : 'group' }
  }

  // "M kids/children and N adults"
  const kidsAdultMatch = lower.match(/(\d+)\s*(?:kids?|children|child)\s+and\s+(\d+)\s*adults?/)
  if (kidsAdultMatch) {
    const children = parseInt(kidsAdultMatch[1]!, 10)
    const adults = parseInt(kidsAdultMatch[2]!, 10)
    return { totalCount: adults + children, adults, children, groupType: 'family' }
  }

  // "N adults"
  const adultsMatch = lower.match(/(\d+)\s*adults?/)
  if (adultsMatch) {
    const adults = parseInt(adultsMatch[1]!, 10)
    return { totalCount: adults, adults, children: 0, groupType: adults > 2 ? 'group' : adults === 2 ? 'couple' : 'solo' }
  }

  // "N kids / children / people / travellers"
  const kidsMatch = lower.match(/(\d+)\s*(?:kids?|children|child)/)
  if (kidsMatch) {
    const children = parseInt(kidsMatch[1]!, 10)
    // Assume 2 adults if only kids count mentioned
    return { totalCount: 2 + children, adults: 2, children, groupType: 'family' }
  }

  // "N people / travellers / passengers / friends / of us"
  const groupMatch = lower.match(/(\d+)\s*(?:people|person|travell?ers?|passengers?|friends?|of us|pax)\b/)
  if (groupMatch) {
    const total = parseInt(groupMatch[1]!, 10)
    return { totalCount: total, adults: total, children: 0, groupType: total >= 5 ? 'group' : total === 2 ? 'couple' : total === 1 ? 'solo' : 'group' }
  }

  // "a group of N"
  const groupOfMatch = lower.match(/a?\s*group of (\d+)/)
  if (groupOfMatch) {
    const total = parseInt(groupOfMatch[1]!, 10)
    return { totalCount: total, adults: total, children: 0, groupType: 'group' }
  }

  return undefined
}

/** Parse origin airport code from user text */
function parseOrigin(text: string): string | undefined {
  const lower = norm(text)

  // Explicit IATA codes near "from": "flying from YOW", "departing from YYZ"
  const iataFromMatch = text.match(/\b(?:from|departing|flying from|leaving from)\s+([A-Z]{3})\b/)
  if (iataFromMatch) {
    return iataFromMatch[1]!.toUpperCase()
  }

  // Standalone IATA code pattern (3 uppercase letters) near travel prepositions
  const iataMatch = text.match(/\bfrom\s+([A-Z]{3})\b/)
  if (iataMatch) {
    return iataMatch[1]!.toUpperCase()
  }

  // Canadian city names near "from"
  for (const [city, code] of Object.entries(CITY_TO_IATA)) {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const cityPattern = new RegExp(`\\bfrom\\s+${escaped}\\b`, 'i')
    if (cityPattern.test(lower)) {
      return code
    }
  }

  // City names at start or standalone (less precise, lower priority)
  for (const [city, code] of Object.entries(CITY_TO_IATA)) {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // "based in Ottawa", "I'm in Toronto", "live in Vancouver"
    const livingPattern = new RegExp(`\\b(?:based in|living in|live in|i(?:'m| am) in|from)\\s+${escaped}\\b`, 'i')
    if (livingPattern.test(lower)) {
      return code
    }
  }

  return undefined
}

/** Parse budget info from user text */
function parseBudget(text: string): BudgetInfo | undefined {
  const lower = norm(text)

  // Dollar amount: $3,000 or $3000 or 3000 dollars
  const dollarMatch = text.match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)\s*[Kk]?/)
  if (dollarMatch) {
    let amount = parseFloat(dollarMatch[1]!.replace(/,/g, ''))
    if (dollarMatch[0].toLowerCase().endsWith('k')) amount *= 1000
    if (amount < 3000) {
      return { tier: 'budget', amountDollars: amount }
    } else if (amount < 7000) {
      return { tier: 'mid-range', amountDollars: amount }
    } else {
      return { tier: 'luxury', amountDollars: amount }
    }
  }

  // "Xk budget" e.g. "$5k" or "5k"
  const kMatch = text.match(/(\d+(?:\.\d+)?)\s*[Kk]\b/)
  if (kMatch) {
    const amount = parseFloat(kMatch[1]!) * 1000
    if (amount < 3000) {
      return { tier: 'budget', amountDollars: amount }
    } else if (amount < 7000) {
      return { tier: 'mid-range', amountDollars: amount }
    } else {
      return { tier: 'luxury', amountDollars: amount }
    }
  }

  // Keyword tiers
  if (/\b(?:budget|cheap|affordable|inexpensive|frugal|economical|backpack)\b/.test(lower)) {
    return { tier: 'budget' }
  }
  if (/\b(?:mid[- ]range|moderate|reasonable|average|standard|normal)\b/.test(lower)) {
    return { tier: 'mid-range' }
  }
  if (/\b(?:luxury|luxurious|high[- ]end|premium|first[- ]class|splurge|upscale|five[- ]star|5[- ]star|lavish|opulent)\b/.test(lower)) {
    return { tier: 'luxury' }
  }

  return undefined
}

/** Extract interests from user text — returns array of canonical categories */
function parseInterests(text: string): string[] {
  const lower = norm(text)
  const words = lower.split(/\W+/)
  const found = new Set<string>()

  // Check individual words
  for (const word of words) {
    if (INTEREST_MAP[word]) {
      found.add(INTEREST_MAP[word])
    }
  }

  // Check compound phrases
  for (const [phrase, category] of Object.entries(INTEREST_MAP)) {
    if (phrase.includes(' ') && lower.includes(phrase)) {
      found.add(category)
    }
  }

  return Array.from(found)
}

/** Extract travel style from user text */
function parseTravelStyle(text: string): string | undefined {
  const lower = norm(text)
  for (const [keyword, style] of Object.entries(TRAVEL_STYLE_MAP)) {
    if (lower.includes(keyword)) {
      return style
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Tool result parsers
// ---------------------------------------------------------------------------

/** Extract confirmed destination from lookupDestination tool result */
function extractDestinationFromTool(toolName: string, output: Record<string, unknown>): string | undefined {
  if (toolName !== 'lookupDestination') return undefined
  if (output.found !== true) return undefined
  const name = output.name
  if (typeof name === 'string' && name.trim()) {
    return name.trim()
  }
  return undefined
}

/** Build a SearchPerformed entry from tool invocation */
function buildSearchPerformed(
  toolName: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): SearchPerformed | undefined {
  const searchTools = [
    'searchFlights', 'searchHotels', 'searchCruises', 'browseTours', 'assemblePackage',
  ]
  if (!searchTools.includes(toolName)) return undefined

  const destination =
    (input.destination as string | undefined) ??
    (input.origin as string | undefined) ??
    undefined

  const resultCount =
    typeof output.resultCount === 'number' ? output.resultCount :
    typeof output.flights === 'object' && Array.isArray(output.flights) ? output.flights.length :
    typeof output.hotels === 'object' && Array.isArray(output.hotels) ? output.hotels.length :
    typeof output.cruises === 'object' && Array.isArray(output.cruises) ? output.cruises.length :
    typeof output.tours === 'object' && Array.isArray(output.tours) ? output.tours.length :
    undefined

  return { toolName, destination, resultCount }
}

/** Extract basket decisions from manageTripBasket tool result */
function buildBasketDecision(
  toolName: string,
  output: Record<string, unknown>,
): BasketDecision | undefined {
  if (toolName !== 'manageTripBasket') return undefined
  const action = output.action as string | undefined
  if (action === 'addToBasket') {
    const component = output.component as Record<string, unknown> | undefined
    const display = component?.display as Record<string, unknown> | undefined
    return {
      action: 'added',
      title: typeof display?.title === 'string' ? display.title : undefined,
      type: typeof component?.type === 'string' ? component.type : undefined,
      componentId: typeof component?.id === 'string' ? component.id : undefined,
    }
  }
  if (action === 'removeFromBasket') {
    return {
      action: 'removed',
      componentId: typeof output.componentId === 'string' ? output.componentId : undefined,
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

/**
 * Scan conversation message history and extract structured facts.
 *
 * Rules:
 * - Only user message text is parsed for dates, travelers, origin, budget, interests, travel style
 * - Only assistant tool parts (state: output-available) are parsed for tool results
 * - Facts grow incrementally — later messages override earlier ones (except interests which accumulate)
 */
export function extractConversationFacts(messages: UIMessage[]): ConversationFacts {
  const facts: ConversationFacts = {
    interests: [],
    searchesPerformed: [],
    decisionsm: [],
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      const text = getUserText(msg)
      if (!text.trim()) continue

      // Dates
      const dates = parseDates(text)
      if (dates) {
        facts.dates = dates
      }

      // Travelers
      const travelers = parseTravelers(text)
      if (travelers) {
        facts.travelers = travelers
      }

      // Origin
      const origin = parseOrigin(text)
      if (origin) {
        facts.origin = origin
      }

      // Budget
      const budget = parseBudget(text)
      if (budget) {
        facts.budget = budget
      }

      // Interests (accumulate, deduplicate)
      const newInterests = parseInterests(text)
      for (const interest of newInterests) {
        if (!facts.interests.includes(interest)) {
          facts.interests.push(interest)
        }
      }

      // Travel style
      const style = parseTravelStyle(text)
      if (style) {
        facts.travelStyle = style
      }
    } else if (msg.role === 'assistant') {
      const toolParts = getToolParts(msg)

      for (const { toolName, input, output } of toolParts) {
        // Destination from lookupDestination
        const destination = extractDestinationFromTool(toolName, output)
        if (destination) {
          facts.destination = destination
        }

        // Track searches
        const search = buildSearchPerformed(toolName, input, output)
        if (search) {
          facts.searchesPerformed.push(search)
        }

        // Track basket decisions
        const decision = buildBasketDecision(toolName, output)
        if (decision) {
          facts.decisionsm.push(decision)
        }
      }
    }
  }

  return facts
}

// ---------------------------------------------------------------------------
// Context formatter
// ---------------------------------------------------------------------------

/**
 * Format extracted facts into a system prompt block.
 * Returns empty string if no facts were extracted.
 */
export function formatConversationContext(facts: ConversationFacts): string {
  const lines: string[] = []

  if (facts.dates) {
    const d = facts.dates
    let dateStr = d.raw
    if (d.isoDate) dateStr += ` (${d.isoDate})`
    if (d.flexible) dateStr += ' [flexible]'
    lines.push(`Travel dates: ${dateStr}`)
  }

  if (facts.travelers) {
    const t = facts.travelers
    const parts: string[] = []
    if (t.groupType) parts.push(t.groupType)
    parts.push(`${t.totalCount} total`)
    if (t.children > 0) {
      parts.push(`${t.adults} adults, ${t.children} children`)
    } else {
      parts.push(`${t.adults} adults`)
    }
    lines.push(`Travelers: ${parts.join(' — ')}`)
  }

  if (facts.origin) {
    lines.push(`Departing from: ${facts.origin}`)
  }

  if (facts.budget) {
    const b = facts.budget
    let budgetStr = b.tier
    if (b.amountDollars !== undefined) {
      budgetStr += ` ($${b.amountDollars.toLocaleString('en-CA')})`
    }
    lines.push(`Budget: ${budgetStr}`)
  }

  if (facts.interests.length > 0) {
    lines.push(`Interests: ${facts.interests.join(', ')}`)
  }

  if (facts.travelStyle) {
    lines.push(`Travel style: ${facts.travelStyle}`)
  }

  if (facts.destination) {
    lines.push(`Confirmed destination: ${facts.destination}`)
  }

  if (facts.searchesPerformed.length > 0) {
    const searches = facts.searchesPerformed
      .map((s) => {
        let str = s.toolName
        if (s.destination) str += ` → ${s.destination}`
        if (s.resultCount !== undefined) str += ` (${s.resultCount} results)`
        return str
      })
      .join('; ')
    lines.push(`Searches done: ${searches}`)
  }

  if (facts.decisionsm.length > 0) {
    const decisions = facts.decisionsm
      .map((d) => {
        if (d.action === 'added') {
          let str = `added ${d.type ?? 'item'}`
          if (d.title) str += ` "${d.title}"`
          return str
        }
        return `removed item${d.componentId ? ` ${d.componentId}` : ''}`
      })
      .join('; ')
    lines.push(`Basket: ${decisions}`)
  }

  if (lines.length === 0) return ''

  return ['--- Conversation Context ---', ...lines, '--- End Context ---'].join('\n')
}

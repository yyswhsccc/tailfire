# AI Concierge Intelligence Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the AI concierge from a stateless search bot into a contextual travel advisor with knowledge lookup, conversation memory, and browsing awareness.

**Architecture:** Add 2 knowledge-lookup tools (`lookupDestination`, `lookupCruiseLineOrShip`) backed by existing API endpoints, a rule-based conversation fact extractor injected into the system prompt each turn, browsing history tracking via Zustand, richer page context passthrough, and a rewritten system prompt with a clear decision tree.

**Tech Stack:** AI SDK v6 + Anthropic Claude Sonnet 4, Next.js App Router, Zustand, Zod, existing NestJS API endpoints (no backend changes)

---

## File Structure

### New files
| File | Responsibility |
|------|----------------|
| `apps/ota/src/lib/ai/tools/lookup-destination.ts` | `lookupDestination` tool — two-step slug→detail or search→detail |
| `apps/ota/src/lib/ai/tools/lookup-cruise-line-or-ship.ts` | `lookupCruiseLineOrShip` tool — list→by-slug detail |
| `apps/ota/src/lib/ai/conversation-state.ts` | `extractConversationFacts()` — rule-based fact extractor |
| `apps/ota/src/lib/ai/__tests__/conversation-state.test.ts` | Unit tests for fact extractor |

### Modified files
| File | Change |
|------|--------|
| `apps/ota/src/lib/ai/tools.ts` | Register 2 new tools, add `shipId` to `searchCruises` |
| `apps/ota/src/app/api/chat/route.ts` | New system prompt, inject facts + browsing history, switch to Anthropic, bump stepCountIs to 8 |
| `apps/ota/src/stores/ai-panel-store.ts` | Add `browsingHistory` array + `addPageVisit()` action |
| `apps/ota/src/components/page-context-bridge.tsx` | Call `addPageVisit()` when entity pages load |
| `apps/ota/src/components/chat/chat-widget.tsx` | Stop flattening metadata, always send browsingHistory |
| `apps/ota/src/components/chat/chat-panel.tsx` | Hide internal lookup tools from UI |
| `apps/ota/src/app/cruise-lines/[slug]/page.tsx` | Forward metadata to HubScaffold |
| `apps/ota/src/app/ships/[slug]/page.tsx` | Forward metadata to HubScaffold |

---

### Task 1: Conversation State Extractor

**Files:**
- Create: `apps/ota/src/lib/ai/conversation-state.ts`
- Create: `apps/ota/src/lib/ai/__tests__/conversation-state.test.ts`

- [ ] **Step 1: Create the conversation-state module with types and empty function**

```typescript
// apps/ota/src/lib/ai/conversation-state.ts

import type { UIMessage } from 'ai'

export interface ConversationFacts {
  destination?: string
  dates?: { from?: string; to?: string; flexible?: boolean; description?: string }
  travelers?: { adults?: number; children?: number; description?: string }
  budget?: string
  interests: string[]
  travelStyle?: string
  origin?: string
  decisionsMade: string[]
  searchesPerformed: string[]
}

const EMPTY_FACTS: ConversationFacts = {
  interests: [],
  decisionsMade: [],
  searchesPerformed: [],
}

// Month names for date extraction
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december']
const MONTH_ABBREVS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']

// Interest keywords
const INTEREST_KEYWORDS: Record<string, string> = {
  beach: 'beach', beaches: 'beach', sand: 'beach',
  snorkel: 'snorkeling', snorkeling: 'snorkeling', diving: 'diving', scuba: 'diving',
  culture: 'culture', cultural: 'culture', history: 'history', historical: 'history', museum: 'culture',
  food: 'food', cuisine: 'food', culinary: 'food', restaurant: 'food', dining: 'food',
  adventure: 'adventure', hiking: 'adventure', trekking: 'adventure',
  relax: 'relaxation', relaxation: 'relaxation', spa: 'relaxation', unwind: 'relaxation',
  nightlife: 'nightlife', party: 'nightlife',
  shopping: 'shopping',
  wildlife: 'wildlife', safari: 'wildlife', nature: 'nature',
  family: 'family-friendly', kids: 'family-friendly', children: 'family-friendly',
  romantic: 'romantic', romance: 'romantic',
  'all-inclusive': 'all-inclusive', 'all inclusive': 'all-inclusive',
  luxury: 'luxury', premium: 'luxury', 'high-end': 'luxury',
}

// Travel style keywords
const STYLE_KEYWORDS: Record<string, string> = {
  honeymoon: 'honeymoon', 'honey moon': 'honeymoon',
  anniversary: 'anniversary',
  'family vacation': 'family vacation', 'family trip': 'family vacation',
  'girls trip': 'girls trip', 'guys trip': 'guys trip',
  'solo travel': 'solo travel', solo: 'solo travel',
  babymoon: 'babymoon',
  retirement: 'retirement trip',
  bachelor: 'bachelor/ette party', bachelorette: 'bachelor/ette party',
  'group trip': 'group trip', group: 'group trip',
}

// Budget keywords
const BUDGET_KEYWORDS: Record<string, string> = {
  budget: 'budget', cheap: 'budget', affordable: 'budget', 'low cost': 'budget',
  'mid-range': 'mid-range', moderate: 'mid-range', reasonable: 'mid-range',
  luxury: 'luxury', premium: 'luxury', splurge: 'luxury', 'high-end': 'luxury', upscale: 'luxury',
}

/**
 * Extract structured facts from the conversation history.
 * Rule-based — no AI inference, just pattern matching on user messages and tool results.
 * Only trusts explicit user messages and dedicated lookup tool outputs, not assistant text.
 */
export function extractConversationFacts(messages: UIMessage[]): ConversationFacts {
  const facts: ConversationFacts = { ...EMPTY_FACTS, interests: [], decisionsMade: [], searchesPerformed: [] }

  for (const msg of messages) {
    if (msg.role === 'user') {
      extractFromUserMessage(msg, facts)
    } else if (msg.role === 'assistant') {
      extractFromToolResults(msg, facts)
    }
  }

  return facts
}

function extractFromUserMessage(msg: UIMessage, facts: ConversationFacts): void {
  for (const part of msg.parts) {
    if (part.type !== 'text') continue
    const text = part.text.toLowerCase()

    // --- Dates ---
    // Match "in November", "November 2026", "next March", etc.
    for (let i = 0; i < MONTHS.length; i++) {
      const month = MONTHS[i]!
      const abbrev = MONTH_ABBREVS[i]!
      const monthRegex = new RegExp(`\\b(${month}|${abbrev})\\b`, 'i')
      if (monthRegex.test(text)) {
        const yearMatch = text.match(new RegExp(`${month}\\s+(\\d{4})`, 'i')) || text.match(new RegExp(`${abbrev}\\s+(\\d{4})`, 'i'))
        const capitalMonth = month.charAt(0).toUpperCase() + month.slice(1)
        facts.dates = {
          description: yearMatch ? `${capitalMonth} ${yearMatch[1]}` : capitalMonth,
          flexible: text.includes('flexible') || text.includes('around') || text.includes('ish'),
        }
        break
      }
    }

    // Match YYYY-MM-DD dates
    const isoDateMatch = text.match(/(\d{4}-\d{2}-\d{2})/g)
    if (isoDateMatch) {
      facts.dates = {
        from: isoDateMatch[0],
        to: isoDateMatch[1] ?? undefined,
        description: isoDateMatch.join(' to '),
      }
    }

    // --- Travelers ---
    // "my wife and I" / "me and my partner" / "just the two of us"
    if (/\b(my wife|my husband|my partner|my fiancé|my fiancée|just the two of us|couple)\b/i.test(text)) {
      facts.travelers = { adults: 2, description: 'couple' }
    }
    // "family of N"
    const familyMatch = text.match(/family\s+of\s+(\d+)/i)
    if (familyMatch) {
      const total = parseInt(familyMatch[1]!, 10)
      facts.travelers = { adults: Math.min(total, 2), children: Math.max(total - 2, 0), description: `family of ${total}` }
    }
    // "N adults" / "N people" / "N of us"
    const numMatch = text.match(/(\d+)\s+(?:adults?|people|of us|travelers?|passengers?|guests?)/i)
    if (numMatch && !facts.travelers) {
      facts.travelers = { adults: parseInt(numMatch[1]!, 10) }
    }
    // "N kids" / "N children"
    const kidsMatch = text.match(/(\d+)\s+(?:kids?|children)/i)
    if (kidsMatch) {
      facts.travelers = { ...facts.travelers, children: parseInt(kidsMatch[1]!, 10) }
    }

    // --- Origin ---
    // 3-letter uppercase airport codes near "from"
    const originMatch = text.match(/(?:from|departing|leaving|flying from|out of)\s+([A-Z]{3})\b/i)
    if (originMatch) {
      facts.origin = originMatch[1]!.toUpperCase()
    }
    // Common city names near "from"
    const cityOriginMatch = text.match(/(?:from|departing|leaving)\s+(toronto|montreal|vancouver|ottawa|calgary|edmonton|winnipeg|halifax|quebec city)/i)
    if (cityOriginMatch) {
      const cityAirports: Record<string, string> = {
        toronto: 'YYZ', montreal: 'YUL', vancouver: 'YVR', ottawa: 'YOW',
        calgary: 'YYC', edmonton: 'YEG', winnipeg: 'YWG', halifax: 'YHZ', 'quebec city': 'YQB',
      }
      facts.origin = cityAirports[cityOriginMatch[1]!.toLowerCase()] ?? cityOriginMatch[1]!.toUpperCase()
    }

    // --- Budget ---
    for (const [keyword, tier] of Object.entries(BUDGET_KEYWORDS)) {
      if (text.includes(keyword)) {
        facts.budget = tier
        break
      }
    }
    // Dollar amounts
    const dollarMatch = text.match(/\$\s?([\d,]+)/i)
    if (dollarMatch) {
      const amount = parseInt(dollarMatch[1]!.replace(/,/g, ''), 10)
      if (amount < 3000) facts.budget = 'budget'
      else if (amount < 8000) facts.budget = 'mid-range'
      else facts.budget = 'luxury'
    }

    // --- Interests ---
    for (const [keyword, interest] of Object.entries(INTEREST_KEYWORDS)) {
      if (text.includes(keyword) && !facts.interests.includes(interest)) {
        facts.interests.push(interest)
      }
    }

    // --- Travel Style ---
    for (const [keyword, style] of Object.entries(STYLE_KEYWORDS)) {
      if (text.includes(keyword)) {
        facts.travelStyle = style
        break
      }
    }
  }
}

function extractFromToolResults(msg: UIMessage, facts: ConversationFacts): void {
  for (const part of msg.parts) {
    if (!part.type.startsWith('tool-')) continue

    const toolName = part.type.replace(/^tool-/, '')
    const toolPart = part as { state?: string; output?: Record<string, unknown>; input?: Record<string, unknown> }
    if (toolPart.state !== 'output-available') continue

    const output = toolPart.output
    const input = toolPart.input

    // Track what searches were performed
    if (['searchCruises', 'searchFlights', 'searchHotels', 'browseTours'].includes(toolName)) {
      const resultCount = (output?.resultCount as number) ?? 0
      const dest = (input?.destination as string) ?? (input?.query as string) ?? ''
      facts.searchesPerformed.push(`${toolName.replace('search', '').replace('browse', '')}: ${dest} (${resultCount} results)`)
    }

    // Extract destination from lookup tool results (these are authoritative)
    if (toolName === 'lookupDestination' && output?.found) {
      facts.destination = (output.name as string) ?? facts.destination
    }

    // Track basket additions
    if (toolName === 'manageTripBasket' && output?.action === 'addToBasket') {
      const component = output.component as { display?: { title?: string } } | undefined
      const title = component?.display?.title
      if (title) {
        facts.decisionsMade.push(`Saved: ${title}`)
      }
    }
  }
}

/**
 * Format extracted facts into a compact string block for the system prompt.
 * Returns empty string if no facts have been extracted.
 */
export function formatConversationContext(facts: ConversationFacts): string {
  const lines: string[] = []

  if (facts.travelers) {
    const desc = facts.travelers.description
      ? facts.travelers.description
      : [
          facts.travelers.adults ? `${facts.travelers.adults} adult${facts.travelers.adults > 1 ? 's' : ''}` : '',
          facts.travelers.children ? `${facts.travelers.children} child${facts.travelers.children > 1 ? 'ren' : ''}` : '',
        ].filter(Boolean).join(', ')
    const style = facts.travelStyle ? `, ${facts.travelStyle}` : ''
    lines.push(`Traveler: ${desc}${style}`)
  } else if (facts.travelStyle) {
    lines.push(`Trip type: ${facts.travelStyle}`)
  }

  if (facts.destination) lines.push(`Destination interest: ${facts.destination}`)
  if (facts.dates?.description) {
    const flex = facts.dates.flexible ? ' (flexible)' : ''
    lines.push(`Travel dates: ${facts.dates.description}${flex}`)
  }
  if (facts.budget) lines.push(`Budget: ${facts.budget}`)
  if (facts.origin) lines.push(`Origin: ${facts.origin}`)
  if (facts.interests.length > 0) lines.push(`Preferences: ${facts.interests.join(', ')}`)
  if (facts.searchesPerformed.length > 0) lines.push(`Searches done: ${facts.searchesPerformed.join('; ')}`)
  if (facts.decisionsMade.length > 0) lines.push(`Basket: ${facts.decisionsMade.join('; ')}`)

  if (lines.length === 0) return ''
  return '\n\n--- Conversation Context ---\n' + lines.join('\n') + '\n--- End Context ---'
}
```

- [ ] **Step 2: Write unit tests for the fact extractor**

```typescript
// apps/ota/src/lib/ai/__tests__/conversation-state.test.ts

import { describe, it, expect } from 'vitest'
import { extractConversationFacts, formatConversationContext, type ConversationFacts } from '../conversation-state'
import type { UIMessage } from 'ai'

function userMsg(text: string): UIMessage {
  return { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] } as UIMessage
}

function assistantMsgWithTool(toolName: string, output: Record<string, unknown>, input?: Record<string, unknown>): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    parts: [
      { type: `tool-${toolName}`, state: 'output-available', toolCallId: crypto.randomUUID(), output, input },
    ],
  } as unknown as UIMessage
}

describe('extractConversationFacts', () => {
  it('extracts month from "in November"', () => {
    const facts = extractConversationFacts([userMsg('I want to travel in November')])
    expect(facts.dates?.description).toBe('November')
  })

  it('extracts month + year from "March 2027"', () => {
    const facts = extractConversationFacts([userMsg('Thinking about March 2027')])
    expect(facts.dates?.description).toBe('March 2027')
  })

  it('detects flexible dates', () => {
    const facts = extractConversationFacts([userMsg('around November sometime')])
    expect(facts.dates?.flexible).toBe(true)
  })

  it('extracts ISO dates', () => {
    const facts = extractConversationFacts([userMsg('from 2026-11-01 to 2026-11-15')])
    expect(facts.dates?.from).toBe('2026-11-01')
    expect(facts.dates?.to).toBe('2026-11-15')
  })

  it('extracts couple from "my wife and I"', () => {
    const facts = extractConversationFacts([userMsg('My wife and I want a beach vacation')])
    expect(facts.travelers).toEqual({ adults: 2, description: 'couple' })
  })

  it('extracts family from "family of 4"', () => {
    const facts = extractConversationFacts([userMsg('We are a family of 4')])
    expect(facts.travelers).toEqual({ adults: 2, children: 2, description: 'family of 4' })
  })

  it('extracts N adults', () => {
    const facts = extractConversationFacts([userMsg('3 adults traveling together')])
    expect(facts.travelers?.adults).toBe(3)
  })

  it('extracts airport code origin', () => {
    const facts = extractConversationFacts([userMsg('Flying from YOW to the Caribbean')])
    expect(facts.origin).toBe('YOW')
  })

  it('extracts city name origin', () => {
    const facts = extractConversationFacts([userMsg('Departing from Montreal')])
    expect(facts.origin).toBe('YUL')
  })

  it('extracts budget tier from keyword', () => {
    const facts = extractConversationFacts([userMsg('Looking for something affordable')])
    expect(facts.budget).toBe('budget')
  })

  it('extracts budget tier from dollar amount', () => {
    const facts = extractConversationFacts([userMsg('Budget is around $5,000')])
    expect(facts.budget).toBe('mid-range')
  })

  it('extracts interests', () => {
    const facts = extractConversationFacts([userMsg('I love snorkeling and food tours')])
    expect(facts.interests).toContain('snorkeling')
    expect(facts.interests).toContain('food')
  })

  it('extracts travel style', () => {
    const facts = extractConversationFacts([userMsg('Planning our honeymoon')])
    expect(facts.travelStyle).toBe('honeymoon')
  })

  it('extracts destination from lookupDestination tool result', () => {
    const facts = extractConversationFacts([
      userMsg('Tell me about Jamaica'),
      assistantMsgWithTool('lookupDestination', { found: true, name: 'Jamaica', slug: 'jamaica' }),
    ])
    expect(facts.destination).toBe('Jamaica')
  })

  it('tracks searches performed', () => {
    const facts = extractConversationFacts([
      userMsg('Show me Caribbean cruises'),
      assistantMsgWithTool('searchCruises', { resultCount: 5 }, { destination: 'Caribbean' }),
    ])
    expect(facts.searchesPerformed).toHaveLength(1)
    expect(facts.searchesPerformed[0]).toContain('Caribbean')
  })

  it('tracks basket additions', () => {
    const facts = extractConversationFacts([
      assistantMsgWithTool('manageTripBasket', {
        action: 'addToBasket',
        component: { display: { title: 'Royal Caribbean 7-Night Cruise' } },
      }),
    ])
    expect(facts.decisionsMade).toContain('Saved: Royal Caribbean 7-Night Cruise')
  })

  it('accumulates facts across multiple messages', () => {
    const facts = extractConversationFacts([
      userMsg('My wife and I want a honeymoon'),
      userMsg('We are thinking November'),
      userMsg('Flying from Toronto'),
      userMsg('We love beach and snorkeling'),
    ])
    expect(facts.travelers?.description).toBe('couple')
    expect(facts.travelStyle).toBe('honeymoon')
    expect(facts.dates?.description).toBe('November')
    expect(facts.origin).toBe('YYZ')
    expect(facts.interests).toContain('beach')
    expect(facts.interests).toContain('snorkeling')
  })
})

describe('formatConversationContext', () => {
  it('returns empty string when no facts', () => {
    const facts: ConversationFacts = { interests: [], decisionsMade: [], searchesPerformed: [] }
    expect(formatConversationContext(facts)).toBe('')
  })

  it('formats all fields into a prompt block', () => {
    const facts: ConversationFacts = {
      destination: 'Jamaica',
      dates: { description: 'November 2026', flexible: true },
      travelers: { adults: 2, description: 'couple' },
      budget: 'mid-range',
      interests: ['beach', 'snorkeling'],
      travelStyle: 'honeymoon',
      origin: 'YYZ',
      decisionsMade: ['Saved: Royal Caribbean Cruise'],
      searchesPerformed: ['Cruises: Caribbean (5 results)'],
    }
    const result = formatConversationContext(facts)
    expect(result).toContain('--- Conversation Context ---')
    expect(result).toContain('Traveler: couple, honeymoon')
    expect(result).toContain('Destination interest: Jamaica')
    expect(result).toContain('Travel dates: November 2026 (flexible)')
    expect(result).toContain('Budget: mid-range')
    expect(result).toContain('Origin: YYZ')
    expect(result).toContain('Preferences: beach, snorkeling')
  })
})
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `cd apps/ota && npx vitest run src/lib/ai/__tests__/conversation-state.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/lib/ai/conversation-state.ts apps/ota/src/lib/ai/__tests__/conversation-state.test.ts
git commit -m "feat(ota): add conversation state extractor with unit tests"
```

---

### Task 2: lookupDestination Tool

**Files:**
- Create: `apps/ota/src/lib/ai/tools/lookup-destination.ts`
- Modify: `apps/ota/src/lib/ai/tools.ts`

- [ ] **Step 1: Create the lookupDestination tool**

```typescript
// apps/ota/src/lib/ai/tools/lookup-destination.ts

import { tool } from 'ai'
import { z } from 'zod'
import { publicFetch } from '@/lib/api'
import type { DestinationDetail, DestinationSummary } from '@/types/entities'

/**
 * AI tool: Look up enriched destination data from our database.
 * Two-step: try slug match first, then name search → detail.
 * Returns curated travel content (highlights, best months, tips, etc.)
 * or a fallback message if the destination isn't in our system.
 */
export const lookupDestination = tool({
  description:
    'Look up detailed information about a travel destination from our curated database. Use this BEFORE answering any question about a place — it returns highlights, best months, travel tips, budget info, and more. Always call this when a user mentions a destination you haven\'t looked up yet in this conversation.',
  inputSchema: z.object({
    query: z.string().describe('Destination name or slug (e.g., "Jamaica", "santorini-greece", "Bali")'),
  }),
  execute: async ({ query }) => {
    try {
      // Step 1: Try exact slug match (most reliable)
      const slugified = query.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      let detail: DestinationDetail | null = null

      try {
        detail = await publicFetch<DestinationDetail>(`/destinations/by-slug/${slugified}`)
      } catch {
        // Not found by slug — try name search
      }

      // Step 2: Name search fallback → then fetch detail
      if (!detail) {
        try {
          const searchResult = await publicFetch<{
            destinations: DestinationSummary[]
            total: number
          }>(`/destinations?search=${encodeURIComponent(query)}&pageSize=3`)

          const best = searchResult.destinations?.[0]
          if (best) {
            detail = await publicFetch<DestinationDetail>(`/destinations/by-slug/${best.slug}`)
          }
        } catch {
          // Search failed — fall through to not-found
        }
      }

      if (!detail) {
        return {
          found: false as const,
          query,
          suggestion: `I don't have detailed info on "${query}" in our system yet. I can share what I know from general travel knowledge, or connect you with an advisor who might have insider tips.`,
        }
      }

      // Extract enriched metadata
      const meta = (detail.metadata ?? {}) as Record<string, unknown>
      const enrichment = detail.enrichment

      return {
        found: true as const,
        name: detail.name,
        slug: detail.slug,
        type: detail.destinationType,
        countryCode: detail.countryCode,
        oneLiner: (meta.oneLiner as string) ?? null,
        highlights: (meta.highlights as string[]) ?? [],
        bestMonths: (meta.bestMonths as string[]) ?? [],
        budgetTier: (meta.budgetTier as string) ?? null,
        typicalStay: (meta.typicalStay as string) ?? null,
        travelTips: (meta.travelTips as string[]) ?? [],
        tags: (meta.tags as string[]) ?? [],
        vibeWords: (meta.vibeWords as string[]) ?? [],
        currency: meta.currencyName ? `${meta.currency} (${meta.currencyName})` : (meta.currency as string) ?? null,
        languages: (meta.languages as string[]) ?? [],
        airportIata: (meta.airportIata as string) ?? null,
        travelDescription: (meta.travelDescription as string) ?? null,
        rating: enrichment?.averageRating ?? null,
        reviewCount: enrichment?.totalReviewCount ?? null,
        cruiseCount: detail.stats?.cruiseCount ?? 0,
        tourCount: detail.stats?.tourCount ?? 0,
      }
    } catch {
      return {
        found: false as const,
        query,
        suggestion: 'I had trouble looking that up. Let me try answering from what I know, or I can connect you with an advisor.',
      }
    }
  },
})
```

- [ ] **Step 2: Register the tool in tools.ts**

Add to imports at the top of `apps/ota/src/lib/ai/tools.ts`:

```typescript
import { lookupDestination } from '@/lib/ai/tools/lookup-destination'
```

Add to the return object of `createTools()` at the bottom (line ~561):

```typescript
  return {
    lookupDestination,
    searchFlights,
    searchHotels,
    searchCruises,
    browseTours,
    assemblePackage,
    captureContact,
    manageTripBasket,
    captureIdentity,
    requestAdvisor,
  }
```

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/lib/ai/tools/lookup-destination.ts apps/ota/src/lib/ai/tools.ts
git commit -m "feat(ota): add lookupDestination knowledge tool"
```

---

### Task 3: lookupCruiseLineOrShip Tool + shipId on searchCruises

**Files:**
- Create: `apps/ota/src/lib/ai/tools/lookup-cruise-line-or-ship.ts`
- Modify: `apps/ota/src/lib/ai/tools.ts`

- [ ] **Step 1: Create the lookupCruiseLineOrShip tool**

```typescript
// apps/ota/src/lib/ai/tools/lookup-cruise-line-or-ship.ts

import { tool } from 'ai'
import { z } from 'zod'
import { catalogFetch } from '@/lib/api'
import type { CruiseLine, CruiseLineDetail, ShipSummary, ShipDetail } from '@/types/entities'

/**
 * AI tool: Look up cruise line or ship details from our catalog.
 * Searches lines and ships by name, returns rich detail from by-slug endpoints.
 */
export const lookupCruiseLineOrShip = tool({
  description:
    'Look up information about a cruise line or ship from our catalog. Returns fleet details, ship specs, sailing counts, and more. Use this BEFORE answering questions about cruise lines or specific ships.',
  inputSchema: z.object({
    query: z.string().describe('Cruise line or ship name (e.g., "Royal Caribbean", "Symphony of the Seas")'),
    type: z.enum(['line', 'ship']).optional().describe('Optional hint — "line" for cruise line, "ship" for ship. If omitted, searches both.'),
  }),
  execute: async ({ query, type }) => {
    const queryLower = query.toLowerCase()

    try {
      // Try cruise lines first (unless type is "ship")
      if (type !== 'ship') {
        try {
          const lines = await catalogFetch<CruiseLine[]>('/cruise-repository/lines')
          const match = lines.find((l) =>
            l.name.toLowerCase().includes(queryLower) || queryLower.includes(l.name.toLowerCase())
          )
          if (match) {
            const detail = await catalogFetch<CruiseLineDetail>(`/cruise-repository/lines/by-slug/${match.slug}`)
            return {
              found: true as const,
              type: 'cruise_line' as const,
              name: detail.name,
              slug: detail.slug,
              logoUrl: detail.logoUrl,
              shipCount: detail.shipCount,
              ships: detail.ships.map((s) => ({ name: s.name, slug: s.slug, shipClass: s.shipClass })),
              sailingCount: detail.sailingCount,
              upcomingSailingCount: detail.upcomingSailingCount,
            }
          }
        } catch {
          // Lines fetch failed — try ships
        }
      }

      // Try ships (unless type is "line")
      if (type !== 'line') {
        try {
          const ships = await catalogFetch<ShipSummary[]>('/cruise-repository/ships')
          const match = ships.find((s) =>
            s.name.toLowerCase().includes(queryLower) || queryLower.includes(s.name.toLowerCase())
          )
          if (match) {
            const detail = await catalogFetch<ShipDetail>(`/cruise-repository/ships/by-slug/${match.slug}`)
            return {
              found: true as const,
              type: 'ship' as const,
              name: detail.name,
              slug: detail.slug,
              cruiseLine: detail.cruiseLine.name,
              cruiseLineSlug: detail.cruiseLine.slug,
              imageUrl: detail.imageUrl,
              shipClass: detail.shipClass,
              yearBuilt: detail.yearBuilt,
              passengerCapacity: detail.passengerCapacity,
              tonnage: detail.tonnage,
              crewCount: detail.crewCount,
              amenities: detail.amenities,
              upcomingSailings: detail.upcomingSailingCount,
            }
          }
        } catch {
          // Ships fetch failed
        }
      }

      return {
        found: false as const,
        query,
        suggestion: `I couldn't find "${query}" in our cruise catalog. Could you double-check the spelling, or would you like me to show you what cruise lines we have?`,
      }
    } catch {
      return {
        found: false as const,
        query,
        suggestion: 'I had trouble looking that up. Let me try a different approach, or I can connect you with an advisor.',
      }
    }
  },
})
```

- [ ] **Step 2: Register tool and add shipId to searchCruises**

Add import at the top of `apps/ota/src/lib/ai/tools.ts`:

```typescript
import { lookupCruiseLineOrShip } from '@/lib/ai/tools/lookup-cruise-line-or-ship'
```

In the `searchCruises` tool definition (around line 204), add `shipId` to the input schema:

```typescript
    inputSchema: z.object({
      destination: z.string().optional().describe('Cruise destination region (e.g. Caribbean, Mediterranean)'),
      departureDate: z.string().optional().describe('Earliest departure date in YYYY-MM-DD format'),
      returnDate: z.string().optional().describe('Latest return date in YYYY-MM-DD format'),
      cruiseLine: z.string().optional().describe('Cruise line name (e.g. Royal Caribbean, Celebrity)'),
      shipId: z.string().optional().describe('Ship UUID from lookupCruiseLineOrShip to search sailings for a specific ship'),
      passengers: z.number().optional().describe('Number of passengers'),
    }),
```

In the execute function destructuring, add `shipId`:

```typescript
    execute: async ({ destination, departureDate, returnDate, cruiseLine, shipId }) => {
```

In the `buildQuery` call, add `shipId`:

```typescript
        const qs = buildQuery({
          ...(departureDate && { sailDateFrom: departureDate }),
          ...(returnDate && { sailDateTo: returnDate }),
          ...(cruiseLineId && { cruiseLineId }),
          ...(regionId && { regionId }),
          ...(shipId && { shipId }),
          ...(!cruiseLineId && !regionId && destination && { q: destination }),
          page: 1,
          pageSize: 5,
        })
```

Add `lookupCruiseLineOrShip` to the return object:

```typescript
  return {
    lookupDestination,
    lookupCruiseLineOrShip,
    searchFlights,
    // ... rest unchanged
  }
```

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/lib/ai/tools/lookup-cruise-line-or-ship.ts apps/ota/src/lib/ai/tools.ts
git commit -m "feat(ota): add lookupCruiseLineOrShip tool, add shipId to searchCruises"
```

---

### Task 4: Browsing History in Zustand + PageContextBridge

**Files:**
- Modify: `apps/ota/src/stores/ai-panel-store.ts`
- Modify: `apps/ota/src/components/page-context-bridge.tsx`

- [ ] **Step 1: Add browsingHistory to the Zustand store**

In `apps/ota/src/stores/ai-panel-store.ts`, add the `BrowsingHistoryEntry` type, the `browsingHistory` state, and the `addPageVisit` action.

Add after the `JourneyItem` interface (around line 19):

```typescript
interface BrowsingHistoryEntry {
  type: string
  name: string
  slug: string
  timestamp: number
}
```

Add to `AiPanelState` interface (around line 31):

```typescript
  browsingHistory: BrowsingHistoryEntry[]
  addPageVisit: (entry: Omit<BrowsingHistoryEntry, 'timestamp'>) => void
```

Add to the `create` initializer (around line 50):

```typescript
  browsingHistory: [],

  addPageVisit: ({ type, slug, name }) =>
    set((s) => {
      // Remove existing entry with same type+slug (dedup)
      const filtered = s.browsingHistory.filter(
        (e) => !(e.type === type && e.slug === slug),
      )
      // Add to front, cap at 10
      return {
        browsingHistory: [{ type, slug, name, timestamp: Date.now() }, ...filtered].slice(0, 10),
      }
    }),
```

- [ ] **Step 2: Update PageContextBridge to record browsing history**

In `apps/ota/src/components/page-context-bridge.tsx`, import `addPageVisit` and call it in the useEffect:

```typescript
'use client'

import { useEffect } from 'react'
import { useAiPanelStore } from '@/stores/ai-panel-store'

interface PageContextBridgeProps {
  type: string
  slug: string
  name: string
  parentContext?: { type: string; slug: string; name: string }
  metadata?: Record<string, unknown>
}

export function PageContextBridge({ type, slug, name, parentContext, metadata }: PageContextBridgeProps) {
  const setPageContext = useAiPanelStore((s) => s.setPageContext)
  const clearPageContext = useAiPanelStore((s) => s.clearPageContext)
  const addPageVisit = useAiPanelStore((s) => s.addPageVisit)

  useEffect(() => {
    setPageContext({ type, slug, name, parentContext, metadata })
    addPageVisit({ type, slug, name })
    return () => clearPageContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, slug, name, parentContext, setPageContext, clearPageContext, addPageVisit])

  return null
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/stores/ai-panel-store.ts apps/ota/src/components/page-context-bridge.tsx
git commit -m "feat(ota): add browsing history tracking to AI panel store"
```

---

### Task 5: Richer Page Context + Browsing History in Chat Widget

**Files:**
- Modify: `apps/ota/src/components/chat/chat-widget.tsx`

- [ ] **Step 1: Stop flattening metadata, always send browsingHistory**

Replace the entire `currentPageContext` type and the `contextFetch` function and the `useEffect` sync block in `apps/ota/src/components/chat/chat-widget.tsx`:

The module-level ref (lines 15-27) should pass full metadata:

```typescript
let currentPageContext: Record<string, unknown> | undefined;
let currentBrowsingHistory: Array<{ type: string; name: string; slug: string }> = [];
```

The custom fetch (lines 30-41) should always inject both:

```typescript
const contextFetch: typeof globalThis.fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const parsed = JSON.parse(init.body);
      if (currentPageContext) parsed.pageContext = currentPageContext;
      if (currentBrowsingHistory.length > 0) parsed.browsingHistory = currentBrowsingHistory;
      init = { ...init, body: JSON.stringify(parsed) };
    } catch {
      // Not JSON — send as-is
    }
  }
  return globalThis.fetch(input, init);
};
```

The useEffect sync (lines 70-93) should pass full metadata without flattening:

```typescript
  // Sync page context and browsing history to module-level refs for the custom fetch
  const browsingHistory = useAiPanelStore((s) => s.browsingHistory);

  useEffect(() => {
    if (!pageContext) {
      currentPageContext = undefined;
      return;
    }
    // Pass full metadata through — no flattening
    currentPageContext = {
      type: pageContext.type,
      name: pageContext.name,
      slug: pageContext.slug,
      metadata: pageContext.metadata,
    };
  }, [pageContext]);

  useEffect(() => {
    // Exclude current page from browsing history (it's already in pageContext)
    currentBrowsingHistory = browsingHistory
      .filter((e) => !(pageContext && e.type === pageContext.type && e.slug === pageContext.slug))
      .map(({ type, name, slug }) => ({ type, name, slug }));
  }, [browsingHistory, pageContext]);
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/components/chat/chat-widget.tsx
git commit -m "feat(ota): pass full metadata + browsing history through chat widget"
```

---

### Task 6: Hide Internal Tools in Chat Panel

**Files:**
- Modify: `apps/ota/src/components/chat/chat-panel.tsx`

- [ ] **Step 1: Add INTERNAL_TOOLS set and filter them from rendering**

In `apps/ota/src/components/chat/chat-panel.tsx`, add after the `SEARCH_TOOLS` set (around line 30):

```typescript
/** Tool names whose UI is hidden entirely — the AI's filler text provides feedback */
const INTERNAL_TOOLS = new Set([
  'lookupDestination',
  'lookupCruiseLineOrShip',
]);
```

In the part-splitting logic (around line 138-153), add a filter to skip internal tools entirely:

```typescript
          message.parts.forEach((part, idx) => {
            if (part.type.startsWith("tool-")) {
              const toolName = part.type.replace(/^tool-/, "");

              // Internal knowledge tools are hidden from the UI entirely
              if (INTERNAL_TOOLS.has(toolName)) return;

              const state = (part as { state?: string }).state;
              const output = (part as { output?: unknown }).output;
              if (
                state === "output-available" &&
                output &&
                SEARCH_TOOLS.has(toolName)
              ) {
                cardParts.push({ part, idx });
                return;
              }
            }
            inlineParts.push({ part, idx });
          });
```

Also add the tool labels for the new tools (for fallback, even though they should be hidden):

```typescript
const TOOL_LABELS: Record<string, string> = {
  lookupDestination: "destination info",
  lookupCruiseLineOrShip: "cruise info",
  searchFlights: "flights",
  // ... rest unchanged
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/ota/src/components/chat/chat-panel.tsx
git commit -m "feat(ota): hide internal knowledge tools from chat UI"
```

---

### Task 7: Metadata Forwarding for Cruise-Line and Ship Pages

**Files:**
- Modify: `apps/ota/src/app/cruise-lines/[slug]/page.tsx`
- Modify: `apps/ota/src/app/ships/[slug]/page.tsx`

- [ ] **Step 1: Forward metadata on cruise-line page**

In `apps/ota/src/app/cruise-lines/[slug]/page.tsx`, add a derived metadata object to the `HubScaffold` call (around line 37-44):

```typescript
  const metadata: Record<string, unknown> = {
    shipCount: line.shipCount,
    sailingCount: line.sailingCount,
    ships: line.ships?.map((s: { name: string }) => s.name) ?? [],
    logoUrl: line.logoUrl,
  }

  return (
    <HubScaffold
      hero={cruiseLineAdapter.heroData(line)}
      contextPills={cruiseLineAdapter.contextPills(line)}
      sections={cruiseLineAdapter.sections(line)}
      aiContext={cruiseLineAdapter.aiContext(line)}
      entityType="cruise_line"
      entitySlug={slug}
      metadata={metadata}
    />
  )
```

- [ ] **Step 2: Forward metadata on ship page**

In `apps/ota/src/app/ships/[slug]/page.tsx`, add a derived metadata object to the `HubScaffold` call (around line 48-57):

```typescript
  const metadata: Record<string, unknown> = {
    cruiseLine: ship.cruiseLine.name,
    shipClass: ship.shipClass,
    yearBuilt: ship.yearBuilt,
    passengerCapacity: ship.passengerCapacity,
    tonnage: ship.tonnage,
    crewCount: ship.crewCount,
    amenities: ship.amenities,
    upcomingSailings: ship.upcomingSailingCount,
  }

  return (
    <HubScaffold
      hero={shipAdapter.heroData(ship)}
      contextPills={shipAdapter.contextPills(ship)}
      sections={sections}
      aiContext={shipAdapter.aiContext(ship)}
      entityType="ship"
      entitySlug={slug}
      metadata={metadata}
    />
  )
```

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/app/cruise-lines/[slug]/page.tsx apps/ota/src/app/ships/[slug]/page.tsx
git commit -m "feat(ota): forward metadata to AI context for cruise-line and ship pages"
```

---

### Task 8: System Prompt Rewrite + Route Integration

**Files:**
- Modify: `apps/ota/src/app/api/chat/route.ts`

This is the final integration task — wires everything together.

- [ ] **Step 1: Rewrite the entire route.ts**

Replace the full contents of `apps/ota/src/app/api/chat/route.ts`:

```typescript
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import { cookies } from 'next/headers'
import { anthropic } from '@ai-sdk/anthropic'
import { createTools } from '@/lib/ai/tools'
import { serviceFetch } from '@/lib/api'
import { chatRateLimit } from '@/lib/rate-limit'
import { extractConversationFacts, formatConversationContext } from '@/lib/ai/conversation-state'

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------

function resolveModel() {
  const modelId = process.env.AI_MODEL_ID ?? 'claude-sonnet-4-20250514'
  return anthropic(modelId)
}

// ---------------------------------------------------------------------------
// System prompt — structured hierarchy with decision tree
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT = `You are the Phoenix Voyages AI Travel Concierge — a warm, knowledgeable travel advisor who helps people dream, explore, and plan trips.

## 1. Your personality
- You're like a well-traveled friend who happens to know everything about cruises, flights, and destinations.
- Warm but not sycophantic. Knowledgeable but not lecturing. Enthusiastic but not salesy.
- You represent a premium Canadian travel agency — professional yet personal.
- Use natural language, not bullet-point lists. Write like you're texting a friend, not writing a report.
- Prices are in CAD. You're based in Ontario, Canada. TICO-registered.

## 2. Knowledge protocol
- Before answering ANY question about a destination, cruise line, or ship — check your Conversation Context and Current Page context first.
- If the answer isn't there, call the relevant lookup tool (lookupDestination or lookupCruiseLineOrShip).
- While the lookup runs, say something warm: "Ooh, great question — let me pull up what we know about that..." or "One sec, let me check on that for you..."
- Ground ALL destination/cruise answers in our data first. If our data doesn't cover it, supplement with general knowledge naturally.
- If the question is about something we SHOULD have and don't, say so honestly and offer to connect with an advisor.
- NEVER fabricate specific data (prices, dates, availability) — only share what your tools return.

## 3. Conversation state
- Read the Conversation Context block carefully every turn. It contains facts extracted from earlier in this conversation.
- NEVER ask for information that's already in the Conversation Context.
- If you know their dates, don't ask when they're traveling. If you know they're a couple, don't ask how many.
- New facts the user shares will appear in the next turn's context automatically.

## 4. Tool decision tree
- User mentions a DESTINATION → call lookupDestination FIRST, then searchCruises with the destination
- User mentions a DESTINATION + DATES → lookupDestination + searchCruises (and searchFlights + searchHotels if you have origin airport)
- User asks about a cruise line or ship → call lookupCruiseLineOrShip
- User asks about tours/activities → call browseTours
- User says "book", "advisor", or "talk to someone" → call requestAdvisor (collect email first)
- User expresses interest in a result → call manageTripBasket to save it
- NEVER call searchFlights without an origin airport AND departure date
- NEVER call searchHotels without check-in AND check-out dates
- You CAN call multiple tools in one turn when you have enough info for each

## 5. Conversational filler
- When calling a lookup or search tool, always lead with a brief warm phrase BEFORE the tool call
- Examples: "Ooh, Jamaica — let me see what we've got..." / "Great choice! Let me pull up the details..." / "On it! Give me one sec..."
- NEVER say "I'm searching the database" or "Let me call the API" or "Checking our system"
- Keep it natural and human

## 6. Context awareness
- If the user has browsing history, reference it naturally: "I see you've been exploring the Mediterranean..."
- If they have items in their basket, build on that: "Since you've already saved that Caribbean cruise..."
- If they're on an entity page, reference it: "Since you're looking at Jamaica right now..."
- If on an advisor page, use the advisor's name and route all leads to them

## 7. One thing at a time
- NEVER ask multiple questions in one message. Ask ONE question, wait for the answer, then build on it.
- Keep responses to 2-3 sentences max unless presenting search results.
- Let the conversation flow naturally. Each message should feel like a single thought, not a questionnaire.

## 8. What NOT to do
- Don't dump all your capabilities in the first message
- Don't ask "How can I help you today?" — be contextual based on browsing history and page context
- Don't present results as numbered lists with every spec. Pick the highlights.
- Don't caveat every price with "prices are estimates" — say it once, lightly
- Don't push advisor connection too early — let them explore first
- Don't explain your capabilities upfront. Show, don't tell.`

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    // Rate limiting
    if (chatRateLimit) {
      const ip =
        request.headers.get('x-forwarded-for') ??
        request.headers.get('x-real-ip') ??
        'unknown'
      const { success, limit, remaining, reset } = await chatRateLimit.limit(ip)
      if (!success) {
        return Response.json(
          { error: 'Too many messages. Please wait a moment before trying again.' },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(reset),
            },
          },
        )
      }
      console.log('[api/chat] rate-limit ok', { ip, remaining, limit })
    }

    const body = await request.json()
    const rawMessages = body.messages as any[]

    // Normalize messages — handle both v5 (content) and v6 (parts) format
    const messages: UIMessage[] = rawMessages?.map((m: any) => {
      if (m.parts) return m
      return {
        ...m,
        parts: m.content ? [{ type: 'text', text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] : [],
      }
    }) ?? []

    const pageContext: Record<string, unknown> | undefined = body.pageContext
    const browsingHistory: Array<{ type: string; name: string; slug: string }> | undefined = body.browsingHistory

    // Read cookies for advisor attribution and session context
    const cookieStore = await cookies()
    const refCookie = cookieStore.get('ota_ref')?.value
    const sessionId = cookieStore.get('ota_session')?.value

    // Create tools with context (advisor slug for lead attribution)
    const tools = createTools({ advisorSlug: refCookie })

    // -----------------------------------------------------------------------
    // 1. Extract conversation facts
    // -----------------------------------------------------------------------
    const facts = extractConversationFacts(messages)
    const conversationContext = formatConversationContext(facts)

    // -----------------------------------------------------------------------
    // 2. Build browsing history context
    // -----------------------------------------------------------------------
    let browsingContext = ''
    if (browsingHistory && browsingHistory.length > 0) {
      const items = browsingHistory.map((e) => `${e.name} (${e.type})`).join(', ')
      browsingContext = `\n\n--- Browsing History ---\nRecently viewed: ${items}\n--- End Browsing ---`
    }

    // -----------------------------------------------------------------------
    // 3. Build basket context
    // -----------------------------------------------------------------------
    let basketContext = ''
    if (sessionId) {
      try {
        const drafts = await serviceFetch<
          Array<{
            id: string
            title?: string
            components?: Array<{
              id: string
              type: string
              display?: { title?: string; price?: string }
            }>
          }>
        >(`/ota/trip-requests/by-session/${sessionId}`)

        if (drafts && drafts.length > 0) {
          const lines: string[] = ['\n\n--- Trip Basket ---']
          for (const draft of drafts) {
            const title = draft.title || 'Untitled Trip'
            const components = draft.components ?? []
            lines.push(`Trip: "${title}" (${components.length} item${components.length === 1 ? '' : 's'})`)
            for (const c of components) {
              const label = c.display?.title ?? c.type
              const price = c.display?.price ? ` — ${c.display.price}` : ''
              lines.push(`  - [${c.type}] ${label}${price}`)
            }
          }
          lines.push('--- End Basket ---')
          basketContext = lines.join('\n')
        }
      } catch {
        // Basket fetch failed — continue without context
      }
    }

    // -----------------------------------------------------------------------
    // 4. Build page context — now includes full enriched metadata
    // -----------------------------------------------------------------------
    let pageContextSection = ''
    if (pageContext?.type && pageContext?.name) {
      const meta = (pageContext.metadata ?? {}) as Record<string, unknown>
      const lines = [`\n\n--- Current Page ---\nCurrently viewing: ${pageContext.name} (${pageContext.type} page, slug: ${pageContext.slug || 'unknown'})`]

      // Destination metadata
      if (meta.oneLiner) lines.push(`Known for: ${meta.oneLiner}`)
      if (meta.travelDescription) lines.push(`Guide: ${meta.travelDescription}`)
      if (Array.isArray(meta.bestMonths) && meta.bestMonths.length > 0) lines.push(`Best months: ${meta.bestMonths.join(', ')}`)
      if (meta.budgetTier) lines.push(`Budget: ${meta.budgetTier}`)
      if (meta.typicalStay) lines.push(`Typical stay: ${meta.typicalStay}`)
      if (Array.isArray(meta.tags) && meta.tags.length > 0) lines.push(`Tags: ${meta.tags.join(', ')}`)
      if (Array.isArray(meta.highlights) && meta.highlights.length > 0) lines.push(`Highlights: ${meta.highlights.join(', ')}`)
      if (meta.currencyName) lines.push(`Currency: ${meta.currency} (${meta.currencyName})`)
      else if (meta.currency) lines.push(`Currency: ${meta.currency}`)
      if (Array.isArray(meta.languages) && meta.languages.length > 0) lines.push(`Languages: ${meta.languages.join(', ')}`)
      if (meta.airportIata) lines.push(`Airport: ${meta.airportIata}`)
      if (Array.isArray(meta.travelTips) && meta.travelTips.length > 0) lines.push(`Tips: ${meta.travelTips.join('; ')}`)
      if (Array.isArray(meta.vibeWords) && meta.vibeWords.length > 0) lines.push(`Vibe: ${meta.vibeWords.join(', ')}`)

      // Ship metadata
      if (meta.cruiseLine) lines.push(`Cruise line: ${meta.cruiseLine}`)
      if (meta.shipClass) lines.push(`Ship class: ${meta.shipClass}`)
      if (meta.yearBuilt) lines.push(`Year built: ${meta.yearBuilt}`)
      if (meta.passengerCapacity) lines.push(`Capacity: ${meta.passengerCapacity} passengers`)
      if (meta.upcomingSailings) lines.push(`Upcoming sailings: ${meta.upcomingSailings}`)

      // Cruise line metadata
      if (meta.shipCount) lines.push(`Fleet: ${meta.shipCount} ships`)
      if (meta.sailingCount) lines.push(`Total sailings: ${meta.sailingCount}`)
      if (Array.isArray(meta.ships) && meta.ships.length > 0) lines.push(`Ships: ${meta.ships.slice(0, 8).join(', ')}`)

      // Advisor metadata
      if (pageContext.type === 'advisor' && meta) {
        if (meta.title) lines.push(`Title: ${meta.title}`)
        if (meta.specialties) lines.push(`Specializes in: ${meta.specialties}`)
        if (meta.destinations) lines.push(`Expert destinations: ${meta.destinations}`)
        const firstName = String(pageContext.name).split(' ')[0]
        lines.push(`When helping this visitor, reference ${firstName} by name.`)
        lines.push(`All leads go to ${firstName}.`)
      }

      lines.push('Use this context naturally — reference what they\'re looking at without being asked.')
      lines.push('--- End Page ---')
      pageContextSection = lines.join('\n')
    }

    // -----------------------------------------------------------------------
    // 5. Assemble final system prompt
    // -----------------------------------------------------------------------
    const systemPrompt = BASE_SYSTEM_PROMPT + conversationContext + browsingContext + pageContextSection + basketContext

    // Convert UI messages to model messages
    const modelMessages = await convertToModelMessages(messages)

    const result = streamText({
      model: resolveModel(),
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(8),
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.warn('[api/chat] Request failed:', (error as Error)?.message || 'unknown error', (error as Error)?.stack?.split('\n').slice(0, 3).join(' '))
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing your request.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd apps/ota && npx next build --no-lint 2>&1 | tail -20`
Expected: Build succeeds (or only pre-existing warnings)

- [ ] **Step 3: Run the conversation-state tests**

Run: `cd apps/ota && npx vitest run src/lib/ai/__tests__/conversation-state.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/app/api/chat/route.ts
git commit -m "feat(ota): rewrite system prompt with knowledge protocol, conversation state, browsing awareness"
```

---

## Self-Review

**Spec coverage check:**

| Spec Section | Task |
|---|---|
| 3.1 lookupDestination | Task 2 |
| 3.2 lookupCruiseLineOrShip | Task 3 |
| 3.3 searchCruises + shipId | Task 3 |
| 4. Conversation state extractor | Task 1 |
| 5. Browsing session awareness | Task 4 |
| 6. Richer page context | Task 5 (widget), Task 7 (ship/cruise-line pages), Task 8 (route formatting) |
| 7. System prompt rewrite | Task 8 |
| 8. Hide internal tools in UI | Task 6 |
| 9. File changes — all files listed | Covered across Tasks 1-8 |
| 10. Conversation examples | Validated by system prompt design in Task 8 |
| 11. Unit tests | Task 1 (conversation-state tests) |
| stepCountIs bump to 8 | Task 8 |

**Placeholder scan:** No TBDs, TODOs, or vague requirements found.

**Type consistency:** `ConversationFacts`, `formatConversationContext`, `extractConversationFacts` — used consistently across Task 1 and Task 8. `lookupDestination`, `lookupCruiseLineOrShip` — imported and registered in tools.ts in Tasks 2 and 3, hidden in UI in Task 6. `BrowsingHistoryEntry` defined in Task 4, filtered in Task 5.

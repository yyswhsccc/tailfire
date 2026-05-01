/**
 * Tests for conversation-state.ts
 *
 * Tests the extractConversationFacts and formatConversationContext functions
 * using mock UIMessage objects shaped like the real ai SDK type.
 */

import { describe, it, expect } from 'vitest'
import type { UIMessage } from 'ai'
import {
  extractConversationFacts,
  formatConversationContext,
  type ConversationFacts,
} from '../conversation-state'

// ---------------------------------------------------------------------------
// Helpers to build mock messages
// ---------------------------------------------------------------------------

function userMsg(text: string): UIMessage {
  return {
    id: `u-${Math.random()}`,
    role: 'user',
    parts: [{ type: 'text', text }],
  }
}

function assistantToolMsg(
  toolName: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): UIMessage {
  return {
    id: `a-${Math.random()}`,
    role: 'assistant',
    parts: [
      {
        type: `tool-${toolName}`,
        state: 'output-available',
        toolCallId: `tc-${Math.random()}`,
        input,
        output,
      } as any,
    ],
  }
}

function assistantTextMsg(text: string): UIMessage {
  return {
    id: `a-${Math.random()}`,
    role: 'assistant',
    parts: [{ type: 'text', text }],
  }
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

describe('extractConversationFacts — dates', () => {
  it('parses ISO date', () => {
    const facts = extractConversationFacts([userMsg('I want to travel on 2027-03-15')])
    expect(facts.dates?.isoDate).toBe('2027-03-15')
    expect(facts.dates?.year).toBe(2027)
    expect(facts.dates?.month).toBe(3)
    expect(facts.dates?.flexible).toBe(false)
  })

  it('parses month + year', () => {
    const facts = extractConversationFacts([userMsg('I was thinking November 2027')])
    expect(facts.dates?.month).toBe(11)
    expect(facts.dates?.year).toBe(2027)
    expect(facts.dates?.isoDate).toBe('2027-11-01')
  })

  it('parses abbreviated month + year', () => {
    const facts = extractConversationFacts([userMsg('Looking at Feb 2028')])
    expect(facts.dates?.month).toBe(2)
    expect(facts.dates?.year).toBe(2028)
  })

  it('parses month only', () => {
    const facts = extractConversationFacts([userMsg('in November')])
    expect(facts.dates?.month).toBe(11)
    expect(facts.dates?.year).toBeUndefined()
    expect(facts.dates?.isoDate).toBeUndefined()
  })

  it('sets flexible=true when "around" is used', () => {
    const facts = extractConversationFacts([userMsg('around November 2027')])
    expect(facts.dates?.flexible).toBe(true)
    expect(facts.dates?.month).toBe(11)
  })

  it('sets flexible=true when "ish" is used', () => {
    const facts = extractConversationFacts([userMsg('November-ish 2027')])
    expect(facts.dates?.flexible).toBe(true)
  })

  it('returns no dates when none mentioned', () => {
    const facts = extractConversationFacts([userMsg('I want to go somewhere warm')])
    expect(facts.dates).toBeUndefined()
  })

  it('later message overrides earlier date', () => {
    const facts = extractConversationFacts([
      userMsg('Maybe in March 2027'),
      userMsg('Actually, let\'s do November 2027 instead'),
    ])
    expect(facts.dates?.month).toBe(11)
    expect(facts.dates?.year).toBe(2027)
  })
})

// ---------------------------------------------------------------------------
// Travelers
// ---------------------------------------------------------------------------

describe('extractConversationFacts — travelers', () => {
  it('parses "my wife and I" as couple/2 adults', () => {
    const facts = extractConversationFacts([userMsg('It would be my wife and I')])
    expect(facts.travelers?.adults).toBe(2)
    expect(facts.travelers?.children).toBe(0)
    expect(facts.travelers?.totalCount).toBe(2)
    expect(facts.travelers?.groupType).toBe('couple')
  })

  it('parses "me and my husband" as couple/2 adults', () => {
    const facts = extractConversationFacts([userMsg('It\'s me and my husband')])
    expect(facts.travelers?.groupType).toBe('couple')
    expect(facts.travelers?.adults).toBe(2)
  })

  it('parses "family of 4"', () => {
    const facts = extractConversationFacts([userMsg('We are a family of 4')])
    expect(facts.travelers?.totalCount).toBe(4)
    expect(facts.travelers?.groupType).toBe('family')
  })

  it('parses "2 adults and 2 kids"', () => {
    const facts = extractConversationFacts([userMsg('There will be 2 adults and 2 kids')])
    expect(facts.travelers?.adults).toBe(2)
    expect(facts.travelers?.children).toBe(2)
    expect(facts.travelers?.totalCount).toBe(4)
    expect(facts.travelers?.groupType).toBe('family')
  })

  it('parses "3 adults"', () => {
    const facts = extractConversationFacts([userMsg('3 adults travelling together')])
    expect(facts.travelers?.adults).toBe(3)
    expect(facts.travelers?.children).toBe(0)
    expect(facts.travelers?.totalCount).toBe(3)
  })

  it('parses "solo"', () => {
    const facts = extractConversationFacts([userMsg('Just me travelling solo')])
    expect(facts.travelers?.adults).toBe(1)
    expect(facts.travelers?.totalCount).toBe(1)
    expect(facts.travelers?.groupType).toBe('solo')
  })

  it('parses "just me"', () => {
    const facts = extractConversationFacts([userMsg('just me on this trip')])
    expect(facts.travelers?.groupType).toBe('solo')
    expect(facts.travelers?.totalCount).toBe(1)
  })

  it('parses "5 friends"', () => {
    const facts = extractConversationFacts([userMsg('Going with 5 friends')])
    expect(facts.travelers?.totalCount).toBe(5)
    expect(facts.travelers?.groupType).toBe('group')
  })

  it('parses "group of 8"', () => {
    const facts = extractConversationFacts([userMsg('We\'re a group of 8')])
    expect(facts.travelers?.totalCount).toBe(8)
    expect(facts.travelers?.groupType).toBe('group')
  })

  it('returns no travelers when none mentioned', () => {
    const facts = extractConversationFacts([userMsg('I love the idea of a beach vacation')])
    expect(facts.travelers).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Origin
// ---------------------------------------------------------------------------

describe('extractConversationFacts — origin', () => {
  it('parses IATA code near "from"', () => {
    const facts = extractConversationFacts([userMsg('flying from YOW')])
    expect(facts.origin).toBe('YOW')
  })

  it('parses "departing from YYZ"', () => {
    const facts = extractConversationFacts([userMsg('We are departing from YYZ')])
    expect(facts.origin).toBe('YYZ')
  })

  it('parses Canadian city name near "from"', () => {
    const facts = extractConversationFacts([userMsg('flying from Toronto')])
    expect(facts.origin).toBe('YYZ')
  })

  it('parses Montreal → YUL', () => {
    const facts = extractConversationFacts([userMsg('departing from Montreal')])
    expect(facts.origin).toBe('YUL')
  })

  it('parses Vancouver → YVR', () => {
    const facts = extractConversationFacts([userMsg('leaving from Vancouver')])
    expect(facts.origin).toBe('YVR')
  })

  it('parses "I\'m in Ottawa" → YOW', () => {
    const facts = extractConversationFacts([userMsg("I'm in Ottawa, looking for a trip")])
    expect(facts.origin).toBe('YOW')
  })

  it('parses "based in Calgary" → YYC', () => {
    const facts = extractConversationFacts([userMsg('based in Calgary')])
    expect(facts.origin).toBe('YYC')
  })

  it('returns no origin when none mentioned', () => {
    const facts = extractConversationFacts([userMsg('I want to go to Mexico in March')])
    expect(facts.origin).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

describe('extractConversationFacts — budget', () => {
  it('classifies "$3000" as mid-range', () => {
    const facts = extractConversationFacts([userMsg('Our budget is around $3000')])
    expect(facts.budget?.tier).toBe('mid-range')
    expect(facts.budget?.amountDollars).toBe(3000)
  })

  it('classifies "$1500" as budget', () => {
    const facts = extractConversationFacts([userMsg('I only have $1500 to spend')])
    expect(facts.budget?.tier).toBe('budget')
    expect(facts.budget?.amountDollars).toBe(1500)
  })

  it('classifies "$10000" as luxury', () => {
    const facts = extractConversationFacts([userMsg('We can spend up to $10000')])
    expect(facts.budget?.tier).toBe('luxury')
    expect(facts.budget?.amountDollars).toBe(10000)
  })

  it('parses keyword "budget"', () => {
    const facts = extractConversationFacts([userMsg('Looking for a budget-friendly option')])
    expect(facts.budget?.tier).toBe('budget')
    expect(facts.budget?.amountDollars).toBeUndefined()
  })

  it('parses keyword "affordable"', () => {
    const facts = extractConversationFacts([userMsg('Something affordable would be great')])
    expect(facts.budget?.tier).toBe('budget')
  })

  it('parses keyword "mid-range"', () => {
    const facts = extractConversationFacts([userMsg('mid-range is fine for us')])
    expect(facts.budget?.tier).toBe('mid-range')
  })

  it('parses keyword "luxury"', () => {
    const facts = extractConversationFacts([userMsg('We want a luxury experience')])
    expect(facts.budget?.tier).toBe('luxury')
  })

  it('parses keyword "premium"', () => {
    const facts = extractConversationFacts([userMsg('Looking for something premium')])
    expect(facts.budget?.tier).toBe('luxury')
  })

  it('parses "$8k" as luxury', () => {
    const facts = extractConversationFacts([userMsg('Budget is about $8k')])
    expect(facts.budget?.tier).toBe('luxury')
    expect(facts.budget?.amountDollars).toBe(8000)
  })

  it('returns no budget when none mentioned', () => {
    const facts = extractConversationFacts([userMsg('I want to see the Eiffel Tower')])
    expect(facts.budget).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Interests
// ---------------------------------------------------------------------------

describe('extractConversationFacts — interests', () => {
  it('detects beach interest', () => {
    const facts = extractConversationFacts([userMsg('I love beach destinations')])
    expect(facts.interests).toContain('beach')
  })

  it('detects snorkeling interest', () => {
    const facts = extractConversationFacts([userMsg('I really enjoy snorkeling')])
    expect(facts.interests).toContain('snorkeling')
  })

  it('detects food interest', () => {
    const facts = extractConversationFacts([userMsg('Great cuisine is important to me')])
    expect(facts.interests).toContain('food')
  })

  it('detects adventure interest from "hiking"', () => {
    const facts = extractConversationFacts([userMsg('I enjoy hiking and outdoor adventures')])
    expect(facts.interests).toContain('adventure')
  })

  it('detects relaxation interest from "spa"', () => {
    const facts = extractConversationFacts([userMsg('Looking for a relaxing spa getaway')])
    expect(facts.interests).toContain('relaxation')
  })

  it('detects culture interest', () => {
    const facts = extractConversationFacts([userMsg('I love history and museums')])
    expect(facts.interests).toContain('culture')
  })

  it('detects nature interest from "wildlife"', () => {
    const facts = extractConversationFacts([userMsg('I want to see wildlife on safari')])
    expect(facts.interests).toContain('nature')
  })

  it('accumulates interests across messages', () => {
    const facts = extractConversationFacts([
      userMsg('I love beach and snorkeling'),
      userMsg('Also really into food and culture'),
    ])
    expect(facts.interests).toContain('beach')
    expect(facts.interests).toContain('snorkeling')
    expect(facts.interests).toContain('food')
    expect(facts.interests).toContain('culture')
  })

  it('does not duplicate interests', () => {
    const facts = extractConversationFacts([
      userMsg('I love beach'),
      userMsg('beaches are my favourite'),
    ])
    const beachCount = facts.interests.filter((i) => i === 'beach').length
    expect(beachCount).toBe(1)
  })

  it('returns empty interests when none mentioned', () => {
    const facts = extractConversationFacts([userMsg('When is a good time to visit Japan?')])
    expect(facts.interests).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Travel style
// ---------------------------------------------------------------------------

describe('extractConversationFacts — travel style', () => {
  it('detects honeymoon', () => {
    const facts = extractConversationFacts([userMsg('This is our honeymoon trip!')])
    expect(facts.travelStyle).toBe('honeymoon')
  })

  it('detects anniversary', () => {
    const facts = extractConversationFacts([userMsg('We are celebrating our anniversary')])
    expect(facts.travelStyle).toBe('anniversary')
  })

  it('detects family vacation', () => {
    const facts = extractConversationFacts([userMsg('It\'s a family vacation for us')])
    expect(facts.travelStyle).toBe('family vacation')
  })

  it('detects girls trip', () => {
    const facts = extractConversationFacts([userMsg('Planning a girls trip with my friends')])
    expect(facts.travelStyle).toBe('girls trip')
  })

  it('detects solo travel', () => {
    const facts = extractConversationFacts([userMsg('I enjoy solo travel')])
    expect(facts.travelStyle).toBe('solo travel')
  })

  it('detects group trip', () => {
    const facts = extractConversationFacts([userMsg('Looking to organize a group trip')])
    expect(facts.travelStyle).toBe('group trip')
  })

  it('returns undefined when no travel style mentioned', () => {
    const facts = extractConversationFacts([userMsg('What cruises do you have?')])
    expect(facts.travelStyle).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Tool result parsing
// ---------------------------------------------------------------------------

describe('extractConversationFacts — tool results', () => {
  it('extracts confirmed destination from lookupDestination (found: true)', () => {
    const facts = extractConversationFacts([
      userMsg('I want to go to Bali'),
      assistantToolMsg('lookupDestination', { slug: 'bali' }, { found: true, name: 'Bali, Indonesia' }),
    ])
    expect(facts.destination).toBe('Bali, Indonesia')
  })

  it('does NOT set destination from lookupDestination when found: false', () => {
    const facts = extractConversationFacts([
      userMsg('I want to go to XYZ'),
      assistantToolMsg('lookupDestination', { slug: 'xyz' }, { found: false }),
    ])
    expect(facts.destination).toBeUndefined()
  })

  it('does NOT extract destination from other tool results', () => {
    const facts = extractConversationFacts([
      userMsg('Show me cruises to Caribbean'),
      assistantToolMsg('searchCruises', { destination: 'Caribbean' }, {
        cruises: [{ itinerary: 'Caribbean Cruise', name: 'Caribbean' }],
        resultCount: 1,
      }),
    ])
    expect(facts.destination).toBeUndefined()
  })

  it('tracks searchCruises in searchesPerformed', () => {
    const facts = extractConversationFacts([
      userMsg('Find me a cruise'),
      assistantToolMsg('searchCruises', { destination: 'Mediterranean' }, { cruises: [{}, {}], resultCount: 2 }),
    ])
    expect(facts.searchesPerformed).toHaveLength(1)
    expect(facts.searchesPerformed[0].toolName).toBe('searchCruises')
    expect(facts.searchesPerformed[0].destination).toBe('Mediterranean')
    expect(facts.searchesPerformed[0].resultCount).toBe(2)
  })

  it('tracks searchFlights in searchesPerformed', () => {
    const facts = extractConversationFacts([
      userMsg('Find me a flight'),
      assistantToolMsg('searchFlights', { origin: 'YYZ', destination: 'CDG' }, {
        flights: [{}, {}, {}],
        resultCount: 3,
      }),
    ])
    expect(facts.searchesPerformed[0].toolName).toBe('searchFlights')
    expect(facts.searchesPerformed[0].resultCount).toBe(3)
  })

  it('tracks basket add from manageTripBasket', () => {
    const facts = extractConversationFacts([
      userMsg('I like the Caribbean cruise'),
      assistantToolMsg('manageTripBasket', { action: 'add' }, {
        action: 'addToBasket',
        component: {
          id: 'ai-123',
          type: 'cruise',
          display: { title: 'Royal Caribbean — Caribbean' },
          addedAt: '2026-04-10T12:00:00Z',
        },
        message: 'Added to basket',
      }),
    ])
    expect(facts.decisionsm).toHaveLength(1)
    expect(facts.decisionsm[0].action).toBe('added')
    expect(facts.decisionsm[0].type).toBe('cruise')
    expect(facts.decisionsm[0].title).toBe('Royal Caribbean — Caribbean')
    expect(facts.decisionsm[0].componentId).toBe('ai-123')
  })

  it('tracks basket removal from manageTripBasket', () => {
    const facts = extractConversationFacts([
      userMsg('Remove that flight'),
      assistantToolMsg('manageTripBasket', { action: 'remove', componentId: 'ai-456' }, {
        action: 'removeFromBasket',
        componentId: 'ai-456',
        message: 'Removed from basket',
      }),
    ])
    expect(facts.decisionsm[0].action).toBe('removed')
    expect(facts.decisionsm[0].componentId).toBe('ai-456')
  })

  it('does not parse assistant free-text messages for facts', () => {
    // The assistant might say "You should visit Bali in November" but this should not
    // set dates or destination
    const facts = extractConversationFacts([
      assistantTextMsg('You should visit Bali in November 2027 — it\'s a luxury destination.'),
    ])
    expect(facts.dates).toBeUndefined()
    expect(facts.destination).toBeUndefined()
    expect(facts.budget).toBeUndefined()
  })

  it('does not parse tool-result with state other than output-available', () => {
    const msg: UIMessage = {
      id: 'a-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-lookupDestination',
          state: 'input-available', // not output-available
          toolCallId: 'tc-1',
          input: { slug: 'bali' },
        } as any,
      ],
    }
    const facts = extractConversationFacts([msg])
    expect(facts.destination).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Multi-turn conversation
// ---------------------------------------------------------------------------

describe('extractConversationFacts — multi-turn', () => {
  it('builds up facts across a full conversation', () => {
    const messages: UIMessage[] = [
      userMsg('Hi! I\'m dreaming of a beach vacation'),
      assistantTextMsg('Wonderful! Where are you thinking of going?'),
      userMsg('Maybe Bali or the Maldives. I love snorkeling'),
      assistantTextMsg('Great choices! When are you thinking of going?'),
      userMsg('Around November 2027 — flexible on dates'),
      assistantTextMsg('Perfect! Who\'s joining you?'),
      userMsg('My wife and I, so just two adults. It\'s our anniversary'),
      assistantTextMsg('How lovely! And your budget?'),
      userMsg('We can spend about $8000 total'),
      assistantTextMsg('Let me search for some options...'),
      assistantToolMsg('lookupDestination', { slug: 'bali' }, { found: true, name: 'Bali, Indonesia' }),
      assistantToolMsg('searchCruises', { destination: 'Bali' }, { cruises: [{}, {}], resultCount: 2 }),
    ]

    const facts = extractConversationFacts(messages)

    expect(facts.dates?.month).toBe(11)
    expect(facts.dates?.year).toBe(2027)
    expect(facts.dates?.flexible).toBe(true)
    expect(facts.travelers?.adults).toBe(2)
    expect(facts.travelers?.groupType).toBe('couple')
    expect(facts.budget?.tier).toBe('luxury')
    expect(facts.budget?.amountDollars).toBe(8000)
    expect(facts.interests).toContain('beach')
    expect(facts.interests).toContain('snorkeling')
    expect(facts.travelStyle).toBe('anniversary')
    expect(facts.destination).toBe('Bali, Indonesia')
    expect(facts.searchesPerformed).toHaveLength(1)
    expect(facts.searchesPerformed[0].toolName).toBe('searchCruises')
  })
})

// ---------------------------------------------------------------------------
// formatConversationContext
// ---------------------------------------------------------------------------

describe('formatConversationContext', () => {
  it('returns empty string for empty facts', () => {
    const facts: ConversationFacts = { interests: [], searchesPerformed: [], decisionsm: [] }
    expect(formatConversationContext(facts)).toBe('')
  })

  it('returns formatted block when facts present', () => {
    const facts: ConversationFacts = {
      dates: { raw: 'November 2027', isoDate: '2027-11-01', flexible: false, year: 2027, month: 11 },
      travelers: { totalCount: 2, adults: 2, children: 0, groupType: 'couple' },
      origin: 'YOW',
      budget: { tier: 'luxury', amountDollars: 10000 },
      interests: ['beach', 'snorkeling'],
      travelStyle: 'honeymoon',
      destination: 'Maldives',
      searchesPerformed: [{ toolName: 'searchCruises', destination: 'Maldives', resultCount: 3 }],
      decisionsm: [],
    }
    const result = formatConversationContext(facts)

    expect(result).toContain('--- Conversation Context ---')
    expect(result).toContain('November 2027')
    expect(result).toContain('2027-11-01')
    expect(result).toContain('couple')
    expect(result).toContain('YOW')
    expect(result).toContain('luxury')
    expect(result).toContain('$10,000')
    expect(result).toContain('beach')
    expect(result).toContain('snorkeling')
    expect(result).toContain('honeymoon')
    expect(result).toContain('Maldives')
    expect(result).toContain('searchCruises')
    expect(result).toContain('3 results')
    expect(result).toContain('--- End Context ---')
  })

  it('marks flexible dates with [flexible]', () => {
    const facts: ConversationFacts = {
      dates: { raw: 'around November', flexible: true, month: 11 },
      interests: [],
      searchesPerformed: [],
      decisionsm: [],
    }
    const result = formatConversationContext(facts)
    expect(result).toContain('[flexible]')
  })

  it('shows basket decisions in output', () => {
    const facts: ConversationFacts = {
      interests: [],
      searchesPerformed: [],
      decisionsm: [{ action: 'added', type: 'cruise', title: 'Caribbean Cruise', componentId: 'ai-123' }],
    }
    const result = formatConversationContext(facts)
    expect(result).toContain('Basket:')
    expect(result).toContain('added cruise')
    expect(result).toContain('"Caribbean Cruise"')
  })

  it('includes children count when travelers have children', () => {
    const facts: ConversationFacts = {
      travelers: { totalCount: 4, adults: 2, children: 2, groupType: 'family' },
      interests: [],
      searchesPerformed: [],
      decisionsm: [],
    }
    const result = formatConversationContext(facts)
    expect(result).toContain('2 adults, 2 children')
  })

  it('does not show isoDate if not present', () => {
    const facts: ConversationFacts = {
      dates: { raw: 'in November', flexible: false, month: 11 },
      interests: [],
      searchesPerformed: [],
      decisionsm: [],
    }
    const result = formatConversationContext(facts)
    // Should contain the raw but not a parenthesized ISO date
    expect(result).toContain('in November')
    expect(result).not.toMatch(/\(\d{4}-\d{2}-\d{2}\)/)
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('extractConversationFacts — edge cases', () => {
  it('handles empty messages array', () => {
    const facts = extractConversationFacts([])
    expect(facts.interests).toEqual([])
    expect(facts.searchesPerformed).toEqual([])
    expect(facts.decisionsm).toEqual([])
  })

  it('handles messages with no parts', () => {
    const msg: UIMessage = { id: '1', role: 'user', parts: [] }
    const facts = extractConversationFacts([msg])
    expect(facts.dates).toBeUndefined()
  })

  it('handles assistant messages with only text parts', () => {
    const facts = extractConversationFacts([
      assistantTextMsg('I can help you plan your trip to Bali in November. Budget: luxury.'),
    ])
    // Should extract nothing from assistant free text
    expect(facts.dates).toBeUndefined()
    expect(facts.budget).toBeUndefined()
    expect(facts.destination).toBeUndefined()
  })

  it('handles multiple searches in one conversation', () => {
    const facts = extractConversationFacts([
      userMsg('Show me cruises'),
      assistantToolMsg('searchCruises', { destination: 'Caribbean' }, { resultCount: 5 }),
      userMsg('Also flights'),
      assistantToolMsg('searchFlights', { origin: 'YYZ', destination: 'MBJ' }, { resultCount: 3 }),
    ])
    expect(facts.searchesPerformed).toHaveLength(2)
    expect(facts.searchesPerformed.map((s) => s.toolName)).toContain('searchCruises')
    expect(facts.searchesPerformed.map((s) => s.toolName)).toContain('searchFlights')
  })

  it('handles "2 kids" without explicit adult count (defaults to 2 adults)', () => {
    const facts = extractConversationFacts([userMsg('We have 2 kids')])
    expect(facts.travelers?.children).toBe(2)
    expect(facts.travelers?.adults).toBe(2)
    expect(facts.travelers?.groupType).toBe('family')
  })

  it('later destination lookup overrides earlier one', () => {
    const facts = extractConversationFacts([
      assistantToolMsg('lookupDestination', {}, { found: true, name: 'Cancun, Mexico' }),
      assistantToolMsg('lookupDestination', {}, { found: true, name: 'Bali, Indonesia' }),
    ])
    expect(facts.destination).toBe('Bali, Indonesia')
  })

  it('handles $3,000 with comma formatting', () => {
    const facts = extractConversationFacts([userMsg('Budget of $3,000')])
    expect(facts.budget?.amountDollars).toBe(3000)
    expect(facts.budget?.tier).toBe('mid-range')
  })
})

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

function buildSystemPrompt(): string {
  const now = new Date()
  const currentDate = now.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
  const currentYear = now.getFullYear()

  return `You are the Phoenix Voyages AI Travel Concierge — a warm, knowledgeable travel advisor who helps people dream, explore, and plan trips.

## 0. Current date
- Today is ${currentDate}. The current year is ${currentYear}.
- When a user says a month without a year (e.g., "November"), use the NEXT occurrence: if that month hasn't passed yet this year, use ${currentYear}; otherwise ${currentYear + 1}.
- ALWAYS use ${currentYear} or ${currentYear + 1} in dates for tool calls. NEVER use 2024 or 2025.

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
- Ground ALL destination/cruise answers in our data first. If our data doesn't cover it fully, supplement with your general knowledge naturally — you're a travel expert, act like one.
- If a lookup returns sparse or no data, DO NOT apologize or hand off to an advisor. Use your general knowledge to give a rich, helpful answer.
- NEVER fabricate specific data (prices, dates, availability) — only share what your tools return. But general destination knowledge (culture, food, beaches, weather) is fine from your training.

## 3. Conversation state
- Read the Conversation Context block carefully every turn. It contains facts extracted from earlier in this conversation.
- NEVER ask for information that's already in the Conversation Context.
- If you know their dates, don't ask when they're traveling. If you know they're a couple, don't ask how many.
- New facts the user shares will appear in the next turn's context automatically.

## 4. Tool decision tree — intent-based routing
First, determine the user's INTENT before choosing tools:

INFORMATIONAL intent ("Tell me about Jamaica", "What's Santorini like?", "Best time to visit Greece"):
→ Call lookupDestination ONLY. Answer their question using lookup data + your general knowledge. Do NOT search for products unless they ask.

SHOPPING intent ("Find me a Caribbean cruise", "I want to go to Jamaica in November", "Show me flights to Cancun"):
→ Call lookupDestination FIRST for context, THEN search for products (searchCruises, searchFlights, searchHotels, browseTours).

CRUISE LINE/SHIP intent ("Tell me about Royal Caribbean", "What's the Celebrity Reflection like?"):
→ Call lookupCruiseLineOrShip. Only search sailings if they ask for availability.

Specific rules:
- User mentions DESTINATION + DATES → lookupDestination + searchCruises (and searchFlights + searchHotels if you have origin airport)
- User asks about tours at a destination → lookupDestination + browseTours
- User says "book", "advisor", or "talk to someone" → requestAdvisor (collect email first)
- User expresses interest in a result → manageTripBasket to save it
- NEVER search flights without origin airport + departure date
- NEVER search hotels without check-in + check-out dates
- You CAN call multiple tools in one turn
- When a search returns 0 results, tell the user naturally and suggest alternatives or different dates.

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
- NEVER push advisor connection after a failed search or sparse data. Only suggest advisor when: user explicitly asks, the request is genuinely complex (multi-city, groups, special needs), or they're ready to book.
- Don't apologize for missing data. Be helpful with what you know.
- Don't explain your capabilities upfront. Show, don't tell.`
}

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
    const systemPrompt = buildSystemPrompt() + conversationContext + browsingContext + pageContextSection + basketContext

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

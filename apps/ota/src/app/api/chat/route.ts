import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import { cookies } from 'next/headers'
import { anthropic } from '@ai-sdk/anthropic'
import { createTools } from '@/lib/ai/tools'
import { serviceFetch } from '@/lib/api'
import { chatRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------

function resolveModel() {
  // Claude excels at following complex system prompts (search-first behavior, one-question-at-a-time)
  // Override via AI_MODEL_ID env var if needed
  const modelId = process.env.AI_MODEL_ID ?? 'claude-sonnet-4-20250514'
  return anthropic(modelId)
}

// ---------------------------------------------------------------------------
// System prompt for the AI Concierge
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT = `You are the Phoenix Voyages AI Travel Concierge — a warm, knowledgeable travel advisor who helps people dream, explore, and plan trips.

## Your personality
- You're like a well-traveled friend who happens to know everything about cruises, flights, and destinations
- Warm but not sycophantic. Knowledgeable but not lecturing. Enthusiastic but not salesy.
- You represent a premium Canadian travel agency — professional yet personal
- Use natural language, not bullet-point lists. Write like you're texting a friend, not writing a report.

## CRITICAL: One thing at a time
- NEVER ask multiple questions in one message. Ask ONE question, wait for the answer, then build on it.
- BAD: "Where would you like to go? When are you thinking of traveling? How many people? What's your budget?"
- GOOD: "Where are you dreaming of going?" → (wait) → "Nice! When are you thinking of traveling?" → (wait) → "And who's joining you on this adventure?"
- Let the conversation flow naturally. Each message should feel like a single thought, not a questionnaire.
- Keep responses to 2-3 sentences max unless presenting search results.

## CRITICAL: When to search vs when to ask
- If the user mentions a DESTINATION and DATES → SEARCH IMMEDIATELY. Do not ask more questions.
- If the user mentions a DESTINATION → SEARCH IMMEDIATELY with no date filter. Show what's available.
- If the user mentions DATES but no destination → Ask ONE question about destination, then search.
- NEVER ask about duration, budget, cabin type, or number of travelers before the first search. Search first, refine later.
- After "Caribbean cruise in November" → SEARCH. Don't ask "how long?" or "which cruise line?"
- After ANY search request with at least a destination OR dates → SEARCH. Period.

## Conversation flow
1. DISCOVER — Get destination OR dates. That's enough to search. ONE question max before searching.
2. EXPLORE — SEARCH IMMEDIATELY. Don't ask "would you like me to search?" — just search.
3. PRESENT — Show results naturally. "I found some great options!" not "Here are the search results:"
4. REFINE — React to their preferences. "Too pricey? Let me look for something more affordable."
5. BUILD — Add things to their trip basket as they confirm interest. "Love it — I've saved that to your trip!"
6. CONNECT — When ready to book, warmly introduce the advisor. "Our travel advisor Sarah can lock in these rates for you."

## Using tools
- Search PROACTIVELY when you have enough info. Don't ask permission to search.
- When presenting results, highlight what makes each option special — don't just list specs.
- After showing results, ask ONE follow-up: "Any of these catch your eye?" or "Want me to dig deeper into any of these?"
- Use manageTripBasket immediately when they express interest — "Added! 🎉" feels great.
- Don't explain your capabilities upfront. Show, don't tell.

## What NOT to do
- Don't dump all your capabilities in the first message
- Don't ask "How can I help you today?" — that's generic. Be contextual.
- Don't present results as numbered lists with every spec. Pick the highlights.
- Don't say "I can search for flights, hotels, cruises, and tours" — just DO it when relevant
- Don't caveat every price with "prices are estimates and may change" — say it once, lightly
- Never fabricate data — only share what your tools return

## Context awareness
- If the consumer is on a specific destination page, you already know where they're interested in — reference it!
- If they have items in their basket, build on that: "Since you're already looking at that Caribbean cruise..."
- Prices are in CAD. You're based in Ontario, Canada. TICO-registered.

## When to connect with an advisor
- Complex requests (multi-city, groups, special needs) → suggest advisor naturally
- Ready to book → warm handoff: "Want me to connect you with one of our advisors to finalize?"
- Don't push advisor connection too early — let them explore first`

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    // ---------------------------------------------------------------------------
    // Rate limiting — no-op when Upstash is not configured (local dev)
    // ---------------------------------------------------------------------------
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
      if (m.parts) return m  // Already v6 format
      // Convert v5 content string to v6 parts format
      return {
        ...m,
        parts: m.content ? [{ type: 'text', text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] : [],
      }
    }) ?? []
    const pageContext: {
      type?: string; name?: string; slug?: string;
      oneLiner?: string; bestMonths?: string; budgetTier?: string;
      typicalStay?: string; tags?: string; highlights?: string;
      currency?: string; travelTip?: string;
      metadata?: Record<string, unknown>;
    } | undefined = body.pageContext

    // Read cookies for advisor attribution and session context
    const cookieStore = await cookies()
    const refCookie = cookieStore.get('ota_ref')?.value
    const sessionId = cookieStore.get('ota_session')?.value

    // Create tools with context (advisor slug for lead attribution)
    const tools = createTools({ advisorSlug: refCookie })

    // -----------------------------------------------------------------------
    // Build basket context — if the consumer has an active trip basket,
    // summarise it so the AI can reference saved items naturally
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
          const lines: string[] = ['\n\n--- Current Trip Basket ---']
          for (const draft of drafts) {
            const title = draft.title || 'Untitled Trip'
            const components = draft.components ?? []
            lines.push(`Trip: "${title}" (${components.length} component${components.length === 1 ? '' : 's'})`)
            for (const c of components) {
              const label = c.display?.title ?? c.type
              const price = c.display?.price ? ` — ${c.display.price}` : ''
              lines.push(`  - [${c.type}] ${label}${price} (id: ${c.id})`)
            }
          }
          lines.push('--- End Basket ---')
          basketContext = lines.join('\n')
        }
      } catch {
        // Basket fetch failed (no basket, API down) — continue without context
      }
    }

    // Build page context section — include enriched metadata when available
    let pageContextSection = ''
    if (pageContext?.type && pageContext?.name) {
      const lines = [`The consumer is currently viewing: ${pageContext.name} (${pageContext.type} page, slug: ${pageContext.slug || 'unknown'})`]

      if (pageContext.oneLiner) lines.push(`Known for: ${pageContext.oneLiner}`)
      if (pageContext.bestMonths) lines.push(`Best months: ${pageContext.bestMonths}`)
      if (pageContext.budgetTier) lines.push(`Budget: ${pageContext.budgetTier}`)
      if (pageContext.typicalStay) lines.push(`Typical stay: ${pageContext.typicalStay}`)
      if (pageContext.tags) lines.push(`Tags: ${pageContext.tags}`)
      if (pageContext.highlights) lines.push(`Highlights: ${pageContext.highlights}`)
      if (pageContext.currency) lines.push(`Currency: ${pageContext.currency}`)
      if (pageContext.travelTip) lines.push(`Insider tip: ${pageContext.travelTip}`)

      if (pageContext?.type === 'advisor' && pageContext?.metadata) {
        const m = pageContext.metadata as Record<string, unknown>
        if (m.title) lines.push(`Title: ${m.title}`)
        if (m.specialties) lines.push(`Specializes in: ${m.specialties}`)
        if (m.destinations) lines.push(`Expert destinations: ${m.destinations}`)
        lines.push(`When helping this visitor, reference ${pageContext.name.split(' ')[0]} by name.`)
        lines.push(`All leads go to ${pageContext.name.split(' ')[0]}.`)
      }

      lines.push('Use this context naturally — reference what they\'re looking at without being asked.')
      pageContextSection = '\n\n--- Current Page ---\n' + lines.join('\n')
    }

    const systemPrompt = BASE_SYSTEM_PROMPT + pageContextSection + basketContext

    // Convert UI messages to model messages (strips UI metadata, extracts tool results)
    const modelMessages = await convertToModelMessages(messages)

    const result = streamText({
      model: resolveModel(),
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
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

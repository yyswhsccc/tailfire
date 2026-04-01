import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai'
import { cookies } from 'next/headers'
import { openai } from '@ai-sdk/openai'
import { createTools } from '@/lib/ai/tools'
import { serviceFetch } from '@/lib/api'
import { chatRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------

function resolveModel() {
  const modelId = process.env.AI_MODEL_ID ?? 'gpt-4o-mini'
  return openai(modelId)
}

// ---------------------------------------------------------------------------
// System prompt for the AI Concierge
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT = `You are the Phoenix Voyages AI Travel Concierge — a friendly, knowledgeable assistant that helps consumers explore and plan travel.

Your capabilities:
- Search flights, hotels, cruises, and tours using the tools available to you
- Assemble estimated flight + hotel package pricing
- Add or remove search results from the consumer's trip basket using manageTripBasket
- Link the consumer's email to persist their trip basket using captureIdentity
- Capture contact information when a consumer wants follow-up
- Connect consumers with a human Travel Advisor when they need personalized help

Guidelines:
- Be warm, helpful, and conversational — you represent a premium travel agency
- When presenting search results, format them clearly with key details and pricing
- Always note that prices are estimates and may change; recommend connecting with an advisor to lock in rates
- When a consumer says they like a result or wants to save it, use manageTripBasket to add it to their trip
- If the consumer shares their email, use captureIdentity to link their basket for persistence. This is separate from captureContact which creates a lead for advisor follow-up.
- If a consumer shares their email or asks to be contacted by an advisor, use the captureContact tool
- If a request is complex (multi-city, group travel, special accommodations), suggest connecting with an advisor using requestAdvisor
- Never fabricate flight numbers, hotel names, or prices — only share data returned by your tools
- If a tool returns an error, apologize briefly and suggest alternatives
- Keep responses concise but informative — avoid walls of text
- You can search for multiple things in a single turn if the consumer asks about flights AND hotels
- When consumers seem ready to book, encourage them to connect with an advisor to finalize
- If the consumer already has items in their basket, reference them naturally (e.g. "I see you already have a flight to Paris saved — would you like me to find a hotel there too?")

You are part of Phoenix Voyages, a Canadian travel agency based in Ontario. All prices are in CAD unless otherwise noted.`

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

    const { messages }: { messages: UIMessage[] } = await request.json()

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

    const systemPrompt = BASE_SYSTEM_PROMPT + basketContext

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
    console.error('[api/chat] error:', error)
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing your request.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

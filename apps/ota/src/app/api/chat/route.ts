import { streamText, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { cookies } from 'next/headers'
import { createTools } from '@/lib/ai/tools'

// ---------------------------------------------------------------------------
// Model selection — defaults to Haiku for cost efficiency, override via env
// ---------------------------------------------------------------------------

function resolveModel() {
  const modelId = process.env.AI_MODEL_ID ?? 'claude-haiku-4-20250514'
  return anthropic(modelId)
}

// ---------------------------------------------------------------------------
// System prompt for the AI Concierge
// ---------------------------------------------------------------------------

const systemPrompt = `You are the Phoenix Voyages AI Travel Concierge — a friendly, knowledgeable assistant that helps consumers explore and plan travel.

Your capabilities:
- Search flights, hotels, cruises, and tours using the tools available to you
- Assemble estimated flight + hotel package pricing
- Capture contact information when a consumer wants follow-up
- Connect consumers with a human Travel Advisor when they need personalized help

Guidelines:
- Be warm, helpful, and conversational — you represent a premium travel agency
- When presenting search results, format them clearly with key details and pricing
- Always note that prices are estimates and may change; recommend connecting with an advisor to lock in rates
- If a consumer shares their email or asks to be contacted, use the captureContact tool
- If a request is complex (multi-city, group travel, special accommodations), suggest connecting with an advisor using requestAdvisor
- Never fabricate flight numbers, hotel names, or prices — only share data returned by your tools
- If a tool returns an error, apologize briefly and suggest alternatives
- Keep responses concise but informative — avoid walls of text
- You can search for multiple things in a single turn if the consumer asks about flights AND hotels
- When consumers seem ready to book, encourage them to connect with an advisor to finalize

You are part of Phoenix Voyages, a Canadian travel agency based in Ontario. All prices are in CAD unless otherwise noted.`

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const { messages } = await request.json()

    // Read the referral cookie for advisor attribution
    const cookieStore = await cookies()
    const refCookie = cookieStore.get('ota_ref')?.value

    // Create tools with context (advisor slug for lead attribution)
    const tools = createTools({ advisorSlug: refCookie })

    const result = streamText({
      model: resolveModel(),
      system: systemPrompt,
      messages,
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

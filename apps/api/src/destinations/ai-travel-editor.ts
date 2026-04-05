// apps/api/src/destinations/ai-travel-editor.ts

import { Injectable, Logger } from '@nestjs/common'
import OpenAI from 'openai'

export interface RawDestinationData {
  name: string
  type: string
  country?: string
  countryCode?: string
  coordinates?: { lat: number; lng: number }
  wikipedia?: string            // Raw extract
  tripAdvisorRating?: number
  tripAdvisorAttractions?: string[]
  climateZone?: string
  currency?: string
  language?: string
  isCruisePort?: boolean
  sailingsCount?: number
}

export interface CuratedContent {
  travelDescription: string
  oneLiner: string
  highlights: string[]
  bestMonths: string[]
  typicalStay: string
  budgetTier: 'budget' | 'mid-range' | 'luxury'
  travelTips: string[]
  tags: string[]
  vibeWords: string[]
}

const EDITOR_SYSTEM_PROMPT = `You are a travel content editor for Phoenix Voyages, a premium Canadian travel agency.

Your job: Transform raw data about a destination into warm, helpful travel content that inspires and informs travelers.

Tone: Like a well-traveled friend sharing insider knowledge. Enthusiastic but honest. Specific over generic.

Rules:
- Lead with what makes this place special — what would make someone say "I NEED to go there"
- Include practical tips a traveler actually needs (not Wikipedia facts about history or population)
- Mention seasons/weather naturally: "Visit in December for perfect beach weather"
- If it's a cruise port, mention what you can do in a port day
- Keep the travelDescription to 2-3 short paragraphs max
- Use sensory language: "turquoise waters", "cobblestone streets", "the smell of fresh seafood"
- Never sound like an encyclopedia or a marketing brochure
- If you don't have enough info, keep it short and genuine rather than padding with generic filler
- The oneLiner should be catchy and specific: "Caribbean diving paradise with Mayan history" not "Beautiful tropical destination"
- Tags should be specific activities/qualities: ["snorkeling", "diving", "cruise-port"] not vague ["travel", "vacation"]
- bestMonths should be actual month names based on climate
- budgetTier: "budget" (under $100/day), "mid-range" ($100-300/day), "luxury" ($300+/day)
- typicalStay: how long most travelers spend ("2-4 days", "1 week", "day trip from cruise")

ALWAYS respond with valid JSON matching this exact schema:
{
  "travelDescription": "string (2-3 paragraphs)",
  "oneLiner": "string (one catchy sentence)",
  "highlights": ["string array, 4-6 items"],
  "bestMonths": ["month names"],
  "typicalStay": "string",
  "budgetTier": "budget | mid-range | luxury",
  "travelTips": ["string array, 2-4 practical tips"],
  "tags": ["string array, 5-10 specific tags"],
  "vibeWords": ["string array, 3-5 mood words"]
}`

@Injectable()
export class AiTravelEditorService {
  private readonly logger = new Logger(AiTravelEditorService.name)
  private openai: OpenAI | null = null

  private getClient(): OpenAI | null {
    if (this.openai) return this.openai
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not configured — AI curation disabled')
      return null
    }
    this.openai = new OpenAI({ apiKey })
    return this.openai
  }

  async curateDestination(raw: RawDestinationData): Promise<CuratedContent | null> {
    const client = this.getClient()
    if (!client) return null

    const userPrompt = this.buildUserPrompt(raw)

    try {
      const response = await client.chat.completions.create({
        model: process.env.AI_ENRICHMENT_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: EDITOR_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      })

      const content = response.choices[0]?.message?.content
      if (!content) return null

      const parsed = JSON.parse(content) as CuratedContent

      // Validate required fields
      if (!parsed.travelDescription || !parsed.oneLiner || !parsed.tags) {
        this.logger.warn(`AI curation returned incomplete data for ${raw.name}`)
        return null
      }

      return parsed
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error(`AI curation failed for ${raw.name}: ${message}`)
      return null
    }
  }

  private buildUserPrompt(raw: RawDestinationData): string {
    const lines: string[] = [`Destination: ${raw.name}`]

    if (raw.type) lines.push(`Type: ${raw.type}`)
    if (raw.country) lines.push(`Country: ${raw.country}`)
    if (raw.coordinates) lines.push(`Coordinates: ${raw.coordinates.lat}, ${raw.coordinates.lng}`)
    if (raw.climateZone) lines.push(`Climate: ${raw.climateZone}`)
    if (raw.currency) lines.push(`Currency: ${raw.currency}`)
    if (raw.language) lines.push(`Language: ${raw.language}`)
    if (raw.isCruisePort) lines.push(`Cruise port: Yes (${raw.sailingsCount || 'unknown'} sailings stop here)`)

    if (raw.wikipedia) {
      lines.push(`\nWikipedia summary:\n${raw.wikipedia.slice(0, 2000)}`)
    }

    if (raw.tripAdvisorRating) {
      lines.push(`\nTripAdvisor rating: ${raw.tripAdvisorRating}/5`)
    }
    if (raw.tripAdvisorAttractions?.length) {
      lines.push(`Top attractions: ${raw.tripAdvisorAttractions.slice(0, 10).join(', ')}`)
    }

    lines.push('\nCreate curated travel content for this destination. Return valid JSON.')

    return lines.join('\n')
  }
}

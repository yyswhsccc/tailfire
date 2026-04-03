'use client'

import { openChat } from '@/components/chat/chat-widget'
import type { EntityType } from '@/lib/entity-hubs/types'

interface AiContextualPromptProps {
  entityType: EntityType
  entityName: string
  suggestion?: string
}

const SUGGESTIONS: Record<EntityType, (name: string) => string> = {
  destination: (name) => `Planning a trip to ${name}? I can find flights, hotels & activities`,
  ship:        (name) => `Interested in ${name}? I can find the best sailings and cabin deals`,
  sailing:     (_name) => `Ready to book? I can check availability and find the best cabin`,
  cruise_line: (name) => `Exploring ${name}? I can compare ships and find deals`,
  region:      (name) => `Dreaming of ${name}? Let me build your perfect itinerary`,
  deal:        (_name) => `Want to take advantage of this offer? I can help you plan`,
}

const PROMPTS: Record<EntityType, (name: string) => string> = {
  destination: (name) => `Help me plan a trip to ${name}`,
  ship:        (name) => `Help me find sailings and cabin options on ${name}`,
  sailing:     (name) => `Help me check availability and book ${name}`,
  cruise_line: (name) => `Help me compare ships and find deals with ${name}`,
  region:      (name) => `Help me build a perfect itinerary for ${name}`,
  deal:        (name) => `Help me take advantage of this deal: ${name}`,
}

export function AiContextualPrompt({ entityType, entityName, suggestion }: AiContextualPromptProps) {
  const displayText = suggestion ?? SUGGESTIONS[entityType]?.(entityName) ?? `Planning a trip? I can help!`
  const prompt = PROMPTS[entityType]?.(entityName) ?? `Help me plan a trip to ${entityName}`

  return (
    <button
      type="button"
      onClick={() => openChat(prompt)}
      className="mx-4 sm:mx-10 lg:mx-[60px] my-3 flex w-[calc(100%-2rem)] sm:w-[calc(100%-5rem)] lg:w-[calc(100%-120px)] items-center gap-3 rounded-xl border border-[#C59746]/20 bg-gradient-to-r from-[#C59746]/8 to-[#C59746]/3 p-3 text-left transition-colors hover:border-[#C59746]/35 hover:from-[#C59746]/12 hover:to-[#C59746]/6"
    >
      {/* Sparkle */}
      <span className="shrink-0 text-base leading-none" aria-hidden="true">✨</span>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-bold leading-tight text-[#C59746]">{displayText}</p>
        <p className="mt-0.5 text-[11px] leading-tight text-[#888]">Tap to chat with our AI travel concierge</p>
      </div>

      {/* CTA */}
      <span className="shrink-0 text-[12px] font-semibold text-[#C59746]">Ask →</span>
    </button>
  )
}

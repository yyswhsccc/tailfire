'use client'

import { Heart, MessageCircle } from 'lucide-react'
import { useAiPanelStore } from '@/stores/ai-panel-store'

interface CtaBarProps {
  entityType: string
  entitySlug: string
  entityName: string
  inquirePrompt?: string
}

export function CtaBar({ entityType, entitySlug, entityName, inquirePrompt }: CtaBarProps) {
  const { open, addJourneyItem } = useAiPanelStore()

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => open({ prefill: inquirePrompt ?? `Tell me more about ${entityName}` })}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#C59746] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
      >
        <MessageCircle className="size-4" />
        Inquire
      </button>
      <button
        onClick={() => addJourneyItem({ type: entityType, slug: entitySlug, name: entityName })}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/30 px-5 text-sm font-medium text-white transition-colors hover:bg-white/10"
      >
        <Heart className="size-4" />
        Save
      </button>
    </div>
  )
}

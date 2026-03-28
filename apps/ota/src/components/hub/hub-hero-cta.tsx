'use client'
import { Heart } from 'lucide-react'
import { useAiPanelStore } from '@/stores/ai-panel-store'

interface HubHeroCtaProps {
  primaryLabel: string
  primaryPrompt: string
  entityType: string
  entitySlug: string
  entityName: string
}

export function HubHeroCta({ primaryLabel, primaryPrompt, entityType, entitySlug, entityName }: HubHeroCtaProps) {
  const { open, addJourneyItem } = useAiPanelStore()
  return (
    <div className="mt-5 flex flex-wrap gap-2.5">
      <button
        onClick={() => open({ prefill: primaryPrompt })}
        className="rounded-[10px] bg-[#C59746] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] sm:px-7"
      >
        ✨ {primaryLabel}
      </button>
      <button
        onClick={() => addJourneyItem({ type: entityType, slug: entitySlug, name: entityName })}
        className="rounded-[10px] border border-white/25 bg-white/15 px-4 py-3 text-sm text-white backdrop-blur-md transition-colors hover:bg-white/25"
      >
        <Heart className="mr-1.5 inline size-3.5" /> Save
      </button>
    </div>
  )
}

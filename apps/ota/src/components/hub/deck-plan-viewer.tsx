'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface DeckPlan {
  name: string
  deckNumber: number | null
  deckPlanUrl: string | null
  description: string | null
}

interface DeckPlanViewerProps {
  decks: DeckPlan[]
  shipName: string
}

export function DeckPlanViewer({ decks, shipName }: DeckPlanViewerProps) {
  const viewable = decks.filter((d) => d.deckPlanUrl)
  const [activeIndex, setActiveIndex] = useState(0)

  if (viewable.length === 0) return null

  const active = viewable[activeIndex]!

  return (
    <div>
      {/* Deck navigation strip */}
      <div className="mb-4 flex items-center gap-2">
        {/* Prev button */}
        <button
          onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
          disabled={activeIndex === 0}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#eee] bg-white text-[#888] transition-colors hover:border-[#C59746] hover:text-[#C59746] disabled:opacity-30 disabled:hover:border-[#eee] disabled:hover:text-[#888]"
          aria-label="Previous deck"
        >
          <ChevronLeft className="size-4" />
        </button>

        {/* Scrollable deck pills */}
        <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1">
          {viewable.map((deck, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                i === activeIndex
                  ? 'bg-[#C59746] text-white shadow-sm'
                  : 'bg-[#f5f5f0] text-[#666] hover:bg-[#eee]'
              }`}
            >
              {deck.name}
            </button>
          ))}
        </div>

        {/* Next button */}
        <button
          onClick={() => setActiveIndex((i) => Math.min(viewable.length - 1, i + 1))}
          disabled={activeIndex === viewable.length - 1}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#eee] bg-white text-[#888] transition-colors hover:border-[#C59746] hover:text-[#C59746] disabled:opacity-30 disabled:hover:border-[#eee] disabled:hover:text-[#888]"
          aria-label="Next deck"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Active deck display */}
      <div className="overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white">
        <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[#1A1A1A]">{active.name}</p>
            {active.description && (
              <p className="mt-0.5 text-xs text-[#888]">{active.description}</p>
            )}
          </div>
          <p className="text-xs text-[#aaa]">{activeIndex + 1} of {viewable.length}</p>
        </div>
        <div className="overflow-x-auto p-2">
          <img
            src={active.deckPlanUrl!}
            alt={`${shipName} — ${active.name}`}
            className="min-w-[600px] w-full"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  )
}

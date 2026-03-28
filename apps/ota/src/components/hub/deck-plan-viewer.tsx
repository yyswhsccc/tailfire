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
      {/* Deck selector — scrollable pills with prev/next */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
          disabled={activeIndex === 0}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#eee] bg-white text-[#888] transition-colors hover:border-[#C59746] hover:text-[#C59746] disabled:opacity-30"
          aria-label="Previous deck"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1">
          {viewable.map((deck, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                i === activeIndex
                  ? 'bg-[#C59746] text-white shadow-sm'
                  : 'bg-[#f5f5f0] text-[#666] hover:bg-[#eee]'
              }`}
            >
              {deck.name}
            </button>
          ))}
        </div>

        <button
          onClick={() => setActiveIndex((i) => Math.min(viewable.length - 1, i + 1))}
          disabled={activeIndex === viewable.length - 1}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#eee] bg-white text-[#888] transition-colors hover:border-[#C59746] hover:text-[#C59746] disabled:opacity-30"
          aria-label="Next deck"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Deck plan card — image at natural readable size */}
      <div className="overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white">
        <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-2.5">
          <p className="text-sm font-semibold text-[#1A1A1A]">{active.name}</p>
          <p className="text-[11px] text-[#aaa]">{activeIndex + 1} of {viewable.length}</p>
        </div>

        {/* Horizontally scrollable on mobile, contained on desktop */}
        <div className="overflow-x-auto bg-[#fafaf8] p-3">
          <img
            src={active.deckPlanUrl!}
            alt={`${shipName} — ${active.name}`}
            className="mx-auto block max-h-[600px] w-auto"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  )
}

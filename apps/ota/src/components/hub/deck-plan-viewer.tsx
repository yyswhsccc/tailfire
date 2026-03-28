'use client'

import { useState, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, Minus, RotateCcw } from 'lucide-react'

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
  const [zoom, setZoom] = useState(0.75)
  const viewportRef = useRef<HTMLDivElement>(null)

  if (viewable.length === 0) return null
  const active = viewable[activeIndex]!

  const handleDeckChange = useCallback((i: number) => {
    setActiveIndex(i)
    setZoom(0.75)
    // Scroll viewport back to top when switching decks
    viewportRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const adjustZoom = useCallback((delta: number) => {
    setZoom((z) => Math.min(3, Math.max(0.5, z + delta)))
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Only zoom when Ctrl/Cmd is held, otherwise let it scroll naturally
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      adjustZoom(e.deltaY < 0 ? 0.15 : -0.15)
    }
  }, [adjustZoom])

  return (
    <div>
      {/* Deck selector pills */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => handleDeckChange(Math.max(0, activeIndex - 1))}
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
              onClick={() => handleDeckChange(i)}
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
          onClick={() => handleDeckChange(Math.min(viewable.length - 1, activeIndex + 1))}
          disabled={activeIndex === viewable.length - 1}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#eee] bg-white text-[#888] transition-colors hover:border-[#C59746] hover:text-[#C59746] disabled:opacity-30"
          aria-label="Next deck"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Deck plan viewer */}
      <div className="overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white">
        {/* Header with deck name + zoom controls */}
        <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-2.5">
          <div>
            <p className="text-sm font-semibold text-[#1A1A1A]">{active.name}</p>
            <p className="text-[11px] text-[#aaa]">{activeIndex + 1} of {viewable.length}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => adjustZoom(-0.25)}
              disabled={zoom <= 0.5}
              className="flex size-7 items-center justify-center rounded-md text-[#888] hover:bg-[#f5f5f0] hover:text-[#1A1A1A] disabled:opacity-30"
              aria-label="Zoom out"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-[2.5rem] text-center text-[11px] text-[#888]">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => adjustZoom(0.25)}
              disabled={zoom >= 3}
              className="flex size-7 items-center justify-center rounded-md text-[#888] hover:bg-[#f5f5f0] hover:text-[#1A1A1A] disabled:opacity-30"
              aria-label="Zoom in"
            >
              <Plus className="size-3.5" />
            </button>
            {zoom !== 0.75 && (
              <button
                onClick={() => setZoom(0.75)}
                className="flex size-7 items-center justify-center rounded-md text-[#888] hover:bg-[#f5f5f0] hover:text-[#1A1A1A]"
                aria-label="Reset zoom"
              >
                <RotateCcw className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Fixed-height viewport — image fills width, scrolls vertically */}
        <div
          ref={viewportRef}
          className="h-[500px] overflow-auto bg-[#fafaf8] sm:h-[600px] lg:h-[700px]"
          onWheel={handleWheel}
        >
          <img
            src={active.deckPlanUrl!}
            alt={`${shipName} — ${active.name}`}
            className="block mx-auto"
            style={{
              width: `${zoom * 100}%`,
              maxWidth: 'none',
            }}
            draggable={false}
            loading="lazy"
          />
        </div>

        {/* Hint */}
        <div className="border-t border-[#f0f0f0] px-4 py-1.5 text-center text-[10px] text-[#aaa]">
          Scroll to browse · Ctrl+scroll to zoom · Use +/− buttons to adjust
        </div>
      </div>
    </div>
  )
}

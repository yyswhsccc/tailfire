'use client'

import { useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

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
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  if (viewable.length === 0) return null
  const active = viewable[activeIndex]!

  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const handleDeckChange = useCallback((index: number) => {
    setActiveIndex(index)
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const zoomIn = () => setZoom((z) => Math.min(3, z + 0.5))
  const zoomOut = () => {
    setZoom((z) => {
      const next = Math.max(1, z - 0.5)
      if (next === 1) setPan({ x: 0, y: 0 })
      return next
    })
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  const handlePointerUp = () => setIsDragging(false)

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY < 0) {
      setZoom((z) => Math.min(3, z + 0.2))
    } else {
      setZoom((z) => {
        const next = Math.max(1, z - 0.2)
        if (next === 1) setPan({ x: 0, y: 0 })
        return next
      })
    }
  }

  return (
    <div>
      {/* Deck selector strip */}
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

      {/* Deck plan viewport with pan/zoom */}
      <div className="overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white">
        {/* Header + zoom controls */}
        <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-2.5">
          <div>
            <p className="text-sm font-semibold text-[#1A1A1A]">{active.name}</p>
            <p className="text-[11px] text-[#aaa]">{activeIndex + 1} of {viewable.length}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={zoomOut} disabled={zoom <= 1} className="flex size-8 items-center justify-center rounded-lg text-[#888] hover:bg-[#f5f5f0] hover:text-[#1A1A1A] disabled:opacity-30" aria-label="Zoom out">
              <ZoomOut className="size-4" />
            </button>
            <span className="min-w-[3rem] text-center text-xs text-[#888]">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn} disabled={zoom >= 3} className="flex size-8 items-center justify-center rounded-lg text-[#888] hover:bg-[#f5f5f0] hover:text-[#1A1A1A] disabled:opacity-30" aria-label="Zoom in">
              <ZoomIn className="size-4" />
            </button>
            <button onClick={resetView} className="flex size-8 items-center justify-center rounded-lg text-[#888] hover:bg-[#f5f5f0] hover:text-[#1A1A1A]" aria-label="Reset view">
              <Maximize2 className="size-4" />
            </button>
          </div>
        </div>

        {/* Constrained viewport — fixed height, pan/zoom inside */}
        <div
          className="relative h-[350px] overflow-hidden bg-[#fafaf8] sm:h-[450px] lg:h-[550px]"
          style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default', touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          <img
            src={active.deckPlanUrl!}
            alt={`${shipName} — ${active.name}`}
            className="absolute left-1/2 top-1/2 max-w-none select-none"
            style={{
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
              maxHeight: zoom === 1 ? '100%' : 'none',
              width: zoom === 1 ? 'auto' : undefined,
            }}
            draggable={false}
            loading="lazy"
          />
        </div>

        {/* Hint bar */}
        <div className="border-t border-[#f0f0f0] px-4 py-2 text-center text-[10px] text-[#aaa]">
          Scroll to zoom · Drag to pan when zoomed · Click ⊡ to reset
        </div>
      </div>
    </div>
  )
}

'use client'

import { Check } from 'lucide-react'
import type { SharedItineraryDto } from '@tailfire/shared-types'
import { Button } from '@tailfire/ui-public'

export type ViewMode = 'tabs' | 'compare' | 'summary'

interface ItineraryNavProps {
  itineraries: SharedItineraryDto[]
  activeTab: string
  onTabChange: (id: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  clientSelectedId: string | null
}

export function ItineraryNav({
  itineraries,
  activeTab,
  onTabChange,
  viewMode,
  onViewModeChange,
  clientSelectedId,
}: ItineraryNavProps) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Itinerary tabs */}
        <div className="flex gap-2 overflow-x-auto">
          {itineraries.map((it) => (
            <button
              key={it.id}
              onClick={() => {
                onTabChange(it.id)
                onViewModeChange('tabs')
              }}
              className={[
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
                activeTab === it.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
                clientSelectedId === it.id ? 'ring-2 ring-green-500/50' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {it.name}
              {clientSelectedId === it.id && (
                <Check className="h-3 w-3 ml-1 inline" />
              )}
            </button>
          ))}
        </div>

        {/* View mode toggles */}
        <div className="flex gap-1 bg-muted rounded-md p-0.5 shrink-0">
          {(['tabs', 'compare', 'summary'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={[
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                viewMode === mode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {mode === 'tabs' ? 'Single' : mode === 'compare' ? 'Compare' : 'Summary'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

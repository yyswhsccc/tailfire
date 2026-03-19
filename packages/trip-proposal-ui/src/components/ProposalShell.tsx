'use client'

import { useState } from 'react'
import type { SharedTripProposalDto, SharedActivityDto } from '@tailfire/shared-types/api'
import { DaySection } from './DaySection'
import { PricingSummary } from './PricingSummary'
import { ActivityDetailModal } from './ActivityDetailModal'
import { ItineraryNav, type ViewMode } from './ItineraryNav'
import { SideBySideComparison } from './SideBySideComparison'
import { SummaryComparison } from './SummaryComparison'

interface ProposalShellProps {
  trip: SharedTripProposalDto
  /** When true, renders in preview mode (hides interactive client features) */
  isPreview?: boolean
  /** Override pricing visibility (defaults to trip.pricingVisible) */
  showPricing?: boolean
}

export function ProposalShell({
  trip,
  isPreview = false,
  showPricing,
}: ProposalShellProps) {
  const itineraries = trip.proposedItineraries
  const isMulti = itineraries.length > 1
  const pricingVisible = showPricing ?? trip.pricingVisible

  const [activeTab, setActiveTab] = useState<string>(
    trip.clientSelectedItineraryId || itineraries[0]?.id || '',
  )
  const [viewMode, setViewMode] = useState<ViewMode>('tabs')
  const [selectedActivity, setSelectedActivity] = useState<SharedActivityDto | null>(null)

  const activeItinerary = itineraries.find((it) => it.id === activeTab) || itineraries[0]

  return (
    <>
      {/* Multi-itinerary navigation */}
      {isMulti && (
        <ItineraryNav
          itineraries={itineraries}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          clientSelectedId={isPreview ? null : trip.clientSelectedItineraryId}
        />
      )}

      {/* View: Single itinerary (tabs mode) */}
      {viewMode === 'tabs' && activeItinerary && (
        <>
          {activeItinerary.overview && (
            <div className="max-w-3xl mx-auto px-4 mt-8">
              <p className="text-muted-foreground leading-relaxed">
                {activeItinerary.overview}
              </p>
            </div>
          )}

          {activeItinerary.days.length > 0 && (
            <div className="max-w-3xl mx-auto px-4 mt-10 space-y-8">
              {activeItinerary.days.map((day) => (
                <DaySection
                  key={day.id}
                  day={day}
                  currency={trip.currency}
                  onActivityClick={setSelectedActivity}
                />
              ))}
            </div>
          )}

          {pricingVisible && activeItinerary && (
            <div className="max-w-3xl mx-auto px-4 mt-10">
              <PricingSummary itinerary={activeItinerary} currency={trip.currency} />
            </div>
          )}
        </>
      )}

      {/* View: Side-by-side comparison */}
      {viewMode === 'compare' && (
        <SideBySideComparison
          itineraries={itineraries}
          currency={trip.currency}
          pricingVisible={pricingVisible}
          clientSelectedId={isPreview ? null : trip.clientSelectedItineraryId}
        />
      )}

      {/* View: Summary comparison table */}
      {viewMode === 'summary' && (
        <SummaryComparison
          itineraries={itineraries}
          currency={trip.currency}
          pricingVisible={pricingVisible}
          clientSelectedId={isPreview ? null : trip.clientSelectedItineraryId}
        />
      )}

      {/* Activity detail modal */}
      <ActivityDetailModal
        activity={selectedActivity}
        currency={trip.currency}
        pricingVisible={pricingVisible}
        onClose={() => setSelectedActivity(null)}
      />
    </>
  )
}

'use client'

import { useState, useCallback } from 'react'
import type {
  SharedTripProposalDto,
  SharedActivityDto,
  SharedItineraryDto,
  ClientActivityResponseType,
  ProposalCommentDto,
} from '@tailfire/shared-types/api'
import { DaySection } from './DaySection'
import { PricingSummary } from './PricingSummary'
import { ActivityDetailModal } from './ActivityDetailModal'
import { ItineraryNav, type ViewMode } from './ItineraryNav'
import { SideBySideComparison } from './SideBySideComparison'
import { SummaryComparison } from './SummaryComparison'

export interface ProposalShellProps {
  trip: SharedTripProposalDto
  /** When true, hides interactive client features (comments, approval, responses) */
  isPreview?: boolean
  /** Override pricing visibility (defaults to trip.pricingVisible) */
  showPricing?: boolean

  // --- Interaction callbacks (optional — used by client app, omitted in preview) ---

  /** Comments data for the active itinerary */
  comments?: ProposalCommentDto[]
  /** Comment counts by activity/day ID */
  commentCounts?: Record<string, number>
  /** Add a comment */
  onAddComment?: (activityId: string | null, content: string, dayId?: string | null) => Promise<void>
  /** Activity response map (confirmed/declined) */
  responseMap?: Record<string, ClientActivityResponseType>
  /** Confirm an activity */
  onConfirmActivity?: (activityId: string) => void
  /** Decline an activity */
  onDeclineActivity?: (activityId: string) => void
  /** Render a comment button for an activity */
  renderCommentButton?: (activityId: string) => React.ReactNode
  /** Render a comment button for a day */
  renderDayCommentButton?: (props: { dayId: string }) => React.ReactNode
  /** Render the approval section below the itinerary */
  renderApprovalSection?: (props: {
    activeItinerary: SharedItineraryDto
    isMulti: boolean
    clientSelectedId: string | null
    onChangeSelection: () => void
  }) => React.ReactNode
  /** Handle itinerary selection (multi-itinerary) */
  onSelectItinerary?: (itineraryId: string) => void
}

export function ProposalShell({
  trip,
  isPreview = false,
  showPricing,
  comments: _comments,
  commentCounts: _commentCounts,
  onAddComment: _onAddComment,
  responseMap,
  onConfirmActivity,
  onDeclineActivity,
  renderCommentButton,
  renderDayCommentButton,
  renderApprovalSection,
  onSelectItinerary,
}: ProposalShellProps) {
  const itineraries = trip.proposedItineraries
  const isMulti = itineraries.length > 1
  const pricingVisible = showPricing ?? trip.pricingVisible

  const [activeTab, setActiveTab] = useState<string>(
    trip.clientSelectedItineraryId || itineraries[0]?.id || '',
  )
  const [viewMode, setViewMode] = useState<ViewMode>('tabs')
  const [selectedActivity, setSelectedActivity] = useState<SharedActivityDto | null>(null)
  const [clientSelectedId, setClientSelectedId] = useState<string | null>(
    trip.clientSelectedItineraryId,
  )

  const activeItinerary = itineraries.find((it) => it.id === activeTab) || itineraries[0]

  const handleSelectItinerary = useCallback(
    (itineraryId: string) => {
      setClientSelectedId(itineraryId)
      onSelectItinerary?.(itineraryId)
    },
    [onSelectItinerary],
  )

  if (!activeItinerary) {
    return (
      <div className="max-w-3xl mx-auto px-4 mt-10 text-center text-muted-foreground">
        <p>No itineraries available to preview.</p>
      </div>
    )
  }

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
          clientSelectedId={isPreview ? null : clientSelectedId}
        />
      )}

      {/* View: Single itinerary (tabs mode) */}
      {viewMode === 'tabs' && (
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
                  renderDayCommentButton={renderDayCommentButton}
                  renderCommentButton={renderCommentButton}
                  responseMap={responseMap}
                  onConfirmActivity={onConfirmActivity}
                  onDeclineActivity={onDeclineActivity}
                />
              ))}
            </div>
          )}

          {pricingVisible && (
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
          clientSelectedId={isPreview ? null : clientSelectedId}
          onSelect={isPreview ? undefined : handleSelectItinerary}
        />
      )}

      {/* View: Summary comparison table */}
      {viewMode === 'summary' && (
        <SummaryComparison
          itineraries={itineraries}
          currency={trip.currency}
          pricingVisible={pricingVisible}
          clientSelectedId={isPreview ? null : clientSelectedId}
          onSelect={isPreview ? undefined : handleSelectItinerary}
        />
      )}

      {/* Approval section (client only) */}
      {!isPreview && renderApprovalSection && (
        <div className="max-w-3xl mx-auto px-4 mt-10 mb-16">
          {renderApprovalSection({
            activeItinerary,
            isMulti,
            clientSelectedId,
            onChangeSelection: () => setViewMode('compare'),
          })}
        </div>
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

'use client'

import { useState, useCallback } from 'react'
import type { SharedTripProposalDto, SharedActivityDto } from '@tailfire/shared-types'
import { DaySection } from './DaySection'
import { PricingSummary } from './PricingSummary'
import { ApprovalSection } from './ApprovalSection'
import { ActivityCommentButton } from './ActivityCommentButton'
import { ActivityDetailModal } from './ActivityDetailModal'
import { useProposalComments } from './useProposalComments'
import { useActivityResponses } from './useActivityResponses'
import { ItineraryNav, type ViewMode } from './ItineraryNav'
import { SideBySideComparison } from './SideBySideComparison'
import { SummaryComparison } from './SummaryComparison'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'

export function ProposalClientShell({
  trip,
  token,
}: {
  trip: SharedTripProposalDto
  token: string
}) {
  const itineraries = trip.proposedItineraries
  const isMulti = itineraries.length > 1

  const [activeTab, setActiveTab] = useState<string>(
    trip.clientSelectedItineraryId || itineraries[0]?.id || '',
  )
  const [viewMode, setViewMode] = useState<ViewMode>('tabs')
  const [clientSelectedId, setClientSelectedId] = useState<string | null>(
    trip.clientSelectedItineraryId,
  )

  const activeItinerary = itineraries.find((it) => it.id === activeTab) || itineraries[0]

  // Per-itinerary hooks
  const { comments, commentCounts, addComment } = useProposalComments(token, activeTab)
  const { responseMap, submitResponse } = useActivityResponses(
    token,
    activeItinerary?.publishedVersion ?? null,
    activeTab,
  )
  const [selectedActivity, setSelectedActivity] = useState<SharedActivityDto | null>(null)

  const generalComments = comments.filter((c) => !c.activityId && !c.dayId)

  const handleSelectItinerary = useCallback(
    async (itineraryId: string) => {
      try {
        const res = await fetch(`${API_URL}/trips/share/${token}/select`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itineraryId }),
        })
        if (res.ok) {
          setClientSelectedId(itineraryId)
        }
      } catch {
        // Silently fail
      }
    },
    [token],
  )

  const selectedItineraryName =
    itineraries.find((it) => it.id === clientSelectedId)?.name ?? null

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
          clientSelectedId={clientSelectedId}
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
                  comments={comments}
                  commentCounts={commentCounts}
                  onAddComment={async (activityId, content, dayId) => {
                    await addComment(activityId, content, dayId)
                  }}
                  onActivityClick={setSelectedActivity}
                  responseMap={responseMap}
                  onConfirmActivity={(activityId) =>
                    submitResponse(activityId, 'confirmed')
                  }
                  onDeclineActivity={(activityId) =>
                    submitResponse(activityId, 'declined')
                  }
                  renderCommentButton={(activityId) => (
                    <ActivityCommentButton
                      activityId={activityId}
                      comments={comments}
                      count={commentCounts[activityId] || 0}
                      onSubmit={async (content) => {
                        await addComment(activityId, content)
                      }}
                    />
                  )}
                />
              ))}
            </div>
          )}

          {trip.pricingVisible && activeItinerary && (
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
          pricingVisible={trip.pricingVisible}
          clientSelectedId={clientSelectedId}
          onSelect={handleSelectItinerary}
        />
      )}

      {/* View: Summary comparison table */}
      {viewMode === 'summary' && (
        <SummaryComparison
          itineraries={itineraries}
          currency={trip.currency}
          pricingVisible={trip.pricingVisible}
          clientSelectedId={clientSelectedId}
          onSelect={handleSelectItinerary}
        />
      )}

      {/* Approval section */}
      {itineraries.length > 0 && (
        <div className="max-w-3xl mx-auto px-4 mt-10 mb-16">
          <ApprovalSection
            token={token}
            initialStatus={activeItinerary?.status ?? 'proposing'}
            generalComments={generalComments}
            onAddComment={async (content) => {
              await addComment(null, content)
            }}
            isMulti={isMulti}
            clientSelectedId={clientSelectedId}
            selectedItineraryName={selectedItineraryName}
            onChangeSelection={() => setViewMode('compare')}
          />
        </div>
      )}

      {/* Activity detail modal */}
      <ActivityDetailModal
        activity={selectedActivity}
        currency={trip.currency}
        pricingVisible={trip.pricingVisible}
        onClose={() => setSelectedActivity(null)}
      />
    </>
  )
}

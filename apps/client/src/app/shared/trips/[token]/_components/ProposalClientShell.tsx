'use client'

import { useState } from 'react'
import type { SharedTripProposalDto, SharedActivityDto } from '@tailfire/shared-types'
import { DaySection } from './DaySection'
import { PricingSummary } from './PricingSummary'
import { ApprovalSection } from './ApprovalSection'
import { ActivityCommentButton } from './ActivityCommentButton'
import { ActivityDetailModal } from './ActivityDetailModal'
import { useProposalComments } from './useProposalComments'
import { useActivityResponses } from './useActivityResponses'

export function ProposalClientShell({
  trip,
  token,
}: {
  trip: SharedTripProposalDto
  token: string
}) {
  const { comments, commentCounts, addComment } = useProposalComments(token)
  const { responseMap, submitResponse } = useActivityResponses(
    token,
    trip.itinerary?.publishedVersion ?? null,
  )
  const [selectedActivity, setSelectedActivity] = useState<SharedActivityDto | null>(null)
  const itinerary = trip.itinerary

  const generalComments = comments.filter((c) => !c.activityId && !c.dayId)

  return (
    <>
      {/* Itinerary overview */}
      {itinerary?.overview && (
        <div className="max-w-3xl mx-auto px-4 mt-8">
          <p className="text-muted-foreground leading-relaxed">{itinerary.overview}</p>
        </div>
      )}

      {/* Day-by-day itinerary */}
      {itinerary && itinerary.days.length > 0 && (
        <div className="max-w-3xl mx-auto px-4 mt-10 space-y-8">
          {itinerary.days.map((day) => (
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
              onConfirmActivity={(activityId) => submitResponse(activityId, 'confirmed')}
              onDeclineActivity={(activityId) => submitResponse(activityId, 'declined')}
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

      {/* Pricing summary */}
      {trip.pricingVisible && itinerary && (
        <div className="max-w-3xl mx-auto px-4 mt-10">
          <PricingSummary itinerary={itinerary} currency={trip.currency} />
        </div>
      )}

      {/* Approval section */}
      {itinerary && (
        <div className="max-w-3xl mx-auto px-4 mt-10 mb-16">
          <ApprovalSection
            token={token}
            initialStatus={itinerary.status}
            generalComments={generalComments}
            onAddComment={async (content) => {
              await addComment(null, content)
            }}
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

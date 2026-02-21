'use client'

import { Info, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ItineraryResponseDto, ClientActivityResponseType } from '@tailfire/shared-types/api'

interface ClientFeedbackBannerProps {
  itinerary: ItineraryResponseDto
  responseMap: Record<string, ClientActivityResponseType> | undefined
  commentCounts: Record<string, number> | undefined
}

/**
 * Banner showing client feedback status for a proposed itinerary.
 * Only shown when itinerary status is proposing/approved/declined.
 */
export function ClientFeedbackBanner({
  itinerary,
  responseMap,
  commentCounts,
}: ClientFeedbackBannerProps) {
  const status = itinerary.status

  // Only show for proposal-related statuses
  if (!['proposing', 'approved', 'declined'].includes(status)) {
    return null
  }

  // Count responses
  const confirmedCount = responseMap
    ? Object.values(responseMap).filter((r) => r === 'confirmed').length
    : 0
  const declinedCount = responseMap
    ? Object.values(responseMap).filter((r) => r === 'declined').length
    : 0
  const hasResponses = confirmedCount > 0 || declinedCount > 0

  // Count client comments only (filter out agent comments by checking authorType via commentCounts)
  // commentCounts is keyed by activityId with total counts — for the banner we show total comment count
  const totalClientComments = commentCounts
    ? Object.entries(commentCounts)
        .filter(([key]) => !key.startsWith('day:'))
        .reduce((sum, [, count]) => sum + count, 0)
    : 0

  if (status === 'approved') {
    return (
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
        'bg-emerald-50 border border-emerald-200 text-emerald-800'
      )}>
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
        <span>Client approved this proposal.</span>
      </div>
    )
  }

  if (status === 'declined') {
    return (
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
        'bg-red-50 border border-red-200 text-red-800'
      )}>
        <XCircle className="h-4 w-4 flex-shrink-0" />
        <span>Client declined this proposal.</span>
      </div>
    )
  }

  // Status is 'proposing'
  const parts: string[] = []
  if (confirmedCount > 0) parts.push(`${confirmedCount} confirmed`)
  if (declinedCount > 0) parts.push(`${declinedCount} declined`)
  if (totalClientComments > 0) parts.push(`${totalClientComments} comment${totalClientComments !== 1 ? 's' : ''}`)

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
      'bg-blue-50 border border-blue-200 text-blue-800'
    )}>
      <Info className="h-4 w-4 flex-shrink-0" />
      {hasResponses || totalClientComments > 0 ? (
        <span>
          Client is reviewing — {parts.join(', ')}.
        </span>
      ) : (
        <span>Proposal sent to client. Awaiting review.</span>
      )}
    </div>
  )
}

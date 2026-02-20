'use client'

import { useState } from 'react'
import { MoreHorizontal, Check, X } from 'lucide-react'
import { Card, CardContent, Badge, Button } from '@tailfire/ui-public'
import type { SharedActivityDto, ClientActivityResponseType } from '@tailfire/shared-types'
import {
  typeIcons,
  statusVariants,
  formatCurrency,
  renderActivityDetail,
} from './activity-presentation'

const responseStyles: Record<ClientActivityResponseType, { label: string; className: string }> = {
  confirmed: { label: 'Approved', className: 'bg-green-500/10 text-green-400 border-green-500/30' },
  declined: { label: 'Declined', className: 'bg-red-500/10 text-red-400 border-red-500/30' },
}

export function ActivityCard({
  activity,
  currency,
  nested = false,
  commentButton,
  onClickTitle,
  response,
  onConfirm,
  onDecline,
}: {
  activity: SharedActivityDto
  currency: string
  nested?: boolean
  commentButton?: React.ReactNode
  onClickTitle?: () => void
  response?: ClientActivityResponseType | null
  onConfirm?: () => void
  onDecline?: () => void
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const Icon = typeIcons[activity.activityType] || MoreHorizontal
  const statusInfo = statusVariants[activity.status] || statusVariants.proposed

  const handleConfirm = async () => {
    if (!onConfirm || isSubmitting) return
    setIsSubmitting(true)
    try { onConfirm() } finally { setIsSubmitting(false) }
  }

  const handleDecline = async () => {
    if (!onDecline || isSubmitting) return
    setIsSubmitting(true)
    try { onDecline() } finally { setIsSubmitting(false) }
  }

  return (
    <Card className={nested ? 'bg-card/50 border-border/50' : 'bg-card border-border'}>
      <CardContent className={nested ? 'p-3' : 'p-4'}>
        {/* Header: icon, name, status badge, price */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 text-primary shrink-0" />
            {onClickTitle ? (
              <button
                type="button"
                aria-label={`View details for ${activity.name}`}
                onClick={onClickTitle}
                className="font-medium truncate hover:underline cursor-pointer text-left"
              >
                {activity.name}
              </button>
            ) : (
              <span className="font-medium truncate">{activity.name}</span>
            )}
            <Badge variant="outline" className={`text-[10px] shrink-0 ${statusInfo.className}`}>
              {statusInfo.label}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {activity.pricing && (
              <span className="text-sm font-medium text-primary whitespace-nowrap">
                {formatCurrency(activity.pricing.totalPriceCents, activity.pricing.currency)}
              </span>
            )}
            {commentButton}
          </div>
        </div>

        {/* Description */}
        {activity.description && (
          <p className="text-sm text-muted-foreground mb-3">{activity.description}</p>
        )}

        {/* Thumbnail */}
        {activity.thumbnail && (
          <div className="mb-3 rounded-md overflow-hidden">
            <img
              src={activity.thumbnail}
              alt={activity.name}
              className="w-full h-32 object-cover"
            />
          </div>
        )}

        {/* Type-specific detail */}
        {activity.detail && renderActivityDetail(activity, currency)}

        {/* Confirmation number */}
        {activity.confirmationNumber && (
          <div className="mt-2 text-xs text-muted-foreground">
            Confirmation: {activity.confirmationNumber}
          </div>
        )}

        {/* Activity response buttons */}
        {(onConfirm || onDecline) && (
          <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
            {response ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={responseStyles[response].className}>
                  {responseStyles[response].label}
                </Badge>
                <button
                  type="button"
                  onClick={response === 'confirmed' ? handleDecline : handleConfirm}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  disabled={isSubmitting}
                >
                  Change to {response === 'confirmed' ? 'decline' : 'approve'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 gap-1 text-green-400 border-green-500/30 hover:bg-green-500/10"
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span className="text-xs">Approve</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
                  onClick={handleDecline}
                  disabled={isSubmitting}
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="text-xs">Decline</span>
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

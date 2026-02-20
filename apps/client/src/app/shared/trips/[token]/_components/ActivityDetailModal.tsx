'use client'

import { MapPin, Clock } from 'lucide-react'
import { MoreHorizontal } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Badge,
  Separator,
} from '@tailfire/ui-public'
import type { SharedActivityDto } from '@tailfire/shared-types'
import {
  typeIcons,
  statusVariants,
  formatCurrency,
  renderActivityDetail,
} from './activity-presentation'

function formatDateRange(
  startDatetime: string | null,
  endDatetime: string | null,
  timezone: string | null,
) {
  if (!startDatetime) return null

  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }

  if (timezone) {
    try {
      // Validate timezone by attempting a format
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
      opts.timeZone = timezone
    } catch {
      // Invalid timezone — format without it
    }
  }

  try {
    const start = new Date(startDatetime).toLocaleString('en-US', opts)
    if (!endDatetime) return start
    const end = new Date(endDatetime).toLocaleString('en-US', opts)
    return `${start} — ${end}`
  } catch {
    // Fallback to raw strings
    if (!endDatetime) return startDatetime
    return `${startDatetime} — ${endDatetime}`
  }
}

export function ActivityDetailModal({
  activity,
  currency,
  pricingVisible,
  onClose,
}: {
  activity: SharedActivityDto | null
  currency: string
  pricingVisible: boolean
  onClose: () => void
}) {
  if (!activity) return null

  const Icon = typeIcons[activity.activityType] || MoreHorizontal
  const statusInfo = statusVariants[activity.status] || statusVariants.proposed
  const dateRange = formatDateRange(activity.startDatetime, activity.endDatetime, activity.timezone)

  return (
    <Dialog open={!!activity} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        {/* Thumbnail */}
        {activity.thumbnail && (
          <img
            src={activity.thumbnail}
            alt={activity.name}
            className="w-full h-48 object-cover rounded-t-lg"
          />
        )}

        <div className="px-6 pb-6 space-y-4">
          {/* Header */}
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary shrink-0" />
              <DialogTitle className="text-xl">{activity.name}</DialogTitle>
              <Badge variant="outline" className={`text-[10px] shrink-0 ${statusInfo.className}`}>
                {statusInfo.label}
              </Badge>
            </div>
            <DialogDescription className="sr-only">
              Details for {activity.name}
            </DialogDescription>
          </DialogHeader>

          {/* Date/time */}
          {dateRange && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              <span>{dateRange}</span>
            </div>
          )}

          {/* Location */}
          {activity.location && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>
                {activity.location}
                {activity.address && ` — ${activity.address}`}
              </span>
            </div>
          )}

          {/* Description */}
          {activity.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {activity.description}
            </p>
          )}

          {/* Type-specific detail */}
          {activity.detail && (
            <>
              <Separator />
              {renderActivityDetail(activity, currency)}
            </>
          )}

          {/* Pricing breakdown */}
          {pricingVisible && activity.pricing && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Total</span>
                  <span className="text-lg font-semibold text-primary">
                    {formatCurrency(activity.pricing.totalPriceCents, activity.pricing.currency)}
                  </span>
                </div>
                {activity.pricing.breakdownItems && activity.pricing.breakdownItems.length > 0 && (
                  <div className="space-y-1">
                    {activity.pricing.breakdownItems.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{item.description}</span>
                        <span>{formatCurrency(item.amountCents, activity.pricing!.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Confirmation number */}
          {activity.confirmationNumber && (
            <>
              <Separator />
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Confirmation:</span>{' '}
                {activity.confirmationNumber}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

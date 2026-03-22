'use client'

import { useState, useCallback } from 'react'
import { MapPin, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
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
  const statusInfo = statusVariants[activity.proposalStatus] || statusVariants.draft
  const dateRange = formatDateRange(activity.startDatetime, activity.endDatetime, activity.timezone)

  // Use media array if available, fall back to thumbnail
  const images = activity.media && activity.media.length > 0
    ? activity.media
    : activity.thumbnail
      ? [{ url: activity.thumbnail, caption: null }]
      : []

  return (
    <Dialog open={!!activity} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        {/* Image Gallery */}
        {images.length > 0 && (
          <ImageGallery images={images} activityName={activity.name} />
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

/**
 * Image gallery with navigation for activity detail modal.
 * Single image: shows full image with no controls.
 * Multiple images: shows carousel with prev/next arrows and dot indicators.
 */
function ImageGallery({
  images,
  activityName,
}: {
  images: Array<{ url: string; caption: string | null }>
  activityName: string
}) {
  const [currentIndex, setCurrentIndex] = useState(0)

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index)
  }, [])

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  }, [images.length])

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
  }, [images.length])

  const current = images[currentIndex]
  if (!current) return null

  return (
    <div className="relative">
      {/* Main image */}
      <div className="relative w-full aspect-[16/9] bg-muted overflow-hidden rounded-t-lg">
        <img
          src={current.url}
          alt={current.caption || activityName}
          className="w-full h-full object-cover"
        />

        {/* Caption overlay */}
        {current.caption && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3">
            <p className="text-sm text-white">{current.caption}</p>
          </div>
        )}
      </div>

      {/* Navigation controls — only if multiple images */}
      {images.length > 1 && (
        <>
          {/* Prev/Next arrows */}
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => goTo(index)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  index === currentIndex
                    ? 'bg-white'
                    : 'bg-white/50 hover:bg-white/75'
                }`}
                aria-label={`Go to image ${index + 1}`}
              />
            ))}
          </div>

          {/* Counter */}
          <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
            {currentIndex + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  )
}

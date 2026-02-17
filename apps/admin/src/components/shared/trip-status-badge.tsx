'use client'

import { Badge } from '@/components/ui/badge'
import { getTripStatusLabel, getTripStatusVariant, type TripStatus } from '@/lib/trip-status-constants'

interface TripStatusBadgeProps {
  status: TripStatus
  className?: string
}

/**
 * Trip Status Badge
 * Displays a colored badge for trip status using Badge variants
 */
export function TripStatusBadge({ status, className }: TripStatusBadgeProps) {
  const variant = getTripStatusVariant(status)
  const label = getTripStatusLabel(status)

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  )
}

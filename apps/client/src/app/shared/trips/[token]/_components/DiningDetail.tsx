import { Utensils } from 'lucide-react'
import type { SharedDiningDetailDto } from '@tailfire/shared-types'

export function DiningDetail({ detail }: { detail: SharedDiningDetailDto }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Utensils className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {detail.restaurantName && (
          <div className="font-medium">{detail.restaurantName}</div>
        )}
        <div className="text-muted-foreground">
          {[detail.cuisineType, detail.mealType].filter(Boolean).join(' · ') || 'Dining'}
          {detail.priceRange && <span> · {detail.priceRange}</span>}
        </div>
        {(detail.reservationDate || detail.reservationTime) && (
          <div className="text-muted-foreground">
            Reservation: {detail.reservationDate}
            {detail.reservationTime && <span> at {detail.reservationTime.slice(0, 5)}</span>}
          </div>
        )}
        {detail.partySize && (
          <div className="text-muted-foreground">Party size: {detail.partySize}</div>
        )}
        {detail.dressCode && (
          <div className="text-muted-foreground text-xs">Dress code: {detail.dressCode}</div>
        )}
      </div>
    </div>
  )
}

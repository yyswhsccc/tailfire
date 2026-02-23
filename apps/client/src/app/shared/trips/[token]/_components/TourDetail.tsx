import { Map } from 'lucide-react'
import type { SharedTourDetailDto } from '@tailfire/shared-types'

export function TourDetail({ detail }: { detail: SharedTourDetailDto }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Map className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {detail.tourName && (
          <div className="font-medium">{detail.tourName}</div>
        )}
        <div className="text-muted-foreground">
          {detail.days && <span>{detail.days} days</span>}
          {detail.nights && <span> / {detail.nights} nights</span>}
        </div>
        {(detail.startCity || detail.endCity) && (
          <div className="text-muted-foreground">
            {detail.startCity}
            {detail.startCity && detail.endCity && <span> &rarr; </span>}
            {detail.endCity}
          </div>
        )}
        {detail.itineraryDays.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="text-xs font-medium text-foreground/80">Itinerary</div>
            {detail.itineraryDays.map((day, i) => (
              <div key={i} className="text-xs text-muted-foreground pl-2 border-l border-border">
                <span className="font-medium">Day {day.dayNumber}:</span>{' '}
                {day.title || day.description || 'No details'}
                {day.overnightCity && <span> &mdash; overnight in {day.overnightCity}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

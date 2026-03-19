import { Ship } from 'lucide-react'
import type { SharedCruiseDetailDto } from '@tailfire/shared-types/api'

export function CruiseDetail({ detail }: { detail: SharedCruiseDetailDto }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Ship className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {detail.cruiseLineName && (
          <div className="font-medium">{detail.cruiseLineName}</div>
        )}
        {detail.shipName && (
          <div className="text-muted-foreground">{detail.shipName}</div>
        )}
        {detail.itineraryName && (
          <div className="text-muted-foreground">{detail.itineraryName}</div>
        )}
        {(detail.departurePort || detail.arrivalPort) && (
          <div className="text-muted-foreground">
            {detail.departurePort && <span>{detail.departurePort}</span>}
            {detail.departurePort && detail.arrivalPort && <span> &rarr; </span>}
            {detail.arrivalPort && <span>{detail.arrivalPort}</span>}
          </div>
        )}
        {(detail.departureDate || detail.nights) && (
          <div className="text-muted-foreground">
            {detail.departureDate && <span>{detail.departureDate}</span>}
            {detail.nights && <span> · {detail.nights} nights</span>}
          </div>
        )}
        {detail.cabinCategory && (
          <div className="text-muted-foreground">
            Cabin: {detail.cabinCategory}
            {detail.cabinDescription && <span> &mdash; {detail.cabinDescription}</span>}
          </div>
        )}
        {detail.portCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="text-xs font-medium text-foreground/80">Port Calls</div>
            {detail.portCalls.map((port, i) => (
              <div key={i} className="text-xs text-muted-foreground pl-2 border-l border-border">
                Day {port.day}: {port.portName}
                {port.arriveTime && <span> (arr. {port.arriveTime})</span>}
                {port.departTime && <span> (dep. {port.departTime})</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { Car } from 'lucide-react'
import type { SharedTransportDetailDto, SharedTransportLegDto } from '@tailfire/shared-types/api'

const subtypeLabels: Record<string, string> = {
  transfer: 'Transfer',
  car_rental: 'Car Rental',
  private_car: 'Private Car',
  taxi: 'Taxi',
  shuttle: 'Shuttle',
  train: 'Train',
  ferry: 'Ferry',
  bus: 'Bus',
  limousine: 'Limousine',
}

function formatTime(time: string | null): string | null {
  if (!time) return null
  return time.slice(0, 5)
}

function Leg({ leg, isLast, idLabel }: { leg: SharedTransportLegDto; isLast: boolean; idLabel: string }) {
  const dep = [leg.departureStation, leg.departureDate, formatTime(leg.departureTime)]
    .filter(Boolean)
    .join(' • ')
  const arr = [leg.arrivalStation, leg.arrivalDate, formatTime(leg.arrivalTime)]
    .filter(Boolean)
    .join(' • ')
  return (
    <div className="text-muted-foreground">
      <div>
        <span className="font-medium text-foreground/80">{idLabel}</span>{' '}
        {[leg.operator, leg.trainNumber].filter(Boolean).join(' — ') || '—'}
      </div>
      {dep && <div className="pl-3">From: {dep}</div>}
      {arr && <div className="pl-3">To: {arr}</div>}
      {!isLast && typeof leg.interchangeMinutesAfter === 'number' && leg.interchangeMinutesAfter > 0 && (
        <div className="pl-3 text-xs italic">Interchange: {leg.interchangeMinutesAfter} min</div>
      )}
    </div>
  )
}

export function TransportDetail({ detail }: { detail: SharedTransportDetailDto }) {
  const label = detail.subtype ? subtypeLabels[detail.subtype] || detail.subtype : 'Transportation'
  const legs = Array.isArray(detail.legs) ? detail.legs : []
  const hasLegs = legs.length > 0
  const hasStations = Boolean(detail.departureStation || detail.arrivalStation)

  return (
    <div className="flex items-start gap-3 text-sm">
      <Car className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        <div className="font-medium">{label}</div>
        {detail.providerName && (
          <div className="text-muted-foreground">{detail.providerName}</div>
        )}
        {detail.vehicleType && (
          <div className="text-muted-foreground">{detail.vehicleType}</div>
        )}
        {hasLegs ? (
          <div className="space-y-1.5 pt-1">
            {legs.map((leg, i) => (
              <Leg key={i} leg={leg} isLast={i === legs.length - 1} idLabel={`Leg ${i + 1}:`} />
            ))}
          </div>
        ) : hasStations ? (
          <>
            {detail.departureStation && (
              <div className="text-muted-foreground">
                <span className="font-medium text-foreground/80">From:</span> {detail.departureStation}
                {detail.pickupDate && <span> on {detail.pickupDate}</span>}
                {detail.pickupTime && <span> at {formatTime(detail.pickupTime)}</span>}
              </div>
            )}
            {detail.arrivalStation && (
              <div className="text-muted-foreground">
                <span className="font-medium text-foreground/80">To:</span> {detail.arrivalStation}
                {detail.dropoffDate && <span> on {detail.dropoffDate}</span>}
                {detail.dropoffTime && <span> at {formatTime(detail.dropoffTime)}</span>}
              </div>
            )}
          </>
        ) : (
          <>
            {detail.pickupAddress && (
              <div className="text-muted-foreground">
                <span className="font-medium text-foreground/80">Pickup:</span> {detail.pickupAddress}
                {detail.pickupDate && <span> on {detail.pickupDate}</span>}
                {detail.pickupTime && <span> at {formatTime(detail.pickupTime)}</span>}
              </div>
            )}
            {detail.dropoffAddress && (
              <div className="text-muted-foreground">
                <span className="font-medium text-foreground/80">Drop-off:</span> {detail.dropoffAddress}
                {detail.dropoffDate && <span> on {detail.dropoffDate}</span>}
                {detail.dropoffTime && <span> at {formatTime(detail.dropoffTime)}</span>}
              </div>
            )}
          </>
        )}
        {detail.isRoundTrip && (
          <div className="text-muted-foreground text-xs">Round trip</div>
        )}
      </div>
    </div>
  )
}

import { Car } from 'lucide-react'
import type { SharedTransportDetailDto } from '@tailfire/shared-types'

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

export function TransportDetail({ detail }: { detail: SharedTransportDetailDto }) {
  const label = detail.subtype ? subtypeLabels[detail.subtype] || detail.subtype : 'Transportation'

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
        {detail.pickupAddress && (
          <div className="text-muted-foreground">
            <span className="font-medium text-foreground/80">Pickup:</span> {detail.pickupAddress}
            {detail.pickupDate && <span> on {detail.pickupDate}</span>}
            {detail.pickupTime && <span> at {detail.pickupTime.slice(0, 5)}</span>}
          </div>
        )}
        {detail.dropoffAddress && (
          <div className="text-muted-foreground">
            <span className="font-medium text-foreground/80">Drop-off:</span> {detail.dropoffAddress}
            {detail.dropoffDate && <span> on {detail.dropoffDate}</span>}
            {detail.dropoffTime && <span> at {detail.dropoffTime.slice(0, 5)}</span>}
          </div>
        )}
        {detail.isRoundTrip && (
          <div className="text-muted-foreground text-xs">Round trip</div>
        )}
      </div>
    </div>
  )
}

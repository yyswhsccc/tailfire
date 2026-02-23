import { Hotel } from 'lucide-react'
import type { SharedLodgingDetailDto } from '@tailfire/shared-types'

export function LodgingDetail({ detail }: { detail: SharedLodgingDetailDto }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Hotel className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        {detail.propertyName && (
          <div className="font-medium">{detail.propertyName}</div>
        )}
        {(detail.checkInDate || detail.checkOutDate) && (
          <div className="text-muted-foreground">
            {detail.checkInDate && <span>Check-in: {detail.checkInDate}</span>}
            {detail.checkInTime && <span> at {detail.checkInTime.slice(0, 5)}</span>}
            {detail.checkOutDate && (
              <>
                <span className="mx-1">&mdash;</span>
                <span>Check-out: {detail.checkOutDate}</span>
              </>
            )}
            {detail.checkOutTime && <span> at {detail.checkOutTime.slice(0, 5)}</span>}
          </div>
        )}
        <div className="text-muted-foreground">
          {detail.roomType && <span>{detail.roomType}</span>}
          {detail.roomCount > 1 && <span> &times; {detail.roomCount} rooms</span>}
        </div>
        {detail.amenities.length > 0 && (
          <div className="text-muted-foreground text-xs">
            {detail.amenities.join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}

import Link from 'next/link'
import { MapPin, Waves } from 'lucide-react'

interface ItineraryStop {
  dayNumber: number
  portName: string
  isSeaDay: boolean
  arrivalTime: string | null
  departureTime: string | null
  destinationSlug: string | null
}

export function ItineraryTimeline({ stops }: { stops: ItineraryStop[] }) {
  return (
    <div className="space-y-0">
      {stops.map((stop, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className={`size-3 shrink-0 rounded-full ${stop.isSeaDay ? 'bg-sky-300' : 'bg-[#C59746]'}`} />
            {i < stops.length - 1 && <div className="w-px flex-1 bg-border" />}
          </div>
          <div className="pb-5">
            <p className="text-xs font-medium text-muted-foreground">Day {stop.dayNumber}</p>
            <div className="flex items-center gap-1.5">
              {stop.isSeaDay ? (
                <>
                  <Waves className="size-3.5 text-sky-400" />
                  <p className="text-sm italic text-muted-foreground">At Sea</p>
                </>
              ) : stop.destinationSlug ? (
                <>
                  <MapPin className="size-3.5 text-[#C59746]" />
                  <Link
                    href={`/destinations/${stop.destinationSlug}`}
                    className="text-sm font-medium text-[#1A1A1A] hover:text-[#C59746] hover:underline"
                  >
                    {stop.portName}
                  </Link>
                </>
              ) : (
                <>
                  <MapPin className="size-3.5 text-muted-foreground" />
                  <p className="text-sm text-[#1A1A1A]">{stop.portName}</p>
                </>
              )}
            </div>
            {!stop.isSeaDay && (stop.arrivalTime || stop.departureTime) && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {stop.arrivalTime && `Arrive ${stop.arrivalTime}`}
                {stop.arrivalTime && stop.departureTime && ' · '}
                {stop.departureTime && `Depart ${stop.departureTime}`}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

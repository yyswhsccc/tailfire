import { Plane } from 'lucide-react'
import type { SharedFlightDetailDto } from '@tailfire/shared-types'

function formatTime(time: string | null) {
  if (!time) return null
  // time is HH:MM:SS or HH:MM — display HH:MM
  return time.slice(0, 5)
}

export function FlightDetail({ detail }: { detail: SharedFlightDetailDto }) {
  const segments = detail.segments.length > 0 ? detail.segments : null

  // If multi-segment, render each segment
  if (segments && segments.length > 1) {
    return (
      <div className="space-y-3">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <Plane className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <div className="font-medium">
                {seg.departureAirportCode || '???'} &rarr; {seg.arrivalAirportCode || '???'}
              </div>
              <div className="text-muted-foreground">
                {[seg.airline, seg.flightNumber].filter(Boolean).join(' ') || 'Flight details pending'}
              </div>
              <div className="text-muted-foreground">
                {seg.departureDate && <span>{seg.departureDate}</span>}
                {formatTime(seg.departureTime) && <span> at {formatTime(seg.departureTime)}</span>}
                {formatTime(seg.arrivalTime) && <span> &mdash; arr. {formatTime(seg.arrivalTime)}</span>}
              </div>
              {(seg.departureTerminal || seg.arrivalTerminal) && (
                <div className="text-muted-foreground text-xs">
                  {seg.departureTerminal && <span>Terminal {seg.departureTerminal}</span>}
                  {seg.departureTerminal && seg.arrivalTerminal && <span> &rarr; </span>}
                  {seg.arrivalTerminal && <span>Terminal {seg.arrivalTerminal}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Single flight (from flight_details or single segment)
  const d = segments?.[0] || detail
  return (
    <div className="flex items-start gap-3 text-sm">
      <Plane className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="space-y-0.5">
        <div className="font-medium">
          {d.departureAirportCode || '???'} &rarr; {d.arrivalAirportCode || '???'}
        </div>
        <div className="text-muted-foreground">
          {[d.airline, d.flightNumber].filter(Boolean).join(' ') || 'Flight details pending'}
        </div>
        <div className="text-muted-foreground">
          {d.departureDate && <span>{d.departureDate}</span>}
          {formatTime(d.departureTime) && <span> at {formatTime(d.departureTime)}</span>}
          {formatTime(d.arrivalTime) && <span> &mdash; arr. {formatTime(d.arrivalTime)}</span>}
        </div>
        {(d.departureTerminal || d.arrivalTerminal) && (
          <div className="text-muted-foreground text-xs">
            {d.departureTerminal && <span>Terminal {d.departureTerminal}</span>}
            {d.departureTerminal && d.arrivalTerminal && <span> &rarr; </span>}
            {d.arrivalTerminal && <span>Terminal {d.arrivalTerminal}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

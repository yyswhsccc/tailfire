"use client"

import { ItineraryDayCard } from "./ItineraryDayCard"
import type { ItineraryDay } from "@/hooks/use-client-itinerary"

export function ItineraryTimeline({ days }: { days: ItineraryDay[] }) {
  if (days.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-phoenix-text-muted">No days have been added to this itinerary yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {days.map((day) => (
        <ItineraryDayCard key={day.id} day={day} />
      ))}
    </div>
  )
}

"use client"

import { MapPin, Calendar } from "lucide-react"
import { ActivityCard } from "./ActivityCard"
import type { ItineraryDay } from "@/hooks/use-client-itinerary"

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export function ItineraryDayCard({ day }: { day: ItineraryDay }) {
  return (
    <div className="relative">
      {/* Day header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-phoenix-gold/20 border border-phoenix-gold/40 flex items-center justify-center">
          <span className="text-phoenix-gold font-bold">{day.dayNumber}</span>
        </div>
        <div>
          <h3 className="font-semibold text-white text-lg">
            {day.title || `Day ${day.dayNumber}`}
          </h3>
          <div className="flex items-center gap-3 text-sm text-phoenix-text-muted mt-0.5">
            {day.date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(day.date)}
              </span>
            )}
            {day.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {day.location}
              </span>
            )}
          </div>
          {day.description && (
            <p className="text-phoenix-text-muted text-sm mt-2">{day.description}</p>
          )}
        </div>
      </div>

      {/* Activities */}
      <div className="ml-6 pl-10 border-l-2 border-phoenix-gold/20 space-y-3 pb-8">
        {day.activities.length > 0 ? (
          day.activities.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))
        ) : (
          <p className="text-phoenix-text-muted text-sm italic py-2">
            No activities planned for this day yet.
          </p>
        )}
      </div>
    </div>
  )
}

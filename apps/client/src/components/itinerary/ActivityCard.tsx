"use client"

import {
  Plane,
  Hotel,
  Bus,
  UtensilsCrossed,
  Ship,
  MapPin,
  Camera,
  Package,
  Clock,
  CheckCircle2,
} from "lucide-react"
import { Badge, Card, CardContent } from "@tailfire/ui-public"
import type { ItineraryActivity } from "@/hooks/use-client-itinerary"

const activityIcons: Record<string, any> = {
  flight: Plane,
  lodging: Hotel,
  transportation: Bus,
  dining: UtensilsCrossed,
  cruise: Ship,
  custom_cruise: Ship,
  tour: Camera,
  custom_tour: Camera,
  tour_day: Camera,
  options: MapPin,
  package: Package,
  port_info: Ship,
}

const formatTime = (datetime: string | null) => {
  if (!datetime) return null
  return new Date(datetime).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
}

export function ActivityCard({ activity }: { activity: ItineraryActivity }) {
  const Icon = activityIcons[activity.activityType] || MapPin

  return (
    <Card className="bg-phoenix-charcoal/30 border-phoenix-gold/20 hover:border-phoenix-gold/30 transition-all">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1 p-2 rounded-lg bg-phoenix-gold/10">
            <Icon className="h-4 w-4 text-phoenix-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-white">{activity.name}</h4>
              {activity.bookingStatus === 'booked' && (
                <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Booked
                </Badge>
              )}
              {activity.proposalStatus === "cancelled" && (
                <Badge variant="outline" className="text-xs border-red-500/30 text-red-400">
                  Cancelled
                </Badge>
              )}
            </div>

            {(activity.startDatetime || activity.location) && (
              <div className="flex items-center gap-3 mt-1 text-sm text-phoenix-text-muted">
                {activity.startDatetime && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(activity.startDatetime)}
                    {activity.endDatetime && ` - ${formatTime(activity.endDatetime)}`}
                  </span>
                )}
                {activity.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {activity.location}
                  </span>
                )}
              </div>
            )}

            {activity.description && (
              <p className="text-phoenix-text-muted text-sm mt-2 line-clamp-3">
                {activity.description}
              </p>
            )}

            {activity.confirmationNumber && (
              <p className="text-xs text-phoenix-text-muted mt-2">
                Confirmation: <span className="text-phoenix-gold font-mono">{activity.confirmationNumber}</span>
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

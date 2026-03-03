'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Calendar } from 'lucide-react'
import type { TripSummary } from '@/hooks/use-dashboard'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-50 text-gray-700',
  quoted: 'bg-yellow-50 text-yellow-700',
  booked: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-cyan-50 text-cyan-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-700',
  inbound: 'bg-purple-50 text-purple-700',
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

interface TripCardProps {
  trip: TripSummary
}

export function TripCard({ trip }: TripCardProps) {
  const dateRange = trip.startDate && trip.endDate
    ? `${format(new Date(trip.startDate), 'MMM d')} - ${format(new Date(trip.endDate), 'MMM d, yyyy')}`
    : trip.startDate
      ? format(new Date(trip.startDate), 'MMM d, yyyy')
      : 'No dates'

  return (
    <Link href={`/trips/${trip.id}`} className="block min-w-[220px] snap-start">
      <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="pt-4 pb-4">
          <h4 className="font-medium text-sm truncate">{trip.name}</h4>
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{dateRange}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{trip.travelerCount} traveler{trip.travelerCount !== 1 ? 's' : ''}</span>
            </div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[trip.status] || statusColors.draft}`}>
              {formatStatus(trip.status)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

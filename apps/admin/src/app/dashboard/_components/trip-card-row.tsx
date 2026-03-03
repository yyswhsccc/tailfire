'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { TripCard } from './trip-card'
import type { TripSummary } from '@/hooks/use-dashboard'

interface TripCardRowProps {
  title: string
  trips: TripSummary[]
  viewAllHref: string
  showCreateCard?: boolean
}

export function TripCardRow({ title, trips, viewAllHref, showCreateCard }: TripCardRowProps) {
  if (trips.length === 0 && !showCreateCard) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Link href={viewAllHref} className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">No trips</p>
          <Link
            href="/trips/new"
            className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Create trip
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link href={viewAllHref} className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory">
        {trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} />
        ))}
        {showCreateCard && (
          <Link href="/trips/new" className="block min-w-[220px] snap-start">
            <Card className="h-full hover:shadow-md transition-shadow cursor-pointer border-dashed">
              <CardContent className="pt-4 pb-4 flex flex-col items-center justify-center h-full min-h-[100px]">
                <Plus className="h-6 w-6 text-muted-foreground" />
                <span className="mt-1 text-sm text-muted-foreground">Create Trip</span>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  )
}

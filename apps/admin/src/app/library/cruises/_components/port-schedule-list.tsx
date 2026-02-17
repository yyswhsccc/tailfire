'use client'

import { format, parseISO, addDays } from 'date-fns'
import { MapPin, Ship, Clock, Anchor } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SailingDetailResponse } from '@/hooks/use-cruise-library'

interface PortScheduleListProps {
  sailing: SailingDetailResponse
}

export function PortScheduleList({ sailing }: PortScheduleListProps) {
  const sailDate = parseISO(sailing.sailDate)

  return (
    <div>
      <h3 className="font-semibold text-sm text-ash-900 mb-3 flex items-center gap-2">
        <MapPin className="h-4 w-4" />
        Port Schedule
      </h3>

      <div className="relative">
        {/* Vertical line connecting stops */}
        <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-ash-200" />

        <div className="space-y-0">
          {sailing.itinerary.map((stop, index) => {
            const isFirst = index === 0
            const isLast = index === sailing.itinerary.length - 1
            const stopDate = addDays(sailDate, stop.dayNumber - 1)

            return (
              <div
                key={`${stop.dayNumber}-${stop.portName}`}
                className={cn(
                  'relative flex items-start gap-4 py-3',
                  !isLast && 'border-b border-ash-100'
                )}
              >
                {/* Timeline Node */}
                <div
                  className={cn(
                    'relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
                    stop.isSeaDay
                      ? 'bg-blue-100 text-blue-600'
                      : isFirst || isLast
                        ? 'bg-phoenix-gold-600 text-white'
                        : 'bg-ash-100 text-ash-600'
                  )}
                >
                  {stop.isSeaDay ? (
                    <Ship className="h-4 w-4" />
                  ) : isFirst || isLast ? (
                    <Anchor className="h-4 w-4" />
                  ) : (
                    <MapPin className="h-4 w-4" />
                  )}
                </div>

                {/* Stop Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-ash-900">
                        {stop.isSeaDay ? 'At Sea' : stop.portName}
                      </p>
                      <p className="text-xs text-ash-500">
                        Day {stop.dayNumber} - {format(stopDate, 'EEE, MMM d')}
                      </p>
                    </div>

                    {/* Times */}
                    {!stop.isSeaDay && (stop.arrivalTime || stop.departureTime) && (
                      <div className="flex items-center gap-3 text-xs text-ash-500">
                        {stop.arrivalTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Arrive: {stop.arrivalTime}
                          </span>
                        )}
                        {stop.departureTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Depart: {stop.departureTime}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Port Type Label */}
                  {isFirst && (
                    <span className="inline-block mt-1 text-[10px] font-medium text-phoenix-gold-600 bg-phoenix-gold-50 px-1.5 py-0.5 rounded">
                      Embarkation
                    </span>
                  )}
                  {isLast && !isFirst && (
                    <span className="inline-block mt-1 text-[10px] font-medium text-phoenix-gold-600 bg-phoenix-gold-50 px-1.5 py-0.5 rounded">
                      Disembarkation
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

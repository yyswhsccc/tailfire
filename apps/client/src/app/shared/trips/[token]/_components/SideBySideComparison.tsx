'use client'

import type { SharedItineraryDto } from '@tailfire/shared-types'
import { Card, CardContent, Badge, Button } from '@tailfire/ui-public'
import { Check, MapPin, Clock } from 'lucide-react'

interface SideBySideComparisonProps {
  itineraries: SharedItineraryDto[]
  currency: string
  pricingVisible: boolean
  clientSelectedId: string | null
  onSelect: (itineraryId: string) => void
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

export function SideBySideComparison({
  itineraries,
  currency,
  pricingVisible,
  clientSelectedId,
  onSelect,
}: SideBySideComparisonProps) {
  const maxDays = Math.max(...itineraries.map((it) => it.days.length))

  return (
    <div className="max-w-6xl mx-auto px-4 mt-8">
      <div className="flex gap-4 overflow-x-auto pb-4">
        {itineraries.map((itinerary) => {
          const isSelected = clientSelectedId === itinerary.id
          return (
            <div
              key={itinerary.id}
              className={[
                'flex-1 min-w-[350px] space-y-4',
                isSelected ? 'ring-2 ring-green-500/30 rounded-lg p-2' : '',
              ].join(' ')}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold">{itinerary.name}</h3>
                {isSelected && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    <Check className="h-3 w-3 mr-1" /> Selected
                  </Badge>
                )}
              </div>

              {itinerary.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {itinerary.description}
                </p>
              )}

              {/* Day cards */}
              <div className="space-y-3">
                {itinerary.days.map((day) => (
                  <Card key={day.id} className="bg-card border-border">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-primary">
                          Day {day.dayNumber}
                        </span>
                        {day.title && (
                          <span className="text-xs text-muted-foreground truncate">
                            {day.title}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {(day.activities || []).map((activity) => (
                          <div
                            key={activity.id}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="text-muted-foreground capitalize">
                              {activity.activityType?.replace('_', ' ')}
                            </span>
                            <span className="truncate flex-1">{activity.name}</span>
                            {pricingVisible && activity.pricing?.totalPriceCents ? (
                              <span className="text-muted-foreground shrink-0">
                                {formatCurrency(activity.pricing.totalPriceCents, currency)}
                              </span>
                            ) : null}
                          </div>
                        ))}
                        {(!day.activities || day.activities.length === 0) && (
                          <p className="text-xs text-muted-foreground italic">
                            No activities planned
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Select button */}
              <div className="pt-2">
                {isSelected ? (
                  <Button size="sm" disabled className="w-full bg-green-600 text-white">
                    <Check className="h-3 w-3 mr-1" /> Selected
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => onSelect(itinerary.id)}
                  >
                    Select This Option
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

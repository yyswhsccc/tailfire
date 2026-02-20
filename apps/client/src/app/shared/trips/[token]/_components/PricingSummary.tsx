'use client'

import { Card, CardContent, Separator } from '@tailfire/ui-public'
import type { SharedItineraryDto } from '@tailfire/shared-types'

const typeLabels: Record<string, string> = {
  flight: 'Flights',
  lodging: 'Accommodations',
  transportation: 'Transportation',
  dining: 'Dining',
  custom_cruise: 'Cruises',
  cruise: 'Cruises',
  custom_tour: 'Tours',
  tour: 'Tours',
  package: 'Packages',
  port_info: 'Port Information',
  options: 'Options',
  tour_day: 'Tour Days',
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function PricingSummary({
  itinerary,
  currency,
}: {
  itinerary: SharedItineraryDto
  currency: string
}) {
  // Aggregate totals by activity type
  const totals = new Map<string, number>()
  let grandTotal = 0

  for (const day of itinerary.days) {
    for (const activity of day.activities) {
      if (activity.pricing) {
        const type = activity.activityType
        const current = totals.get(type) || 0
        totals.set(type, current + activity.pricing.totalPriceCents)
        grandTotal += activity.pricing.totalPriceCents
      }
    }
  }

  if (grandTotal === 0) return null

  // Sort by amount descending
  const sorted = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <h3 className="font-display text-lg font-bold text-foreground mb-4">Trip Summary</h3>
        <div className="space-y-2">
          {sorted.map(([type, amount]) => (
            <div key={type} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{typeLabels[type] || type}</span>
              <span className="text-foreground">{formatCurrency(amount, currency)}</span>
            </div>
          ))}
        </div>
        <Separator className="my-4" />
        <div className="flex justify-between">
          <span className="font-display font-bold text-foreground">Total</span>
          <span className="font-display font-bold text-primary text-lg">
            {formatCurrency(grandTotal, currency)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

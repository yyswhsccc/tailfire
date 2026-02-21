'use client'

import type { SharedItineraryDto } from '@tailfire/shared-types'
import { Card, CardContent, Button } from '@tailfire/ui-public'
import { Check } from 'lucide-react'

interface SummaryComparisonProps {
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

function computeSummary(itinerary: SharedItineraryDto) {
  const activities = itinerary.days.flatMap((d) => d.activities || [])
  const totalCents = activities.reduce(
    (sum, a) => sum + (a.pricing?.totalPriceCents || 0),
    0,
  )
  const byType: Record<string, number> = {}
  for (const a of activities) {
    const t = a.activityType || 'other'
    byType[t] = (byType[t] || 0) + 1
  }
  return {
    dayCount: itinerary.days.length,
    totalCents,
    activityCount: activities.length,
    byType,
    description: itinerary.description,
  }
}

const TYPE_LABELS: Record<string, string> = {
  flight: 'Flights',
  lodging: 'Hotels',
  transportation: 'Transport',
  dining: 'Dining',
  options: 'Activities',
  custom_cruise: 'Cruises',
  custom_tour: 'Tours',
  port_info: 'Ports',
  other: 'Other',
}

export function SummaryComparison({
  itineraries,
  currency,
  pricingVisible,
  clientSelectedId,
  onSelect,
}: SummaryComparisonProps) {
  const summaries = itineraries.map((it) => ({
    id: it.id,
    name: it.name,
    ...computeSummary(it),
  }))

  // Collect all activity types across all itineraries
  const allTypes = new Set<string>()
  for (const s of summaries) {
    for (const t of Object.keys(s.byType)) allTypes.add(t)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 mt-8">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">Metric</th>
              {summaries.map((s) => (
                <th key={s.id} className="text-center py-3 px-4 font-medium">
                  <div className="flex flex-col items-center gap-1">
                    <span>{s.name}</span>
                    {clientSelectedId === s.id && (
                      <span className="text-xs text-green-500 flex items-center gap-1">
                        <Check className="h-3 w-3" /> Selected
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="py-2.5 px-4 text-muted-foreground">Duration</td>
              {summaries.map((s) => (
                <td key={s.id} className="py-2.5 px-4 text-center">
                  {s.dayCount} day{s.dayCount !== 1 ? 's' : ''}
                </td>
              ))}
            </tr>
            {pricingVisible && (
              <tr className="border-b border-border/50">
                <td className="py-2.5 px-4 text-muted-foreground">Total Price</td>
                {summaries.map((s) => (
                  <td key={s.id} className="py-2.5 px-4 text-center font-medium">
                    {s.totalCents > 0 ? formatCurrency(s.totalCents, currency) : '--'}
                  </td>
                ))}
              </tr>
            )}
            <tr className="border-b border-border/50">
              <td className="py-2.5 px-4 text-muted-foreground">Total Activities</td>
              {summaries.map((s) => (
                <td key={s.id} className="py-2.5 px-4 text-center">{s.activityCount}</td>
              ))}
            </tr>
            {[...allTypes].sort().map((type) => (
              <tr key={type} className="border-b border-border/50">
                <td className="py-2.5 px-4 text-muted-foreground">
                  {TYPE_LABELS[type] || type}
                </td>
                {summaries.map((s) => (
                  <td key={s.id} className="py-2.5 px-4 text-center">
                    {s.byType[type] || 0}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="py-2.5 px-4 text-muted-foreground">Description</td>
              {summaries.map((s) => (
                <td key={s.id} className="py-2.5 px-4 text-center text-xs text-muted-foreground max-w-[200px]">
                  {s.description || '--'}
                </td>
              ))}
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="py-4 px-4" />
              {summaries.map((s) => (
                <td key={s.id} className="py-4 px-4 text-center">
                  {clientSelectedId === s.id ? (
                    <Button size="sm" disabled className="bg-green-600 text-white">
                      <Check className="h-3 w-3 mr-1" /> Selected
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSelect(s.id)}
                    >
                      Select This Option
                    </Button>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

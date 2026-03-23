'use client'

import type { SummaryItem } from '@tailfire/shared-types/api'

/** Format a summary value based on its format hint */
function formatSummaryValue(value: string, format?: SummaryItem['format']): string {
  const num = Number(value)

  switch (format) {
    case 'currency': {
      if (isNaN(num)) return value
      return new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'CAD',
      }).format(num / 100)
    }
    case 'number': {
      if (isNaN(num)) return value
      return new Intl.NumberFormat('en-CA').format(num)
    }
    case 'percent': {
      if (isNaN(num)) return value
      return `${num.toFixed(1)}%`
    }
    default:
      return value
  }
}

interface ReportSummaryCardsProps {
  items: SummaryItem[]
}

export function ReportSummaryCards({ items }: ReportSummaryCardsProps) {
  if (items.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border bg-card px-4 py-3 shadow-sm"
        >
          <p className="text-xs font-medium text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1 text-xl font-semibold font-mono tabular-nums tracking-tight">
            {formatSummaryValue(item.value, item.format)}
          </p>
        </div>
      ))}
    </div>
  )
}

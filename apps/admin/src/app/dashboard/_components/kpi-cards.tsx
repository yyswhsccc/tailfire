'use client'

import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { KpiMetrics } from '@/hooks/use-dashboard'

interface KpiCardsProps {
  metrics: KpiMetrics
  periodLabel: string
  variant?: 'personal' | 'agency'
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatDollars(dollars: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(dollars)
}

function TrendBadge({ trend }: { trend: number | null }) {
  if (trend === null) return null

  const isPositive = trend >= 0
  const Icon = isPositive ? TrendingUp : TrendingDown
  const colorClass = isPositive ? 'text-green-600' : 'text-red-600'

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${colorClass}`}>
      <Icon className="h-3 w-3" />
      {isPositive ? '+' : ''}{trend.toFixed(1)}%
    </span>
  )
}

export function KpiCards({ metrics, periodLabel, variant = 'personal' }: KpiCardsProps) {
  const isAgency = variant === 'agency'

  const cards = [
    {
      label: 'Bookings',
      value: String(metrics.bookings),
      trend: metrics.bookingsTrend,
    },
    {
      label: 'Sales Volume',
      value: formatCurrency(metrics.salesVolumeCents),
      trend: metrics.salesTrend,
    },
    {
      label: 'Commission Received',
      value: formatDollars(metrics.commissionReceivedDollars),
      trend: metrics.commissionTrend,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className={isAgency ? 'bg-blue-50/50 border-blue-100' : ''}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {card.label}
                {isAgency && <span className="ml-1 text-xs text-blue-600">(Agency)</span>}
              </p>
              <TrendBadge trend={card.trend} />
            </div>
            <p className="mt-1 text-2xl font-bold">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{periodLabel}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

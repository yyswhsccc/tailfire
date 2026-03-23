'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown, DollarSign, Plane, HeartPulse } from 'lucide-react'
import type { KpiMetrics, SalesKpiMetrics, InsuranceKpiMetrics } from '@/hooks/use-dashboard'

interface KpiCardsProps {
  metrics: KpiMetrics
  periodLabel: string
  variant?: 'personal' | 'agency'
}

interface SalesKpiCardsProps {
  salesKpi: SalesKpiMetrics
  insuranceKpi: InsuranceKpiMetrics
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

function formatPercent(rate: number): string {
  return `${rate.toFixed(1)}%`
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

export function SalesKpiCards({ salesKpi, insuranceKpi, periodLabel, variant = 'personal' }: SalesKpiCardsProps) {
  const isAgency = variant === 'agency'

  const cards = [
    {
      label: 'Booked Sales',
      value: formatCurrency(salesKpi.bookedSalesCents),
      trend: salesKpi.bookedSalesTrend,
      icon: DollarSign,
      href: '/reporting/booked-sales',
    },
    {
      label: 'Departed Sales',
      value: formatCurrency(salesKpi.departedSalesCents),
      trend: salesKpi.departedSalesTrend,
      icon: Plane,
      href: '/reporting/departed-sales',
    },
    {
      label: 'Insurance Attach Rate',
      value: formatPercent(insuranceKpi.attachRate),
      trend: insuranceKpi.attachRateTrend,
      icon: HeartPulse,
      href: '/reporting/insurance-penetration',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => (
        <Link key={card.label} href={card.href}>
          <Card className={`transition-colors hover:border-primary/40 ${isAgency ? 'bg-blue-50/50 border-blue-100' : ''}`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <card.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">
                    {card.label}
                    {isAgency && <span className="ml-1 text-xs text-blue-600">(Agency)</span>}
                  </p>
                </div>
                <TrendBadge trend={card.trend} />
              </div>
              <p className="mt-1 text-2xl font-bold">{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{periodLabel}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}

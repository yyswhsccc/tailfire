'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import type { MonthlySalesData, ProjectionData } from '@/hooks/use-dashboard'

function formatCurrencyShort(cents: number): string {
  const dollars = cents / 100
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`
  return `$${dollars.toFixed(0)}`
}

function formatCurrencyFull(cents: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

interface SalesChartProps {
  data: MonthlySalesData[]
  projection: ProjectionData
  year: number
  onYearChange: (year: number) => void
  includeYoy: boolean
  onYoyToggle: () => void
  showProjection: boolean
  onProjectionToggle: () => void
}

export function SalesChart({
  data,
  projection,
  year,
  onYearChange,
  includeYoy,
  onYoyToggle,
  showProjection,
  onProjectionToggle,
}: SalesChartProps) {
  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()

  const chartData = data.map((d) => {
    const isCurrentMonth = d.month === currentMonth && year === currentYear
    return {
      ...d,
      actual: d.amountCents,
      projected: isCurrentMonth && showProjection
        ? Math.max(0, projection.salesProjectedCents - d.amountCents)
        : 0,
      previousYear: includeYoy ? (d.previousYearCents ?? 0) : 0,
    }
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold">Sales</CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="text-xs border rounded px-2 py-1"
            >
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <Button
              variant={includeYoy ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={onYoyToggle}
            >
              YoY
            </Button>
            <Button
              variant={showProjection ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={onProjectionToggle}
            >
              Proj
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={formatCurrencyShort} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatCurrencyFull(value),
                name === 'actual' ? `${year}` : name === 'projected' ? 'Projected' : `${year - 1}`,
              ]}
              labelFormatter={(label) => `${label} ${year}`}
            />
            {includeYoy && (
              <Bar dataKey="previousYear" fill="#d1d5db" opacity={0.5} radius={[2, 2, 0, 0]} />
            )}
            <Bar dataKey="actual" stackId="current" fill="#2563eb" radius={[2, 2, 0, 0]} />
            {showProjection && (
              <Bar dataKey="projected" stackId="current" fill="#93c5fd" radius={[2, 2, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.projected > 0 ? '#93c5fd' : 'transparent'}
                    strokeDasharray={entry.projected > 0 ? '4 2' : '0'}
                    stroke={entry.projected > 0 ? '#2563eb' : 'transparent'}
                  />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

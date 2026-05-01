'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import type { MonthlyCommissionData, ProjectionData } from '@/hooks/use-dashboard'

function formatDollarShort(dollars: number): string {
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`
  return `$${dollars.toFixed(0)}`
}

function formatDollarFull(dollars: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
  }).format(dollars)
}

interface CommissionChartProps {
  data: MonthlyCommissionData[]
  projection: ProjectionData
  year: number
  onYearChange: (year: number) => void
  includeYoy: boolean
  onYoyToggle: () => void
  showProjection: boolean
  onProjectionToggle: () => void
}

export function CommissionChart({
  data,
  projection,
  year,
  onYearChange,
  includeYoy,
  onYoyToggle,
  showProjection,
  onProjectionToggle,
}: CommissionChartProps) {
  const et = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
    return { month: Number(parts.find(p => p.type === 'month')!.value), year: Number(parts.find(p => p.type === 'year')!.value) }
  }, [])
  const currentMonth = et.month
  const currentYear = et.year

  const chartData = data.map((d) => {
    const isCurrentMonth = d.month === currentMonth && year === currentYear
    return {
      ...d,
      actual: d.amountDollars,
      projected: isCurrentMonth && showProjection
        ? Math.max(0, projection.commissionProjectedDollars - d.amountDollars)
        : 0,
      previousYear: includeYoy ? (d.previousYearDollars ?? 0) : 0,
    }
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold">Commission</CardTitle>
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
            <YAxis tickFormatter={formatDollarShort} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatDollarFull(value),
                name === 'actual' ? `${year}` : name === 'projected' ? 'Projected' : `${year - 1}`,
              ]}
              labelFormatter={(label) => `${label} ${year}`}
            />
            {includeYoy && (
              <Bar dataKey="previousYear" fill="#d1d5db" opacity={0.5} radius={[2, 2, 0, 0]} />
            )}
            <Bar dataKey="actual" stackId="current" fill="#16a34a" radius={[2, 2, 0, 0]} />
            {showProjection && (
              <Bar dataKey="projected" stackId="current" fill="#86efac" radius={[2, 2, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.projected > 0 ? '#86efac' : 'transparent'}
                    strokeDasharray={entry.projected > 0 ? '4 2' : '0'}
                    stroke={entry.projected > 0 ? '#16a34a' : 'transparent'}
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

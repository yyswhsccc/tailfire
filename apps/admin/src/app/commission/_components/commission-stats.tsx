'use client'

import { DollarSign, TrendingUp, Clock, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface CommissionStatsProps {
  isAdmin: boolean
  due: { totalDueCents: number; bookingCount: number }[] | undefined
  summary: { commissionReceivedMtdCents: number; commissionReceivedYtdCents: number; salesMtdCents: number } | undefined
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
}

export function CommissionStats({ isAdmin, due, summary }: CommissionStatsProps) {
  const totalPayable = due?.reduce((sum, d) => sum + d.totalDueCents, 0) ?? 0
  const totalBookings = due?.reduce((sum, d) => sum + d.bookingCount, 0) ?? 0

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {isAdmin ? 'Total Payable' : 'Payable Now'}
          </CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalPayable)}</div>
          <p className="text-xs text-muted-foreground">{totalBookings} bookings</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Received MTD</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(summary?.commissionReceivedMtdCents ?? 0)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Received YTD</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(summary?.commissionReceivedYtdCents ?? 0)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Sales MTD</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(summary?.salesMtdCents ?? 0)}</div>
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useState, useCallback, useEffect } from 'react'
import { DashboardLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PanelRight, AlertCircle, RefreshCw, Loader2 } from 'lucide-react'
import { useUser } from '@/hooks/use-user'
import { useMyProfile } from '@/hooks/use-user-profile'
import { useDashboardOverview } from '@/hooks/use-dashboard'
import { KpiCards, SalesKpiCards } from './_components/kpi-cards'
import { TripCardRow } from './_components/trip-card-row'
import { TasksDueWidget } from './_components/tasks-due-widget'
import { PaymentsDueWidget } from './_components/payments-due-widget'
import { SalesChart } from './_components/sales-chart'
import { CommissionChart } from './_components/commission-chart'
import { DashboardSidebar } from './_components/dashboard-sidebar'

const SIDEBAR_KEY = 'dashboard-sidebar-open'

function useSidebarState() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY)
    if (stored !== null) {
      setIsOpen(stored === 'true')
    }
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, String(next))
      return next
    })
  }, [])

  return { isOpen, toggle }
}

export default function DashboardPage() {
  const { isAdmin } = useUser()
  const { data: profile } = useMyProfile()
  const firstName = profile?.firstName || 'there'

  // Dashboard controls
  const [period, setPeriod] = useState<'mtd' | 'ytd' | 'lifetime'>('mtd')
  const [chartYear, setChartYear] = useState(new Date().getFullYear())
  const [includeYoy, setIncludeYoy] = useState(false)
  const [showProjection, setShowProjection] = useState(false)
  const sidebar = useSidebarState()

  const { data, isPending, isFetching, isError, refetch } = useDashboardOverview({
    period,
    chartYear,
    includeYoy,
  })

  const periodLabel = period === 'mtd' ? 'Month to Date' : period === 'ytd' ? 'Year to Date' : 'Lifetime'

  // Initial loading state (no data yet)
  if (isPending) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // Error state
  if (isError || !data) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold">Unable to load dashboard</h3>
          <p className="text-sm text-muted-foreground mb-4">Something went wrong fetching your data.</p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Welcome back, {firstName}</h2>
              <p className="text-sm text-muted-foreground">
                Here&apos;s how your business is doing
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Fetching indicator */}
              {isFetching && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              {/* Period Toggle */}
              <div className="flex rounded-md border">
                <button
                  className={`px-3 py-1.5 text-xs font-medium rounded-l-md transition-colors ${
                    period === 'mtd' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                  onClick={() => setPeriod('mtd')}
                >
                  MTD
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    period === 'ytd' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                  onClick={() => setPeriod('ytd')}
                >
                  YTD
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-medium rounded-r-md transition-colors ${
                    period === 'lifetime' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                  onClick={() => setPeriod('lifetime')}
                >
                  All
                </button>
              </div>
              {/* Sidebar Toggle */}
              <Button variant="ghost" size="sm" onClick={sidebar.toggle}>
                <PanelRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Personal KPI Cards */}
          <KpiCards metrics={data.personal} periodLabel={periodLabel} />

          {/* Agency KPI Row (admin only) */}
          {isAdmin && data.agency && (
            <KpiCards metrics={data.agency} periodLabel={periodLabel} variant="agency" />
          )}

          {/* Booked Sales, Departed Sales, Insurance Attach Rate */}
          <SalesKpiCards
            salesKpi={data.personalSalesKpi}
            insuranceKpi={data.personalInsuranceKpi}
            periodLabel={periodLabel}
          />

          {/* Agency Sales KPIs (admin only) */}
          {isAdmin && data.agencySalesKpi && data.agencyInsuranceKpi && (
            <SalesKpiCards
              salesKpi={data.agencySalesKpi}
              insuranceKpi={data.agencyInsuranceKpi}
              periodLabel={periodLabel}
              variant="agency"
            />
          )}

          {/* Jump Back In */}
          <TripCardRow title="Jump Back In" trips={data.recentTrips} viewAllHref="/trips" />

          {/* Leaving Soon */}
          <TripCardRow
            title="Leaving Soon"
            trips={data.leavingSoon}
            viewAllHref="/trips"
            showCreateCard
          />

          {/* Tasks + Payments (two-column grid) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TasksDueWidget tasks={data.tasksDue} />
            <PaymentsDueWidget payments={data.paymentsDue} />
          </div>

          {/* Charts (two-column grid) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SalesChart
              data={data.monthlySales}
              projection={data.currentMonthProjection}
              year={chartYear}
              onYearChange={setChartYear}
              includeYoy={includeYoy}
              onYoyToggle={() => setIncludeYoy((v) => !v)}
              showProjection={showProjection}
              onProjectionToggle={() => setShowProjection((v) => !v)}
            />
            <CommissionChart
              data={data.monthlyCommission}
              projection={data.currentMonthProjection}
              year={chartYear}
              onYearChange={setChartYear}
              includeYoy={includeYoy}
              onYoyToggle={() => setIncludeYoy((v) => !v)}
              showProjection={showProjection}
              onProjectionToggle={() => setShowProjection((v) => !v)}
            />
          </div>
        </div>

        {/* Sidebar */}
        <DashboardSidebar
          isOpen={sidebar.isOpen}
          onToggle={sidebar.toggle}
          isAdmin={isAdmin}
          tasks={data.tasksDue}
          leaderboard={data.agentLeaderboard}
        />
      </div>
    </DashboardLayout>
  )
}

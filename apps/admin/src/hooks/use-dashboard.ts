/**
 * Dashboard Hook
 *
 * Fetches dashboard overview data with period/chart controls.
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api } from '@/lib/api'

// -- Types (mirror backend response) --

export interface KpiMetrics {
  bookings: number
  salesVolumeCents: number
  commissionReceivedDollars: number
  bookingsTrend: number | null
  salesTrend: number | null
  commissionTrend: number | null
}

export interface SalesKpiMetrics {
  bookedSalesCents: number
  departedSalesCents: number
  bookedSalesTrend: number | null
  departedSalesTrend: number | null
}

export interface InsuranceKpiMetrics {
  totalTravelers: number
  coveredTravelers: number
  attachRate: number
  attachRateTrend: number | null
}

export interface TripSummary {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  status: string
  travelerCount: number
  updatedAt: string
}

export interface TaskDueSummary {
  id: string
  title: string
  dueDate: string | null
  priority: string
  isOverdue: boolean
  daysOverdue: number
  linkedTripName: string | null
  linkedContactName: string | null
}

export interface PaymentDueSummary {
  id: string
  tripId: string
  tripName: string
  description: string
  expectedAmountCents: number
  paidAmountCents: number
  dueDate: string
  isOverdue: boolean
}

export interface MonthlySalesData {
  month: number
  label: string
  amountCents: number
  previousYearCents: number | null
}

export interface MonthlyCommissionData {
  month: number
  label: string
  amountDollars: number
  previousYearDollars: number | null
}

export interface ProjectionData {
  salesActualCents: number
  salesProjectedCents: number
  commissionActualDollars: number
  commissionProjectedDollars: number
  daysElapsed: number
  totalDaysInMonth: number
}

export interface AgentLeaderboardEntry {
  userId: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  salesVolumeCents: number
  bookings: number
}

export interface DashboardOverview {
  personal: KpiMetrics
  agency: KpiMetrics | null
  personalSalesKpi: SalesKpiMetrics
  agencySalesKpi: SalesKpiMetrics | null
  personalInsuranceKpi: InsuranceKpiMetrics
  agencyInsuranceKpi: InsuranceKpiMetrics | null
  recentTrips: TripSummary[]
  leavingSoon: TripSummary[]
  tasksDue: TaskDueSummary[]
  paymentsDue: PaymentDueSummary[]
  monthlySales: MonthlySalesData[]
  monthlyCommission: MonthlyCommissionData[]
  currentMonthProjection: ProjectionData
  agentLeaderboard: AgentLeaderboardEntry[] | null
}

// -- Query Keys --

export type DashboardView = 'personal' | 'agency' | 'all'

export const dashboardKeys = {
  all: ['dashboard'] as const,
  overview: (period: string, chartYear: number, includeYoy: boolean, view: DashboardView) =>
    [...dashboardKeys.all, 'overview', { period, chartYear, includeYoy, view }] as const,
}

// -- Hook --

interface UseDashboardOverviewOptions {
  period?: 'mtd' | 'last_month' | 'ytd' | 'lifetime'
  chartYear?: number
  includeYoy?: boolean
  view?: DashboardView
}

export function useDashboardOverview(options: UseDashboardOverviewOptions = {}) {
  const {
    period = 'mtd',
    chartYear = new Date().getFullYear(),
    includeYoy = false,
    view = 'all',
  } = options

  return useQuery({
    queryKey: dashboardKeys.overview(period, chartYear, includeYoy, view),
    queryFn: () => {
      const params = new URLSearchParams({
        period,
        chartYear: String(chartYear),
        includeYoy: String(includeYoy),
        view,
      })
      return api.get<DashboardOverview>(`/dashboard/overview?${params}`)
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

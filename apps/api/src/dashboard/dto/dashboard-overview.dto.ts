/**
 * Dashboard Overview DTO
 *
 * Query parameters and response types for GET /dashboard/overview
 */

import { IsEnum, IsOptional, IsInt, IsBoolean, Min, Max } from 'class-validator'
import { Transform, Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class DashboardOverviewQueryDto {
  @ApiPropertyOptional({ enum: ['mtd', 'ytd', 'lifetime'], default: 'mtd' })
  @IsOptional()
  @IsEnum(['mtd', 'ytd', 'lifetime'])
  period?: 'mtd' | 'ytd' | 'lifetime' = 'mtd'

  @ApiPropertyOptional({ default: new Date().getFullYear() })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  chartYear?: number = new Date().getFullYear()

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeYoy?: boolean = false
}

// -- Response Types --

export interface KpiMetrics {
  bookings: number
  salesVolumeCents: number
  commissionReceivedDollars: number
  bookingsTrend: number | null
  salesTrend: number | null
  commissionTrend: number | null
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
  recentTrips: TripSummary[]
  leavingSoon: TripSummary[]
  tasksDue: TaskDueSummary[]
  paymentsDue: PaymentDueSummary[]
  monthlySales: MonthlySalesData[]
  monthlyCommission: MonthlyCommissionData[]
  currentMonthProjection: ProjectionData
  agentLeaderboard: AgentLeaderboardEntry[] | null
}

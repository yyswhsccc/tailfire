'use client'

/**
 * Financial Summary Card Component
 *
 * Displays a comprehensive financial overview of a trip including:
 * - Grand totals
 * - Per-traveller breakdown
 * - Payment status
 * - Trip-Order PDF generation (via snapshot flow)
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  DollarSign,
  Users,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'
import { useTripFinancialSummary } from '@/hooks/use-financial-summary'
import { TripOrderGeneratorButton } from '@/components/trips/trip-order-generator'
import type { TravellerFinancialBreakdownDto, TripFinancialSummaryResponseDto } from '@tailfire/shared-types/api'

// Format cents to display currency
function formatCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

interface FinancialSummaryCardProps {
  tripId: string
  agencyId?: string
  summaryData?: TripFinancialSummaryResponseDto
}

export function FinancialSummaryCard({ tripId, agencyId, summaryData }: FinancialSummaryCardProps) {
  // Only fetch if summaryData not provided - conditional hook usage
  const { data: fetchedSummary, isLoading, error } = useTripFinancialSummary(tripId, {
    enabled: !summaryData,
  })
  const summary = summaryData || fetchedSummary

  // Only show loading if fetching and no summaryData provided
  if (isLoading && !summaryData) {
    return <FinancialSummaryCardSkeleton />
  }

  // Only show error if no summaryData provided
  if ((error || !summary) && !summaryData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load financial summary</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  // If still no summary at this point, return null (shouldn't happen)
  if (!summary) return null

  const { grandTotal, travellerBreakdown, tripCurrency, activitiesSummary, serviceFeesSummary } = summary
  const hasOutstanding = grandTotal.outstandingCents > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Financial Summary
            </CardTitle>
            <CardDescription>
              Overview of trip costs and payments
            </CardDescription>
          </div>
          {agencyId && (
            <TripOrderGeneratorButton
              tripId={tripId}
              currency={tripCurrency}
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Grand Totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Cost"
            value={formatCents(grandTotal.totalCostCents, tripCurrency)}
            icon={<DollarSign className="h-4 w-4" />}
          />
          <StatCard
            label="Collected"
            value={formatCents(grandTotal.totalCollectedCents, tripCurrency)}
            icon={<TrendingUp className="h-4 w-4" />}
            className="text-green-600"
          />
          <StatCard
            label="Outstanding"
            value={formatCents(grandTotal.outstandingCents, tripCurrency)}
            icon={hasOutstanding ? <AlertCircle className="h-4 w-4" /> : undefined}
            className={hasOutstanding ? 'text-amber-600' : 'text-ash-600'}
          />
          <StatCard
            label="Travellers"
            value={String(travellerBreakdown.length)}
            icon={<Users className="h-4 w-4" />}
          />
        </div>

        {/* Cost Breakdown */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-ash-50 rounded-lg">
          <div>
            <p className="text-sm text-ash-500">Activity Costs</p>
            <p className="text-lg font-medium">
              {formatCents(activitiesSummary.totalInTripCurrencyCents, tripCurrency)}
            </p>
          </div>
          <div>
            <p className="text-sm text-ash-500">Service Fees</p>
            <p className="text-lg font-medium">
              {formatCents(serviceFeesSummary.totalInTripCurrencyCents, tripCurrency)}
            </p>
          </div>
        </div>

        {/* Per-Traveller Breakdown */}
        {travellerBreakdown.length > 0 && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="travellers">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Per-Traveller Breakdown
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  {travellerBreakdown.map((traveller) => (
                    <TravellerBreakdownRow
                      key={traveller.travellerId}
                      traveller={traveller}
                      currency={tripCurrency}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
    </Card>
  )
}

// Stat card component
function StatCard({
  label,
  value,
  icon,
  className = '',
}: {
  label: string
  value: string
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-ash-500">{label}</p>
      <p className={`text-xl font-semibold flex items-center gap-2 ${className}`}>
        {icon}
        {value}
      </p>
    </div>
  )
}

// Traveller breakdown row
function TravellerBreakdownRow({
  traveller,
  currency,
}: {
  traveller: TravellerFinancialBreakdownDto
  currency: string
}) {
  return (
    <div className="flex items-center justify-between p-3 bg-white border border-ash-200 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-ash-100 flex items-center justify-center">
          <Users className="h-4 w-4 text-ash-600" />
        </div>
        <div>
          <p className="font-medium text-ash-900">
            {traveller.travellerName}
            {traveller.isPrimary && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Primary
              </Badge>
            )}
          </p>
          <p className="text-sm text-ash-500">
            Activities: {formatCents(traveller.activityCostsInTripCurrencyCents, currency)}
            {' | '}
            Fees: {formatCents(traveller.serviceFeesInTripCurrencyCents, currency)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-semibold text-ash-900">
          {formatCents(traveller.totalInTripCurrencyCents, currency)}
        </p>
      </div>
    </div>
  )
}

// Loading skeleton
function FinancialSummaryCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 p-4 bg-ash-50 rounded-lg">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </CardContent>
    </Card>
  )
}

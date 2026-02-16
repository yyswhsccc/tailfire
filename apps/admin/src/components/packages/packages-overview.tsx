'use client'

/**
 * Bookings Overview Component
 *
 * Displays the financial overview section matching TERN UI design:
 * - Total cost, Paid, Authorized, Unpaid, Expected commission
 * - Info message about commission calculation
 *
 * Uses TripBookingTotalsDto from the booking totals API endpoint.
 */

import { TripPackageTotalsDto } from '@tailfire/shared-types'
import { AlertCircle } from 'lucide-react'

interface PackagesOverviewProps {
  /** Totals from the /bookings/trip/:tripId/totals endpoint */
  totals: TripPackageTotalsDto
  /** Currency code (e.g., 'USD') from the trip */
  currency: string
}

export function PackagesOverview({ totals, currency }: PackagesOverviewProps) {
  const formatCents = (cents: number, curr: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
    }).format(cents / 100)
  }
  const totalCost = totals.grandTotalCents
  const booked = totals.bookedTotalCents
  const paid = totals.totalCollectedCents
  const unpaid = totals.outstandingCents // bookedTotal - paid
  const expectedCommission = totals.expectedCommissionCents
  const pendingCommission = totals.pendingCommissionCents

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-3">Overview</h2>

      {/* Metrics Row - Compact */}
      <div className="flex flex-wrap gap-6 mb-2">
        <div>
          <div className="text-xs text-gray-500">Total cost</div>
          <div className="text-lg font-semibold text-gray-900">
            {formatCents(totalCost, currency)}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500">Paid</div>
          <div className="text-lg font-semibold text-green-600">
            {formatCents(paid, currency)}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500">Booked</div>
          <div className="text-lg font-semibold text-teal-600">
            {formatCents(booked, currency)}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500">Unpaid</div>
          <div className="text-lg font-semibold text-gray-900">
            {formatCents(unpaid, currency)}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500">Exp. commission after split</div>
          <div className="text-lg font-semibold text-gray-900">
            {formatCents(expectedCommission, currency)}
          </div>
        </div>
      </div>

      {/* Info Message */}
      {pendingCommission > 0 && (
        <div className="flex items-start gap-2 text-xs text-gray-500">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Expected commission doesn&apos;t include {formatCents(pendingCommission, currency)} from items not marked as booked
          </span>
        </div>
      )}
    </div>
  )
}

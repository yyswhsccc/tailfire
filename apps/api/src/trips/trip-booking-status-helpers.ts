/**
 * trip-booking-status-helpers — characterization helpers for #360 (Step 4 of
 * the refactor roadmap).
 *
 * Extracts pure-logic decision-making out of `TripsService.getBookingStatus()`
 * (apps/api/src/trips/trips.service.ts:1669+) so that the future
 * `TripBookingSummaryReader` split has a stable, tested contract before the
 * keystone surgery starts.
 *
 * Per Codex audit: do NOT mock the whole 5,489-LOC TripsService with chained
 * Drizzle calls — that produces brittle tests. Instead, peel pure helpers
 * off the data-shaping logic and characterize THOSE.
 *
 * This module has no I/O, no DB dependencies, no injectable deps. Pure
 * functions only. Future `TripBookingSummaryReader` will compose these.
 */
import type {
  ActivityBookingStatusDto,
  ExpectedPaymentStatus,
  CommissionStatus,
} from '@tailfire/shared-types'

/**
 * Subset of an `expected_payment_items` row needed for status aggregation.
 * Decoupled from the Drizzle schema type so this helper has zero schema deps.
 */
export interface ExpectedItemInput {
  expectedAmountCents: number
  paidAmountCents: number | null
  dueDate: string | null
  status: ExpectedPaymentStatus | string
}

/**
 * Subset of an `activity_pricing` row needed for status aggregation.
 */
export interface PricingInput {
  totalPriceCents: number
  commissionTotalCents: number | null
}

export interface SummarizeActivityInput {
  activityId: string
  pricing: PricingInput | null
  items: ExpectedItemInput[]
  /** ISO date YYYY-MM-DD. Lets caller pin "now" for testing. */
  today: string
  /** ISO date YYYY-MM-DD. */
  oneWeekFromNow: string
}

export interface SummarizeActivityOutput {
  status: ActivityBookingStatusDto
  /** Aggregator counters the caller will sum across activities. */
  contribution: {
    expectedCents: number
    paidCents: number
    overdueCount: number
    upcomingDueCount: number
    hasPaymentSchedule: boolean
  }
}

/**
 * Compute the booking-status DTO for a single activity plus the counters
 * the trip-level summary will sum.
 *
 * **Status precedence (highest priority first):** overdue > partial > pending > paid
 *
 * **Empty-cost behavior:** when there is no payment schedule and no base cost,
 * `paymentStatus` is null (matches existing prod behavior — see #346 history).
 * When there IS a base cost but no schedule, status is `'pending'` and the
 * full cost flows through to `expectedCents`.
 *
 * @see TripsService.getBookingStatus at trips.service.ts:1669
 */
export function summarizeActivityPaymentStatus(
  input: SummarizeActivityInput,
): SummarizeActivityOutput {
  const { activityId, pricing, items, today, oneWeekFromNow } = input

  const baseCostCents = pricing?.totalPriceCents ?? 0
  const hasPaymentSchedule = items.length > 0

  let expectedCents = 0
  let paidCents = 0
  let nextDueDate: string | null = null
  let worstStatus: ExpectedPaymentStatus | null = null
  let overdueCount = 0
  let upcomingDueCount = 0

  if (hasPaymentSchedule) {
    for (const item of items) {
      expectedCents += item.expectedAmountCents
      paidCents += item.paidAmountCents || 0

      if (item.dueDate) {
        if (item.status === 'overdue' || (item.dueDate < today && item.status !== 'paid')) {
          overdueCount++
          worstStatus = 'overdue'
        } else if (item.dueDate <= oneWeekFromNow && item.status !== 'paid') {
          upcomingDueCount++
        }

        if (item.status !== 'paid' && (!nextDueDate || item.dueDate < nextDueDate)) {
          nextDueDate = item.dueDate
        }
      }

      if (item.status === 'overdue') {
        worstStatus = 'overdue'
      } else if (item.status === 'partial' && worstStatus !== 'overdue') {
        worstStatus = 'partial'
      } else if (
        item.status === 'pending' &&
        worstStatus !== 'overdue' &&
        worstStatus !== 'partial'
      ) {
        worstStatus = 'pending'
      } else if (!worstStatus) {
        worstStatus = item.status as ExpectedPaymentStatus
      }
    }
  } else {
    expectedCents = baseCostCents
    if (baseCostCents > 0) {
      worstStatus = 'pending' as ExpectedPaymentStatus
    }
  }

  return {
    status: {
      activityId,
      paymentStatus: worstStatus,
      paymentPaidCents: paidCents,
      paymentTotalCents: expectedCents,
      paymentRemainingCents: expectedCents - paidCents,
      commissionStatus: pricing?.commissionTotalCents ? ('pending' as CommissionStatus) : null,
      commissionTotalCents: pricing?.commissionTotalCents || 0,
      hasPaymentSchedule,
      nextDueDate,
    } satisfies ActivityBookingStatusDto,
    contribution: {
      expectedCents,
      paidCents,
      overdueCount,
      upcomingDueCount,
      hasPaymentSchedule,
    },
  }
}

/**
 * Canonical empty-state response shape — used three times in
 * `getBookingStatus` for the "no itineraries / no days / no activities"
 * branches. Extracted so the empty shape can never drift.
 */
export function emptyTripBookingStatusSummary(tripId: string) {
  return {
    tripId,
    activities: {} as Record<string, ActivityBookingStatusDto>,
    summary: {
      totalActivities: 0,
      activitiesWithPaymentSchedule: 0,
      totalExpectedCents: 0,
      totalPaidCents: 0,
      totalRemainingCents: 0,
      overdueCount: 0,
      upcomingDueCount: 0,
    },
  }
}

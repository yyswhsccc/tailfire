/**
 * Spec for trip-booking-status-helpers (#360).
 *
 * Characterization specs for the pure-logic helpers extracted from
 * TripsService.getBookingStatus(). These lock the return shape and the
 * status-precedence rules so the future `TripBookingSummaryReader` split
 * can move the orchestration without changing the contract.
 *
 * No DB, no mocks — pure functions only.
 */
import {
  summarizeActivityPaymentStatus,
  emptyTripBookingStatusSummary,
} from './trip-booking-status-helpers'

const today = '2026-05-14'
const oneWeekFromNow = '2026-05-21'

describe('trip-booking-status-helpers', () => {
  describe('emptyTripBookingStatusSummary', () => {
    it('returns the canonical empty shape', () => {
      const result = emptyTripBookingStatusSummary('trip-abc')
      expect(result).toEqual({
        tripId: 'trip-abc',
        activities: {},
        summary: {
          totalActivities: 0,
          activitiesWithPaymentSchedule: 0,
          totalExpectedCents: 0,
          totalPaidCents: 0,
          totalRemainingCents: 0,
          overdueCount: 0,
          upcomingDueCount: 0,
        },
      })
    })
  })

  describe('summarizeActivityPaymentStatus — no schedule', () => {
    it('with no pricing and no items: null status', () => {
      const out = summarizeActivityPaymentStatus({
        activityId: 'a-1',
        pricing: null,
        items: [],
        today,
        oneWeekFromNow,
      })
      expect(out.status.paymentStatus).toBeNull()
      expect(out.status.paymentTotalCents).toBe(0)
      expect(out.contribution.hasPaymentSchedule).toBe(false)
    })

    it('with base cost but no items: pending status, full cost as expected', () => {
      const out = summarizeActivityPaymentStatus({
        activityId: 'a-2',
        pricing: { totalPriceCents: 100000, commissionTotalCents: null },
        items: [],
        today,
        oneWeekFromNow,
      })
      expect(out.status.paymentStatus).toBe('pending')
      expect(out.status.paymentTotalCents).toBe(100000)
      expect(out.status.paymentPaidCents).toBe(0)
      expect(out.status.paymentRemainingCents).toBe(100000)
      expect(out.contribution.hasPaymentSchedule).toBe(false)
    })

    it('with commission set: commissionStatus reads pending', () => {
      const out = summarizeActivityPaymentStatus({
        activityId: 'a-3',
        pricing: { totalPriceCents: 100000, commissionTotalCents: 10000 },
        items: [],
        today,
        oneWeekFromNow,
      })
      expect(out.status.commissionStatus).toBe('pending')
    })
  })

  describe('summarizeActivityPaymentStatus — with schedule', () => {
    it('paid items: paymentStatus paid, no overdue, full paid', () => {
      const out = summarizeActivityPaymentStatus({
        activityId: 'a-4',
        pricing: { totalPriceCents: 100000, commissionTotalCents: null },
        items: [
          { expectedAmountCents: 50000, paidAmountCents: 50000, dueDate: '2026-04-01', status: 'paid' },
          { expectedAmountCents: 50000, paidAmountCents: 50000, dueDate: '2026-04-15', status: 'paid' },
        ],
        today,
        oneWeekFromNow,
      })
      expect(out.status.paymentStatus).toBe('paid')
      expect(out.status.paymentTotalCents).toBe(100000)
      expect(out.status.paymentPaidCents).toBe(100000)
      expect(out.contribution.overdueCount).toBe(0)
      expect(out.contribution.upcomingDueCount).toBe(0)
    })

    it('overdue item: status overdue, overdueCount=1, even when other items are pending', () => {
      const out = summarizeActivityPaymentStatus({
        activityId: 'a-5',
        pricing: { totalPriceCents: 100000, commissionTotalCents: null },
        items: [
          { expectedAmountCents: 50000, paidAmountCents: 0, dueDate: '2026-04-01', status: 'pending' }, // past due, status pending
          { expectedAmountCents: 50000, paidAmountCents: 0, dueDate: '2026-06-01', status: 'pending' }, // future
        ],
        today,
        oneWeekFromNow,
      })
      expect(out.status.paymentStatus).toBe('overdue')
      expect(out.contribution.overdueCount).toBe(1)
    })

    it('upcoming due within one week: upcomingDueCount counts it', () => {
      const out = summarizeActivityPaymentStatus({
        activityId: 'a-6',
        pricing: { totalPriceCents: 100000, commissionTotalCents: null },
        items: [
          { expectedAmountCents: 100000, paidAmountCents: 0, dueDate: '2026-05-18', status: 'pending' }, // 4 days out
        ],
        today,
        oneWeekFromNow,
      })
      expect(out.contribution.upcomingDueCount).toBe(1)
      expect(out.contribution.overdueCount).toBe(0)
    })

    it('partial item: status partial, overrides pending but not overdue', () => {
      const out = summarizeActivityPaymentStatus({
        activityId: 'a-7',
        pricing: { totalPriceCents: 100000, commissionTotalCents: null },
        items: [
          { expectedAmountCents: 50000, paidAmountCents: 25000, dueDate: '2026-06-01', status: 'partial' },
          { expectedAmountCents: 50000, paidAmountCents: 0, dueDate: '2026-07-01', status: 'pending' },
        ],
        today,
        oneWeekFromNow,
      })
      expect(out.status.paymentStatus).toBe('partial')
    })

    it('mixed paid + overdue: status overdue wins', () => {
      const out = summarizeActivityPaymentStatus({
        activityId: 'a-8',
        pricing: { totalPriceCents: 100000, commissionTotalCents: null },
        items: [
          { expectedAmountCents: 50000, paidAmountCents: 50000, dueDate: '2026-04-01', status: 'paid' },
          { expectedAmountCents: 50000, paidAmountCents: 0, dueDate: '2026-04-15', status: 'overdue' },
        ],
        today,
        oneWeekFromNow,
      })
      expect(out.status.paymentStatus).toBe('overdue')
      expect(out.contribution.overdueCount).toBe(1)
    })

    it('paymentRemainingCents math holds for partial', () => {
      const out = summarizeActivityPaymentStatus({
        activityId: 'a-9',
        pricing: { totalPriceCents: 100000, commissionTotalCents: null },
        items: [
          { expectedAmountCents: 100000, paidAmountCents: 30000, dueDate: '2026-06-01', status: 'partial' },
        ],
        today,
        oneWeekFromNow,
      })
      expect(out.status.paymentRemainingCents).toBe(70000)
    })

    it('items without dueDate are summed but do not affect overdue/upcoming counts', () => {
      const out = summarizeActivityPaymentStatus({
        activityId: 'a-10',
        pricing: { totalPriceCents: 100000, commissionTotalCents: null },
        items: [
          { expectedAmountCents: 100000, paidAmountCents: 0, dueDate: null, status: 'pending' },
        ],
        today,
        oneWeekFromNow,
      })
      expect(out.status.paymentTotalCents).toBe(100000)
      expect(out.contribution.overdueCount).toBe(0)
      expect(out.contribution.upcomingDueCount).toBe(0)
    })
  })
})

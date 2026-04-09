/**
 * Financial Summary Service
 *
 * Provides comprehensive financial summaries for trips:
 * - Total activity costs with currency conversion
 * - Service fees breakdown by status
 * - Per-traveller cost allocation
 * - Commission tracking
 * - Grand totals
 */

import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { eq, sql, and, isNull } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ExchangeRatesService } from './exchange-rates.service'
import { TripAccessService } from '../trips/trip-access.service'
import type { AuthContext } from '../auth/auth.types'
import type {
  TripFinancialSummaryResponseDto,
  ActivityCostSummaryDto,
  TravellerFinancialBreakdownDto,
  ServiceFeeStatus,
} from '@tailfire/shared-types'

@Injectable()
export class FinancialSummaryService {
  private readonly logger = new Logger(FinancialSummaryService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  /**
   * Get comprehensive financial summary for a trip
   */
  async getTripFinancialSummary(tripId: string, auth?: AuthContext): Promise<TripFinancialSummaryResponseDto> {
    if (auth) {
      await this.tripAccessService.verifyReadAccess(tripId, auth)
    }

    // Get trip details
    const [trip] = await this.db.client
      .select({
        id: this.db.schema.trips.id,
        currency: this.db.schema.trips.currency,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, tripId))
      .limit(1)

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`)
    }

    const tripCurrency = trip.currency ?? 'CAD'

    // Get activities summary
    const activitiesSummary = await this.getActivitiesSummary(tripId, tripCurrency)

    // Get service fees summary
    const serviceFeesSummary = await this.getServiceFeesSummary(tripId, tripCurrency)

    // Get traveller breakdown
    const travellerBreakdown = await this.getTravellerBreakdown(tripId, tripCurrency)

    // Get commission summary
    const commissionSummary = await this.getCommissionSummary(tripId)

    // Calculate grand totals
    const grandTotal = {
      totalCostCents:
        activitiesSummary.totalInTripCurrencyCents + serviceFeesSummary.totalInTripCurrencyCents,
      totalCollectedCents: serviceFeesSummary.paidCents,
      outstandingCents: serviceFeesSummary.pendingCents,
    }

    return {
      tripId,
      tripCurrency,
      activitiesSummary,
      serviceFeesSummary,
      travellerBreakdown,
      commissionSummary,
      grandTotal,
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Get activities cost summary
   * Reads from activity_pricing.totalPriceCents (authoritative source)
   */
  private async getActivitiesSummary(
    tripId: string,
    tripCurrency: string
  ): Promise<{
    totalCents: number
    totalInTripCurrencyCents: number
    byActivity: ActivityCostSummaryDto[]
  }> {
    // Get all TOP-LEVEL activities for the trip via itineraries OR direct trip_id reference.
    // Floating packages (e.g. TES imports) use itinerary_activities.trip_id directly
    // instead of the itinerary chain. Must check both paths.
    // LEFT JOIN with activity_pricing to get authoritative pricing data.
    // Exclude child activities (e.g. port_info under cruises) — they're informational, not billable.
    const activities = await this.db.client.execute(sql`
      SELECT DISTINCT ON (ia.id)
        ia.id AS activity_id,
        ia.name AS activity_name,
        ia.activity_type,
        ap.total_price_cents,
        ap.currency AS pricing_currency
      FROM itinerary_activities ia
      LEFT JOIN activity_pricing ap ON ap.activity_id = ia.id
      LEFT JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
      LEFT JOIN itineraries i ON i.id = iday.itinerary_id
      WHERE ia.parent_activity_id IS NULL
        AND (
          i.trip_id = ${tripId}
          OR ia.trip_id = ${tripId}
        )
      ORDER BY ia.id
    `) as any[]

    const byActivity: ActivityCostSummaryDto[] = []
    let totalCents = 0
    let totalInTripCurrencyCents = 0

    for (const activity of activities) {
      // Raw SQL returns snake_case column names
      const activityId = activity.activity_id
      const activityName = activity.activity_name
      const activityType = activity.activity_type
      const activityCurrency = activity.pricing_currency ?? tripCurrency
      const costCents = Number(activity.total_price_cents ?? 0)

      // Log warning if activity has no pricing row
      if (activity.total_price_cents === null) {
        this.logger.warn(`Activity ${activityId} has no pricing row - using $0`)
      }

      // Convert to trip currency if different
      let costInTripCurrencyCents = costCents
      if (activityCurrency !== tripCurrency && costCents > 0) {
        const conversion = await this.exchangeRatesService.convertCurrency({
          amountCents: costCents,
          fromCurrency: activityCurrency,
          toCurrency: tripCurrency,
        })
        costInTripCurrencyCents = conversion.convertedAmountCents
      }

      // Check if activity has splits
      const [splitCount] = await this.db.client
        .select({ count: sql<number>`count(*)::int` })
        .from(this.db.schema.activityTravellerSplits)
        .where(eq(this.db.schema.activityTravellerSplits.activityId, activityId))

      const hasSplits = (splitCount?.count ?? 0) > 0

      // Get split type if exists
      let splitType: 'equal' | 'custom' | null = null
      if (hasSplits) {
        const [firstSplit] = await this.db.client
          .select({ splitType: this.db.schema.activityTravellerSplits.splitType })
          .from(this.db.schema.activityTravellerSplits)
          .where(eq(this.db.schema.activityTravellerSplits.activityId, activityId))
          .limit(1)
        splitType = firstSplit?.splitType ?? null
      }

      byActivity.push({
        activityId,
        activityName,
        activityType,
        totalCostCents: costCents,
        currency: activityCurrency,
        totalInTripCurrencyCents: costInTripCurrencyCents,
        hasSplits,
        splitType,
      })

      totalCents += costCents
      totalInTripCurrencyCents += costInTripCurrencyCents
    }

    return {
      totalCents,
      totalInTripCurrencyCents,
      byActivity,
    }
  }

  /**
   * Get service fees summary
   */
  private async getServiceFeesSummary(
    tripId: string,
    tripCurrency: string
  ): Promise<{
    totalCents: number
    totalInTripCurrencyCents: number
    paidCents: number
    pendingCents: number
    refundedCents: number
    byStatus: Record<ServiceFeeStatus, number>
  }> {
    // Get all service fees for the trip
    const fees = await this.db.client
      .select()
      .from(this.db.schema.serviceFees)
      .where(eq(this.db.schema.serviceFees.tripId, tripId))

    const byStatus: Record<ServiceFeeStatus, number> = {
      draft: 0,
      sent: 0,
      paid: 0,
      partially_refunded: 0,
      refunded: 0,
      cancelled: 0,
    }

    let totalCents = 0
    let totalInTripCurrencyCents = 0
    let paidCents = 0
    let pendingCents = 0
    let refundedCents = 0

    for (const fee of fees) {
      const feeCurrency = fee.currency ?? 'CAD'
      const amountCents = fee.amountCents

      // Convert to trip currency - use snapshotted amount/rate when available
      let amountInTripCurrencyCents = amountCents
      if (feeCurrency !== tripCurrency && amountCents > 0) {
        if (fee.amountInTripCurrencyCents) {
          // Use pre-computed trip currency amount for historical accuracy
          amountInTripCurrencyCents = fee.amountInTripCurrencyCents
        } else if (fee.exchangeRateToTripCurrency) {
          // Use snapshotted exchange rate
          amountInTripCurrencyCents = Math.round(
            amountCents * parseFloat(fee.exchangeRateToTripCurrency)
          )
        } else {
          // Fallback to live rate if no snapshot exists
          this.logger.warn(`Service fee ${fee.id} missing exchange rate snapshot, using live rate`)
          const conversion = await this.exchangeRatesService.convertCurrency({
            amountCents,
            fromCurrency: feeCurrency,
            toCurrency: tripCurrency,
          })
          amountInTripCurrencyCents = conversion.convertedAmountCents
        }
      }

      // Track by status
      byStatus[fee.status] += amountInTripCurrencyCents

      // Track totals (exclude cancelled fees)
      if (fee.status !== 'cancelled') {
        totalCents += amountCents
        totalInTripCurrencyCents += amountInTripCurrencyCents

        if (fee.status === 'paid') {
          paidCents += amountInTripCurrencyCents - (fee.refundedAmountCents ?? 0)
        } else if (fee.status === 'partially_refunded') {
          paidCents += amountInTripCurrencyCents - (fee.refundedAmountCents ?? 0)
          refundedCents += fee.refundedAmountCents ?? 0
        } else if (fee.status === 'refunded') {
          refundedCents += fee.refundedAmountCents ?? 0
        } else if (fee.status === 'draft' || fee.status === 'sent') {
          pendingCents += amountInTripCurrencyCents
        }
      }
    }

    return {
      totalCents,
      totalInTripCurrencyCents,
      paidCents,
      pendingCents,
      refundedCents,
      byStatus,
    }
  }

  /**
   * Get per-traveller financial breakdown
   */
  private async getTravellerBreakdown(
    tripId: string,
    tripCurrency: string
  ): Promise<TravellerFinancialBreakdownDto[]> {
    // Get all travellers for the trip
    const travellers = await this.db.client
      .select()
      .from(this.db.schema.tripTravelers)
      .where(eq(this.db.schema.tripTravelers.tripId, tripId))

    const breakdown: TravellerFinancialBreakdownDto[] = []

    for (const traveller of travellers) {
      // Get contact snapshot for name
      const snapshot = traveller.contactSnapshot as Record<string, unknown> | null
      const firstName = (snapshot?.firstName as string) ?? ''
      const lastName = (snapshot?.lastName as string) ?? ''
      const travellerName = `${firstName} ${lastName}`.trim() || 'Unknown'

      // Get activity splits for this traveller
      const splits = await this.db.client
        .select()
        .from(this.db.schema.activityTravellerSplits)
        .where(eq(this.db.schema.activityTravellerSplits.travellerId, traveller.id))

      let activityCostsCents = 0
      let activityCostsInTripCurrencyCents = 0

      for (const split of splits) {
        const splitCurrency = split.currency ?? 'CAD'
        activityCostsCents += split.amountCents

        // Convert to trip currency - use snapshotted rate when available
        if (splitCurrency !== tripCurrency && split.amountCents > 0) {
          if (split.exchangeRateToTripCurrency) {
            // Use stored snapshot rate for historical accuracy
            activityCostsInTripCurrencyCents += Math.round(
              split.amountCents * parseFloat(split.exchangeRateToTripCurrency)
            )
          } else {
            // Fallback to live rate if no snapshot exists
            this.logger.warn(`Split ${split.id} missing exchange rate snapshot, using live rate`)
            const conversion = await this.exchangeRatesService.convertCurrency({
              amountCents: split.amountCents,
              fromCurrency: splitCurrency,
              toCurrency: tripCurrency,
            })
            activityCostsInTripCurrencyCents += conversion.convertedAmountCents
          }
        } else {
          activityCostsInTripCurrencyCents += split.amountCents
        }
      }

      // Service fees for this traveller (based on recipientType and isPrimaryTraveler)
      // For now, we'll attribute service fees based on primary traveller status
      let serviceFeesCents = 0
      let serviceFeesInTripCurrencyCents = 0

      // If this is the primary traveller, get service fees directed to primary_traveller
      if (traveller.isPrimaryTraveler) {
        const primaryFees = await this.db.client
          .select()
          .from(this.db.schema.serviceFees)
          .where(eq(this.db.schema.serviceFees.tripId, tripId))

        for (const fee of primaryFees) {
          if (fee.recipientType === 'primary_traveller' && fee.status !== 'cancelled') {
            serviceFeesCents += fee.amountCents
            // Use pre-computed trip currency amount or snapshotted rate when available
            if (fee.amountInTripCurrencyCents) {
              // Use stored converted amount for historical accuracy
              serviceFeesInTripCurrencyCents += fee.amountInTripCurrencyCents
            } else if (fee.currency !== tripCurrency && fee.exchangeRateToTripCurrency) {
              // Use snapshotted exchange rate
              serviceFeesInTripCurrencyCents += Math.round(
                fee.amountCents * parseFloat(fee.exchangeRateToTripCurrency)
              )
            } else if (fee.currency !== tripCurrency) {
              // Fallback to live rate if no snapshot exists
              this.logger.warn(`Service fee ${fee.id} in traveller breakdown missing snapshot, using live rate`)
              const conversion = await this.exchangeRatesService.convertCurrency({
                amountCents: fee.amountCents,
                fromCurrency: fee.currency ?? 'CAD',
                toCurrency: tripCurrency,
              })
              serviceFeesInTripCurrencyCents += conversion.convertedAmountCents
            } else {
              serviceFeesInTripCurrencyCents += fee.amountCents
            }
          }
        }
      }

      breakdown.push({
        travellerId: traveller.id,
        travellerName,
        travelerType: traveller.travelerType,
        isPrimary: traveller.isPrimaryTraveler,
        activityCostsCents,
        activityCostsInTripCurrencyCents,
        serviceFeesCents,
        serviceFeesInTripCurrencyCents,
        totalCents: activityCostsCents + serviceFeesCents,
        totalInTripCurrencyCents: activityCostsInTripCurrencyCents + serviceFeesInTripCurrencyCents,
      })
    }

    return breakdown
  }

  /**
   * Get commission summary from component pricing and commission tracking
   */
  private async getCommissionSummary(tripId: string): Promise<{
    expectedTotalCents: number
    receivedTotalCents: number
    pendingTotalCents: number
  }> {
    // Get commission data from component_pricing table (expected commission)
    // joined with commission_tracking (actual received status)
    const pricingData = await this.db.client
      .select({
        pricingId: this.db.schema.activityPricing.id,
        commissionTotalCents: this.db.schema.activityPricing.commissionTotalCents,
      })
      .from(this.db.schema.activityPricing)
      .innerJoin(
        this.db.schema.itineraryActivities,
        eq(this.db.schema.activityPricing.activityId, this.db.schema.itineraryActivities.id)
      )
      .innerJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id)
      )
      .innerJoin(
        this.db.schema.itineraries,
        eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id)
      )
      .where(
        and(
          eq(this.db.schema.itineraries.tripId, tripId),
          isNull(this.db.schema.itineraryActivities.parentActivityId)
        )
      )

    let expectedTotalCents = 0
    let receivedTotalCents = 0

    for (const pricing of pricingData) {
      // commissionTotalCents is stored as integer (cents)
      const commissionCents = pricing.commissionTotalCents ?? 0
      expectedTotalCents += commissionCents

      // Check commission tracking for received status
      const trackingRecords = await this.db.client
        .select({
          commissionAmount: this.db.schema.commissionTracking.commissionAmount,
          commissionStatus: this.db.schema.commissionTracking.commissionStatus,
        })
        .from(this.db.schema.commissionTracking)
        .where(eq(this.db.schema.commissionTracking.activityPricingId, pricing.pricingId))

      for (const tracking of trackingRecords) {
        if (tracking.commissionStatus === 'received') {
          // commissionAmount is decimal (dollars), convert to cents
          receivedTotalCents += Math.round(parseFloat(tracking.commissionAmount ?? '0') * 100)
        }
      }
    }

    return {
      expectedTotalCents,
      receivedTotalCents,
      pendingTotalCents: expectedTotalCents - receivedTotalCents,
    }
  }
}

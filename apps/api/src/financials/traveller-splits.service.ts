/**
 * Traveller Splits Service
 *
 * Manages per-traveller cost breakdown for activities:
 * - Equal splits (auto-calculated)
 * - Custom splits (user-defined amounts)
 * - Validates splits sum to activity total
 * - Handles currency conversion for split display
 * - Triggers notifications when splits need recalculation
 */

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common'
import { eq, and } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ExchangeRatesService } from './exchange-rates.service'
import { TripAccessService } from '../trips/trip-access.service'
import type { AuthContext } from '../auth/auth.types'
import type {
  SetActivitySplitsDto,
  ActivityTravellerSplitResponseDto,
  ActivitySplitsSummaryResponseDto,
  TravellerSummaryDto,
} from '@tailfire/shared-types'

@Injectable()
export class TravellerSplitsService {
  private readonly logger = new Logger(TravellerSplitsService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly tripAccessService: TripAccessService,
  ) {}

  /**
   * Get splits summary for an activity
   */
  async getActivitySplits(activityId: string, auth?: AuthContext): Promise<ActivitySplitsSummaryResponseDto> {
    // Get activity with pricing info
    const activity = await this.getActivityWithDetails(activityId)
    if (!activity) {
      throw new NotFoundException(`Activity ${activityId} not found`)
    }

    if (auth) {
      await this.tripAccessService.verifyReadAccess(activity.tripId, auth)
    }

    // Get existing splits
    const splits = await this.db.client
      .select()
      .from(this.db.schema.activityTravellerSplits)
      .where(eq(this.db.schema.activityTravellerSplits.activityId, activityId))

    // Get all travellers on the trip
    const tripTravellers = await this.getTripTravellers(activity.tripId)

    // Format response
    const formattedSplits: ActivityTravellerSplitResponseDto[] = []
    for (const split of splits) {
      const traveller = tripTravellers.find((t) => t.id === split.travellerId)
      formattedSplits.push({
        id: split.id,
        tripId: split.tripId,
        activityId: split.activityId,
        travellerId: split.travellerId,
        splitType: split.splitType,
        amountCents: split.amountCents,
        currency: split.currency,
        exchangeRateToTripCurrency: split.exchangeRateToTripCurrency,
        exchangeRateSnapshotAt: split.exchangeRateSnapshotAt?.toISOString() ?? null,
        notes: split.notes,
        createdAt: split.createdAt.toISOString(),
        updatedAt: split.updatedAt.toISOString(),
        createdBy: split.createdBy,
        updatedBy: split.updatedBy,
        traveller: traveller ?? undefined,
      })
    }

    // Find travellers not included in splits
    const splitTravellerIds = new Set(splits.map((s) => s.travellerId))
    const missingTravellers = tripTravellers.filter((t) => !splitTravellerIds.has(t.id))

    // Determine split type (first split's type, or default to 'equal')
    const splitType = splits.length > 0 ? splits[0]!.splitType : 'equal'

    return {
      activityId,
      activityName: activity.name,
      totalAmountCents: activity.totalCents,
      currency: activity.currency,
      splitType,
      splits: formattedSplits,
      isComplete: missingTravellers.length === 0,
      missingTravellers: missingTravellers.length > 0 ? missingTravellers : undefined,
    }
  }

  /**
   * Set splits for an activity (PUT - replaces all existing splits)
   * If splitType is 'equal', auto-calculates equal amounts for all travellers
   * If splitType is 'custom', uses provided amounts (must sum to activity total)
   */
  async setActivitySplits(
    activityId: string,
    dto: SetActivitySplitsDto,
    userId?: string,
    auth?: AuthContext,
  ): Promise<ActivitySplitsSummaryResponseDto> {
    // Get activity with pricing info
    const activity = await this.getActivityWithDetails(activityId)
    if (!activity) {
      throw new NotFoundException(`Activity ${activityId} not found`)
    }

    if (auth) {
      await this.tripAccessService.verifyWriteAccess(activity.tripId, auth)
    }

    // Get trip travellers
    const tripTravellers = await this.getTripTravellers(activity.tripId)
    if (tripTravellers.length === 0) {
      throw new BadRequestException('Trip has no travellers to split costs among')
    }

    // Snapshot exchange rate if activity currency differs from trip currency
    let exchangeRate: string | null = null
    let exchangeRateSnapshotAt: Date | null = null

    if (activity.currency !== activity.tripCurrency) {
      try {
        const rateResponse = await this.exchangeRatesService.getExchangeRate(
          activity.currency,
          activity.tripCurrency
        )
        exchangeRate = rateResponse.rate
        exchangeRateSnapshotAt = new Date()
        this.logger.log(
          `Snapshotted exchange rate ${activity.currency}→${activity.tripCurrency}: ${exchangeRate}`
        )
      } catch (error) {
        this.logger.warn(
          `Failed to get exchange rate ${activity.currency}→${activity.tripCurrency}: ${error}`
        )
        // Continue without exchange rate - can be populated later
      }
    }

    // Calculate splits based on type
    let splitsToInsert: Array<{
      tripId: string
      activityId: string
      travellerId: string
      splitType: 'equal' | 'custom'
      amountCents: number
      currency: string
      exchangeRateToTripCurrency: string | null
      exchangeRateSnapshotAt: Date | null
      notes: string | null
      createdBy: string | null
      updatedBy: string | null
    }>

    if (dto.splitType === 'equal') {
      // Auto-calculate equal splits
      const amountPerTraveller = Math.floor(activity.totalCents / tripTravellers.length)
      const remainder = activity.totalCents % tripTravellers.length

      splitsToInsert = tripTravellers.map((traveller, index) => ({
        tripId: activity.tripId,
        activityId,
        travellerId: traveller.id,
        splitType: 'equal' as const,
        // Distribute remainder to first N travellers
        amountCents: amountPerTraveller + (index < remainder ? 1 : 0),
        currency: activity.currency,
        exchangeRateToTripCurrency: exchangeRate,
        exchangeRateSnapshotAt,
        notes: null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      }))
    } else {
      // Custom splits - validate provided splits
      if (!dto.splits || dto.splits.length === 0) {
        throw new BadRequestException('Custom splits require at least one split entry')
      }

      // Validate all traveller IDs belong to the trip
      const tripTravellerIds = new Set(tripTravellers.map((t) => t.id))
      for (const split of dto.splits) {
        if (!tripTravellerIds.has(split.travellerId)) {
          throw new BadRequestException(`Traveller ${split.travellerId} is not on this trip`)
        }
      }

      // Validate amounts sum to total
      const totalSplit = dto.splits.reduce((sum, s) => sum + s.amountCents, 0)
      if (totalSplit !== activity.totalCents) {
        throw new BadRequestException(
          `Split amounts (${totalSplit} cents) must equal activity total (${activity.totalCents} cents)`
        )
      }

      // Validate no negative amounts
      if (dto.splits.some((s) => s.amountCents < 0)) {
        throw new BadRequestException('Split amounts cannot be negative')
      }

      splitsToInsert = dto.splits.map((split) => ({
        tripId: activity.tripId,
        activityId,
        travellerId: split.travellerId,
        splitType: 'custom' as const,
        amountCents: split.amountCents,
        currency: activity.currency,
        exchangeRateToTripCurrency: exchangeRate,
        exchangeRateSnapshotAt,
        notes: split.notes ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      }))
    }

    // Delete existing splits and insert new ones in a transaction
    await this.db.client.transaction(async (tx) => {
      // Delete existing splits for this activity
      await tx
        .delete(this.db.schema.activityTravellerSplits)
        .where(eq(this.db.schema.activityTravellerSplits.activityId, activityId))

      // Insert new splits
      if (splitsToInsert.length > 0) {
        await tx.insert(this.db.schema.activityTravellerSplits).values(splitsToInsert)
      }
    })

    // Return updated summary
    return this.getActivitySplits(activityId)
  }

  /**
   * Delete all splits for an activity
   */
  async deleteActivitySplits(activityId: string, auth?: AuthContext): Promise<void> {
    if (auth) {
      const activity = await this.getActivityWithDetails(activityId)
      if (activity) {
        await this.tripAccessService.verifyWriteAccess(activity.tripId, auth)
      }
    }

    await this.db.client
      .delete(this.db.schema.activityTravellerSplits)
      .where(eq(this.db.schema.activityTravellerSplits.activityId, activityId))
  }

  /**
   * Get all splits for a traveller across a trip
   */
  async getTravellerSplits(
    tripId: string,
    travellerId: string
  ): Promise<ActivityTravellerSplitResponseDto[]> {
    const splits = await this.db.client
      .select()
      .from(this.db.schema.activityTravellerSplits)
      .where(
        and(
          eq(this.db.schema.activityTravellerSplits.tripId, tripId),
          eq(this.db.schema.activityTravellerSplits.travellerId, travellerId)
        )
      )

    return splits.map((split) => ({
      id: split.id,
      tripId: split.tripId,
      activityId: split.activityId,
      travellerId: split.travellerId,
      splitType: split.splitType,
      amountCents: split.amountCents,
      currency: split.currency,
      exchangeRateToTripCurrency: split.exchangeRateToTripCurrency,
      exchangeRateSnapshotAt: split.exchangeRateSnapshotAt?.toISOString() ?? null,
      notes: split.notes,
      createdAt: split.createdAt.toISOString(),
      updatedAt: split.updatedAt.toISOString(),
      createdBy: split.createdBy,
      updatedBy: split.updatedBy,
    }))
  }

  /**
   * Delete all splits for a traveller (when traveller is removed from trip)
   * This should create a notification for affected activities
   */
  async deleteTravellerSplits(
    tripId: string,
    travellerId: string
  ): Promise<{ affectedActivityIds: string[] }> {
    // Get affected activities before deletion
    const affectedSplits = await this.db.client
      .select({ activityId: this.db.schema.activityTravellerSplits.activityId })
      .from(this.db.schema.activityTravellerSplits)
      .where(
        and(
          eq(this.db.schema.activityTravellerSplits.tripId, tripId),
          eq(this.db.schema.activityTravellerSplits.travellerId, travellerId)
        )
      )

    const affectedActivityIds = [...new Set(affectedSplits.map((s) => s.activityId))]

    // Delete splits
    await this.db.client
      .delete(this.db.schema.activityTravellerSplits)
      .where(
        and(
          eq(this.db.schema.activityTravellerSplits.tripId, tripId),
          eq(this.db.schema.activityTravellerSplits.travellerId, travellerId)
        )
      )

    return { affectedActivityIds }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Get activity with pricing details including trip currency
   * Reads from activity_pricing.totalPriceCents (authoritative source)
   */
  private async getActivityWithDetails(activityId: string): Promise<{
    id: string
    name: string
    tripId: string
    totalCents: number
    currency: string
    tripCurrency: string
  } | null> {
    // Get activity with pricing from activity_pricing (authoritative source)
    const [activity] = await this.db.client
      .select({
        id: this.db.schema.itineraryActivities.id,
        name: this.db.schema.itineraryActivities.name,
        itineraryDayId: this.db.schema.itineraryActivities.itineraryDayId,
        // Read from activity_pricing (authoritative source)
        totalPriceCents: this.db.schema.activityPricing.totalPriceCents,
        pricingCurrency: this.db.schema.activityPricing.currency,
      })
      .from(this.db.schema.itineraryActivities)
      .leftJoin(
        this.db.schema.activityPricing,
        eq(this.db.schema.activityPricing.activityId, this.db.schema.itineraryActivities.id)
      )
      .where(eq(this.db.schema.itineraryActivities.id, activityId))
      .limit(1)

    if (!activity) {
      return null
    }

    // Floating activities (null itineraryDayId) cannot be split - they need to be linked to a day
    if (!activity.itineraryDayId) {
      return null
    }

    // Get trip ID via itinerary_day -> itinerary -> trip
    const [itineraryDay] = await this.db.client
      .select({
        itineraryId: this.db.schema.itineraryDays.itineraryId,
      })
      .from(this.db.schema.itineraryDays)
      .where(eq(this.db.schema.itineraryDays.id, activity.itineraryDayId))
      .limit(1)

    if (!itineraryDay) {
      return null
    }

    const [itinerary] = await this.db.client
      .select({
        tripId: this.db.schema.itineraries.tripId,
      })
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.id, itineraryDay.itineraryId))
      .limit(1)

    if (!itinerary) {
      return null
    }

    // Get trip currency
    const [trip] = await this.db.client
      .select({
        currency: this.db.schema.trips.currency,
      })
      .from(this.db.schema.trips)
      .where(eq(this.db.schema.trips.id, itinerary.tripId))
      .limit(1)

    if (!trip) {
      return null
    }

    const tripCurrency = trip.currency ?? 'CAD'

    // Use pricing data directly (already in cents) with null guards
    const totalCents = activity.totalPriceCents ?? 0
    const currency = activity.pricingCurrency ?? tripCurrency

    // Log warning if activity has no pricing row
    if (activity.totalPriceCents === null) {
      this.logger.warn(`Activity ${activityId} has no pricing row - using $0 for splits`)
    }

    return {
      id: activity.id,
      name: activity.name,
      tripId: itinerary.tripId,
      totalCents,
      currency,
      tripCurrency,
    }
  }

  /**
   * Get all travellers for a trip
   */
  private async getTripTravellers(tripId: string): Promise<TravellerSummaryDto[]> {
    const travellers = await this.db.client
      .select({
        id: this.db.schema.tripTravelers.id,
        contactId: this.db.schema.tripTravelers.contactId,
        travelerType: this.db.schema.tripTravelers.travelerType,
        role: this.db.schema.tripTravelers.role,
        contactSnapshot: this.db.schema.tripTravelers.contactSnapshot,
      })
      .from(this.db.schema.tripTravelers)
      .where(eq(this.db.schema.tripTravelers.tripId, tripId))

    return travellers.map((t) => {
      // Extract name from contact snapshot or default
      const snapshot = t.contactSnapshot as Record<string, unknown> | null
      const firstName = (snapshot?.firstName as string) ?? null
      const lastName = (snapshot?.lastName as string) ?? null

      return {
        id: t.id,
        contactId: t.contactId,
        firstName,
        lastName,
        travelerType: t.travelerType,
        role: t.role,
      }
    })
  }
}

/**
 * Base Component Service
 *
 * Handles shared CRUD operations for all component types.
 * Works with the base itinerary_activities table.
 * Auto-creates activity_pricing records for financial tracking.
 */

import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { eq, desc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { GroupBillingService } from './group-billing.service'
import { schema } from '@tailfire/database'

/**
 * Validates and parses a datetime string, returning null if invalid.
 * Prevents RangeError from being thrown when invalid datetime strings
 * are passed to new Date() and later converted with .toISOString()
 */
function validateDatetime(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  // Check if the date is valid (Invalid Date has NaN getTime())
  return isNaN(date.getTime()) ? null : date
}

export interface BaseComponentData {
  agencyId: string // Required for RLS
  itineraryDayId?: string | null // Optional/nullable for floating packages
  parentActivityId?: string | null // For cruise → port_info relationship
  componentType: string
  activityType: string
  name: string
  description?: string | null
  sequenceOrder?: number
  startDatetime?: string | null
  endDatetime?: string | null
  timezone?: string | null
  location?: string | null
  address?: string | null
  coordinates?: any | null
  notes?: string | null
  confirmationNumber?: string | null
  referralUrl?: string | null
  status?: string
  proposalStatus?: string
  bookingStatus?: string
  // Fix #428: bookingDate accepted by Zod baseCreateComponentSchema +
  // baseUpdateComponentSchema and persisted on itinerary_activities, but
  // the base-component service was silently dropping it on the way through.
  bookingDate?: string | null
  pricingType?: string | null
  currency?: string
  photos?: any[] | null
}

export interface UpdateBaseComponentData {
  name?: string
  description?: string | null
  sequenceOrder?: number
  startDatetime?: string | null
  endDatetime?: string | null
  timezone?: string | null
  location?: string | null
  address?: string | null
  coordinates?: any | null
  notes?: string | null
  confirmationNumber?: string | null
  referralUrl?: string | null
  status?: string
  proposalStatus?: string
  bookingStatus?: string
  // Fix #428: see BaseComponentData above
  bookingDate?: string | null
  pricingType?: string | null
  currency?: string
  photos?: any[] | null
}

@Injectable()
export class BaseComponentService {
  private readonly logger = new Logger(BaseComponentService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly groupBillingService: GroupBillingService,
  ) {}

  /**
   * Get a single component by ID
   */
  async findById(id: string): Promise<any> {
    const [component] = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, id))
      .limit(1)

    if (!component) {
      throw new NotFoundException(`Component with ID ${id} not found`)
    }

    return component
  }

  /**
   * Get components by day
   */
  async findByDay(itineraryDayId: string): Promise<any[]> {
    const components = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.itineraryDayId, itineraryDayId))
      .orderBy(this.db.schema.itineraryActivities.sequenceOrder)

    return components
  }

  /**
   * Create base component record.
   * Returns the created component ID.
   * Also auto-creates a corresponding activity_pricing record for financial tracking.
   */
  async create(data: BaseComponentData): Promise<string>
  /**
   * Create base component record and return full data (optimized for DTO construction).
   * Returns the created component AND activity_pricing record to avoid re-fetching.
   * Use this when you need to construct a response DTO immediately after creation.
   */
  async create(
    data: BaseComponentData,
    options: { returnDetails: true }
  ): Promise<{ component: schema.ItineraryActivity; activityPricing: schema.ActivityPricing | null }>
  async create(
    data: BaseComponentData,
    options?: { returnDetails?: boolean }
  ): Promise<string | { component: schema.ItineraryActivity; activityPricing: schema.ActivityPricing | null }> {
    // Verify day exists (skip for floating packages with null dayId)
    if (data.itineraryDayId) {
      await this.verifyDayExists(data.itineraryDayId)
    }

    // If no sequence order provided, get the next available (use 0 for floating activities)
    let sequenceOrder = data.sequenceOrder ?? 0
    if (data.sequenceOrder === undefined && data.itineraryDayId) {
      const maxSeq = await this.getMaxSequenceOrder(data.itineraryDayId)
      sequenceOrder = maxSeq + 1
    }

    // Default currency to CAD (Canadian agency)
    const currency = data.currency || 'CAD'

    const [component] = await this.db.client
      .insert(this.db.schema.itineraryActivities)
      .values({
        agencyId: data.agencyId, // Required for RLS
        itineraryDayId: data.itineraryDayId,
        parentActivityId: data.parentActivityId || null,
        componentType: data.componentType as any,
        activityType: data.activityType as any,
        name: data.name,
        description: data.description || null,
        sequenceOrder,
        startDatetime: validateDatetime(data.startDatetime),
        endDatetime: validateDatetime(data.endDatetime),
        timezone: data.timezone || null,
        location: data.location || null,
        address: data.address || null,
        coordinates: data.coordinates || null,
        notes: data.notes || null,
        confirmationNumber: data.confirmationNumber || null,
        referralUrl: data.referralUrl || null,
        proposalStatus: (data.proposalStatus as any) || 'draft',
        bookingStatus: (data.bookingStatus as any) || 'unbooked',
        // Fix #428: persist initial bookingDate when supplied at create
        bookingDate: data.bookingDate ? new Date(data.bookingDate) : null,
        pricingType: data.pricingType as any,
        currency,
        photos: data.photos || null,
      })
      .returning()

    if (!component) {
      throw new Error('Failed to create component')
    }

    // Auto-create activity_pricing record for financial tracking
    // Pricing starts at 0 and is updated via the pricing API
    let activityPricing: schema.ActivityPricing | null = null
    try {
      // Resolve group billing target from itinerary → trip → group
      let billedToTripId: string | null = null
      if (data.itineraryDayId) {
        const [dayRow] = await this.db.client
          .select({ itineraryId: this.db.schema.itineraryDays.itineraryId })
          .from(this.db.schema.itineraryDays)
          .where(eq(this.db.schema.itineraryDays.id, data.itineraryDayId))
          .limit(1)
        if (dayRow) {
          const [itRow] = await this.db.client
            .select({ tripId: this.db.schema.itineraries.tripId })
            .from(this.db.schema.itineraries)
            .where(eq(this.db.schema.itineraries.id, dayRow.itineraryId))
            .limit(1)
          if (itRow?.tripId) {
            billedToTripId = await this.groupBillingService.resolveDefaultBillingTarget(itRow.tripId)
          }
        }
      }

      const [pricing] = await this.db.client
        .insert(this.db.schema.activityPricing)
        .values({
          agencyId: data.agencyId, // Required for RLS
          activityId: component.id,
          pricingType: (data.pricingType as any) || 'per_person',
          basePrice: '0',
          currency,
          totalPriceCents: 0,
          billedToTripId,
        })
        .returning()
      activityPricing = pricing ?? null
      this.logger.debug(`Auto-created activity_pricing for activity ${component.id}`)
    } catch (error) {
      // Log but don't fail - pricing can be created later via the pricing API
      this.logger.warn(`Failed to auto-create activity_pricing for activity ${component.id}: ${error}`)
    }

    // Return based on options
    if (options?.returnDetails) {
      return { component, activityPricing }
    }
    return component.id
  }

  /**
   * @deprecated Use create(data, { returnDetails: true }) instead
   * Create base component record and return full data (optimized for DTO construction).
   * Returns the created component AND activity_pricing record to avoid re-fetching.
   */
  async createWithDetails(data: BaseComponentData): Promise<{
    component: schema.ItineraryActivity
    activityPricing: schema.ActivityPricing | null
  }> {
    return this.create(data, { returnDetails: true })
  }

  /**
   * Update base component fields
   */
  async update(id: string, data: UpdateBaseComponentData): Promise<void> {
    // Check if component exists
    await this.findById(id)

    await this.db.client
      .update(this.db.schema.itineraryActivities)
      .set({
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.sequenceOrder !== undefined && { sequenceOrder: data.sequenceOrder }),
        ...(data.startDatetime !== undefined && {
          startDatetime: validateDatetime(data.startDatetime),
        }),
        ...(data.endDatetime !== undefined && {
          endDatetime: validateDatetime(data.endDatetime),
        }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.coordinates !== undefined && { coordinates: data.coordinates }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.confirmationNumber !== undefined && { confirmationNumber: data.confirmationNumber }),
        ...(data.referralUrl !== undefined && { referralUrl: data.referralUrl || null }),
        ...(data.proposalStatus && { proposalStatus: data.proposalStatus as any }),
        ...(data.bookingStatus && { bookingStatus: data.bookingStatus as any }),
        // Fix #428: write through bookingDate. `undefined` = leave alone;
        // explicit `null` clears it (e.g. when un-booking an activity).
        ...(data.bookingDate !== undefined && {
          bookingDate: data.bookingDate ? new Date(data.bookingDate) : null,
        }),
        ...(data.pricingType !== undefined && { pricingType: data.pricingType as any }),
        ...(data.currency && { currency: data.currency }),
        ...(data.photos !== undefined && { photos: data.photos }),
        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.itineraryActivities.id, id))
  }

  /**
   * Delete component (cascades to details via FK)
   */
  async delete(id: string): Promise<void> {
    // Check if component exists
    await this.findById(id)

    await this.db.client
      .delete(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, id))
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async verifyDayExists(itineraryDayId: string): Promise<void> {
    const [day] = await this.db.client
      .select()
      .from(this.db.schema.itineraryDays)
      .where(eq(this.db.schema.itineraryDays.id, itineraryDayId))
      .limit(1)

    if (!day) {
      throw new NotFoundException(`Itinerary day with ID ${itineraryDayId} not found`)
    }
  }

  private async getMaxSequenceOrder(itineraryDayId: string): Promise<number> {
    const [result] = await this.db.client
      .select({
        maxSeq: this.db.schema.itineraryActivities.sequenceOrder,
      })
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.itineraryDayId, itineraryDayId))
      .orderBy(desc(this.db.schema.itineraryActivities.sequenceOrder))
      .limit(1)

    return result?.maxSeq ?? -1
  }
}

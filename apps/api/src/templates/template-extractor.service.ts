/**
 * Template Extractor Service
 *
 * Extracts template payloads from existing itineraries and packages.
 * Used for "Save to Library" functionality.
 *
 * Key responsibilities:
 * - Extract itinerary structure to ItineraryTemplatePayload
 * - Extract package structure to PackageTemplatePayload
 * - Strip IDs, convert datetimes, preserve pricing and details
 */

import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common'
import { eq, asc, inArray } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ItineraryTemplatesService } from './itinerary-templates.service'
import { PackageTemplatesService } from './package-templates.service'
import { ActivitiesService } from '../trips/activities.service'
import type {
  ItineraryTemplatePayload,
  PackageTemplatePayload,
  TemplateActivity,
  ItineraryTemplateResponse,
  PackageTemplateResponse,
  SaveItineraryAsTemplateDto,
  SavePackageAsTemplateDto,
  ActivityType,
} from '@tailfire/shared-types'

@Injectable()
export class TemplateExtractorService {
  private readonly logger = new Logger(TemplateExtractorService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly itineraryTemplatesService: ItineraryTemplatesService,
    private readonly packageTemplatesService: PackageTemplatesService,
    private readonly activitiesService: ActivitiesService
  ) {}

  /**
   * Extract an itinerary to a template and save it.
   *
   * @param itineraryId - Itinerary to extract
   * @param dto - Template metadata (agencyId, name, description)
   * @returns Created template
   */
  async saveItineraryAsTemplate(
    itineraryId: string,
    dto: SaveItineraryAsTemplateDto & { createdBy?: string }
  ): Promise<ItineraryTemplateResponse> {
    this.logger.log(`Extracting itinerary ${itineraryId} to template`)

    // 1. Fetch itinerary days with activities
    const days = await this.db.client
      .select()
      .from(this.db.schema.itineraryDays)
      .where(eq(this.db.schema.itineraryDays.itineraryId, itineraryId))
      .orderBy(asc(this.db.schema.itineraryDays.sequenceOrder))

    if (days.length === 0) {
      throw new NotFoundException(`Itinerary ${itineraryId} not found or has no days`)
    }

    // 2. Extract payload
    const payload = await this._extractPayloadFromDays(days)

    // 3. Create template
    return this.itineraryTemplatesService.create({
      agencyId: dto.agencyId,
      name: dto.name,
      description: dto.description,
      payload,
      createdBy: dto.createdBy,
    })
  }

  /**
   * Extract a package to a template and save it.
   * Package is now an activity with activityType='package'.
   *
   * @param packageId - Package activity ID to extract
   * @param dto - Template metadata (agencyId, name, description)
   * @returns Created template
   */
  async savePackageAsTemplate(
    packageId: string,
    dto: SavePackageAsTemplateDto & { createdBy?: string }
  ): Promise<PackageTemplateResponse> {
    this.logger.log(`Extracting package ${packageId} to template`)

    // 1. Get the package activity
    const pkg = await this.activitiesService.findOne(packageId)
    if (!pkg) {
      throw new NotFoundException(`Package ${packageId} not found`)
    }
    if (pkg.activityType !== 'package') {
      throw new BadRequestException(`Activity ${packageId} is not a package`)
    }

    // 2. Get child activities linked to this package via parentActivityId
    const activities = await this.db.client
      .select()
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.parentActivityId, packageId))
      .orderBy(asc(this.db.schema.itineraryActivities.sequenceOrder))

    // 3. Get all days for these activities (filter out null itineraryDayIds for floating activities)
    const nonNullDayIds = activities
      .map((a) => a.itineraryDayId)
      .filter((id): id is string => id !== null)
    const dayIds = [...new Set(nonNullDayIds)]
    const days =
      dayIds.length > 0
        ? await this.db.client
            .select()
            .from(this.db.schema.itineraryDays)
            .where(inArray(this.db.schema.itineraryDays.id, dayIds))
            .orderBy(asc(this.db.schema.itineraryDays.sequenceOrder))
        : []

    // 4. Extract payload
    const payload = await this.extractPackagePayload(pkg, activities, days)

    // 5. Create template
    return this.packageTemplatesService.create({
      agencyId: dto.agencyId,
      name: dto.name,
      description: dto.description,
      payload,
      createdBy: dto.createdBy,
    })
  }

  /**
   * Extract itinerary payload directly from an itinerary ID.
   * Public method for use by ItineraryCloneService and other consumers.
   */
  async extractItineraryPayload(itineraryId: string): Promise<ItineraryTemplatePayload> {
    const days = await this.db.client
      .select()
      .from(this.db.schema.itineraryDays)
      .where(eq(this.db.schema.itineraryDays.itineraryId, itineraryId))
      .orderBy(asc(this.db.schema.itineraryDays.sequenceOrder))
    if (days.length === 0) return { dayOffsets: [] }
    return this._extractPayloadFromDays(days)
  }

  /**
   * Extract itinerary payload from days.
   */
  private async _extractPayloadFromDays(
    days: Array<typeof this.db.schema.itineraryDays.$inferSelect>
  ): Promise<ItineraryTemplatePayload> {
    // Get all activities for these days
    const dayIds = days.map((d) => d.id)
    const activities =
      dayIds.length > 0
        ? await this.db.client
            .select()
            .from(this.db.schema.itineraryActivities)
            .where(inArray(this.db.schema.itineraryActivities.itineraryDayId, dayIds))
            .orderBy(asc(this.db.schema.itineraryActivities.sequenceOrder))
        : []

    // Get pricing for all activities
    const activityIds = activities.map((a) => a.id)
    const pricingMap = await this.fetchActivityPricing(activityIds)

    // Get type-specific details for all activities
    const detailsMap = await this.fetchActivityDetails(activities)

    // Create day-to-index map (using first day as anchor)
    const firstDayDate = days[0]?.date ? new Date(days[0].date) : new Date()
    const dayDateMap = new Map(days.map((d) => [d.id, d.date ? new Date(d.date) : firstDayDate]))

    // Group activities by day (skip activities with null itineraryDayId - floating activities)
    const activitiesByDay = new Map<string, typeof activities>()
    for (const activity of activities) {
      if (!activity.itineraryDayId) continue
      const dayActivities = activitiesByDay.get(activity.itineraryDayId) || []
      dayActivities.push(activity)
      activitiesByDay.set(activity.itineraryDayId, dayActivities)
    }

    // Build day offsets
    const dayOffsets = days.map((day) => {
      const dayDate = dayDateMap.get(day.id) || firstDayDate
      const dayIndex = this.calculateDayOffset(firstDayDate, dayDate)
      const dayActivities = activitiesByDay.get(day.id) || []

      return {
        dayIndex,
        activities: dayActivities.map((a) =>
          this.extractActivityToTemplate(a, pricingMap.get(a.id), detailsMap.get(a.id))
        ),
      }
    })

    return { dayOffsets }
  }

  /**
   * Extract package payload from package activity and its children.
   */
  private async extractPackagePayload(
    pkg: Awaited<ReturnType<ActivitiesService['findOne']>>,
    activities: Array<typeof this.db.schema.itineraryActivities.$inferSelect>,
    days: Array<typeof this.db.schema.itineraryDays.$inferSelect>
  ): Promise<PackageTemplatePayload> {
    // Get pricing for all activities
    const activityIds = activities.map((a) => a.id)
    const pricingMap = await this.fetchActivityPricing(activityIds)

    // Get type-specific details for all activities
    const detailsMap = await this.fetchActivityDetails(activities)

    // Create day-to-date map
    const dayDateMap = new Map(days.map((d) => [d.id, d.date ? new Date(d.date) : new Date()]))

    // Find the anchor day (earliest day)
    const sortedDays = [...days].sort((a, b) => {
      const aDate = a.date ? new Date(a.date).getTime() : 0
      const bDate = b.date ? new Date(b.date).getTime() : 0
      return aDate - bDate
    })
    const anchorDate = sortedDays[0]?.date ? new Date(sortedDays[0].date) : new Date()

    // Group activities by day (skip activities with null itineraryDayId - floating activities)
    const activitiesByDay = new Map<string, typeof activities>()
    for (const activity of activities) {
      if (!activity.itineraryDayId) continue
      const dayActivities = activitiesByDay.get(activity.itineraryDayId) || []
      dayActivities.push(activity)
      activitiesByDay.set(activity.itineraryDayId, dayActivities)
    }

    // Build day offsets
    const dayOffsets = sortedDays.map((day) => {
      const dayDate = dayDateMap.get(day.id) || anchorDate
      const dayIndex = this.calculateDayOffset(anchorDate, dayDate)
      const dayActivities = activitiesByDay.get(day.id) || []

      return {
        dayIndex,
        activities: dayActivities.map((a) =>
          this.extractActivityToTemplate(a, pricingMap.get(a.id), detailsMap.get(a.id))
        ),
      }
    })

    return {
      packageMetadata: {
        name: pkg.name,
        // Note: Packages don't have descriptions, only notes.
        // Template description is provided via the save-as-template DTO.
        pricingType: (pkg.pricing?.pricingType as 'flat_rate' | 'per_person') || 'flat_rate',
        totalPriceCents: pkg.pricing?.totalPriceCents ?? undefined,
        currency: pkg.pricing?.currency ?? pkg.currency ?? undefined,
      },
      dayOffsets,
    }
  }

  /**
   * Extract a single activity to template format.
   */
  private extractActivityToTemplate(
    activity: typeof this.db.schema.itineraryActivities.$inferSelect,
    pricing?: {
      totalPriceCents: number | null
      currency: string | null
      taxesAndFeesCents: number | null
      commissionTotalCents: number | null
      commissionSplitPercentage: string | null
    },
    details?: Record<string, unknown>
  ): TemplateActivity {
    return {
      componentType: activity.componentType as ActivityType,
      activityType: activity.activityType as ActivityType,
      name: activity.name,
      sequenceOrder: activity.sequenceOrder,

      // Convert datetime to HH:MM format (strip date)
      startTime: this.extractTime(activity.startDatetime),
      endTime: this.extractTime(activity.endDatetime),
      timezone: activity.timezone,

      // Location
      location: activity.location,
      address: activity.address,
      coordinates: activity.coordinates,
      notes: activity.notes,
      confirmationNumber: activity.confirmationNumber,

      // Pricing (if exists)
      ...(pricing && {
        pricing: {
          totalPriceCents: pricing.totalPriceCents,
          currency: pricing.currency,
          taxesCents: pricing.taxesAndFeesCents,
          commissionAmountCents: pricing.commissionTotalCents,
          commissionSplitPercent: pricing.commissionSplitPercentage
            ? parseFloat(pricing.commissionSplitPercentage)
            : null,
        },
      }),

      // Type-specific details (if exists)
      ...(details && Object.keys(details).length > 0 && { details }),
    }
  }

  /**
   * Fetch activity pricing for multiple activities.
   */
  private async fetchActivityPricing(
    activityIds: string[]
  ): Promise<Map<string, { totalPriceCents: number | null; currency: string | null; taxesAndFeesCents: number | null; commissionTotalCents: number | null; commissionSplitPercentage: string | null }>> {
    if (activityIds.length === 0) return new Map()

    const pricingRecords = await this.db.client
      .select({
        activityId: this.db.schema.activityPricing.activityId,
        totalPriceCents: this.db.schema.activityPricing.totalPriceCents,
        currency: this.db.schema.activityPricing.currency,
        taxesAndFeesCents: this.db.schema.activityPricing.taxesAndFeesCents,
        commissionTotalCents: this.db.schema.activityPricing.commissionTotalCents,
        commissionSplitPercentage: this.db.schema.activityPricing.commissionSplitPercentage,
      })
      .from(this.db.schema.activityPricing)
      .where(inArray(this.db.schema.activityPricing.activityId, activityIds))

    const map = new Map<string, { totalPriceCents: number | null; currency: string | null; taxesAndFeesCents: number | null; commissionTotalCents: number | null; commissionSplitPercentage: string | null }>()
    for (const record of pricingRecords) {
      map.set(record.activityId, {
        totalPriceCents: record.totalPriceCents,
        currency: record.currency,
        taxesAndFeesCents: record.taxesAndFeesCents,
        commissionTotalCents: record.commissionTotalCents,
        commissionSplitPercentage: record.commissionSplitPercentage,
      })
    }
    return map
  }

  /**
   * Fetch type-specific details for activities.
   * Returns a map of activityId -> details object.
   */
  private async fetchActivityDetails(
    activities: Array<typeof this.db.schema.itineraryActivities.$inferSelect>
  ): Promise<Map<string, Record<string, unknown>>> {
    const detailsMap = new Map<string, Record<string, unknown>>()

    // Group by activity type for batch fetching
    const byType = new Map<ActivityType, string[]>()
    for (const activity of activities) {
      const type = activity.activityType as ActivityType
      const ids = byType.get(type) || []
      ids.push(activity.id)
      byType.set(type, ids)
    }

    // Fetch details for each type
    const fetchPromises: Promise<void>[] = []

    if (byType.has('flight')) {
      fetchPromises.push(
        this.fetchFlightDetails(byType.get('flight')!).then((details) => {
          for (const [id, d] of details) detailsMap.set(id, d)
        })
      )
    }

    if (byType.has('lodging')) {
      fetchPromises.push(
        this.fetchLodgingDetails(byType.get('lodging')!).then((details) => {
          for (const [id, d] of details) detailsMap.set(id, d)
        })
      )
    }

    if (byType.has('transportation')) {
      fetchPromises.push(
        this.fetchTransportationDetails(byType.get('transportation')!).then((details) => {
          for (const [id, d] of details) detailsMap.set(id, d)
        })
      )
    }

    if (byType.has('dining')) {
      fetchPromises.push(
        this.fetchDiningDetails(byType.get('dining')!).then((details) => {
          for (const [id, d] of details) detailsMap.set(id, d)
        })
      )
    }

    if (byType.has('port_info')) {
      fetchPromises.push(
        this.fetchPortInfoDetails(byType.get('port_info')!).then((details) => {
          for (const [id, d] of details) detailsMap.set(id, d)
        })
      )
    }

    if (byType.has('options')) {
      fetchPromises.push(
        this.fetchOptionsDetails(byType.get('options')!).then((details) => {
          for (const [id, d] of details) detailsMap.set(id, d)
        })
      )
    }

    if (byType.has('custom_cruise')) {
      fetchPromises.push(
        this.fetchCustomCruiseDetails(byType.get('custom_cruise')!).then((details) => {
          for (const [id, d] of details) detailsMap.set(id, d)
        })
      )
    }

    await Promise.all(fetchPromises)
    return detailsMap
  }

  // ==========================================================================
  // Type-Specific Detail Fetchers
  // ==========================================================================

  private async fetchFlightDetails(activityIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const records = await this.db.client
      .select()
      .from(this.db.schema.flightDetails)
      .where(inArray(this.db.schema.flightDetails.activityId, activityIds))

    const map = new Map<string, Record<string, unknown>>()
    for (const r of records) {
      const { id, activityId, createdAt, updatedAt, ...details } = r as any
      map.set(activityId, details)
    }
    return map
  }

  private async fetchLodgingDetails(activityIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const records = await this.db.client
      .select()
      .from(this.db.schema.lodgingDetails)
      .where(inArray(this.db.schema.lodgingDetails.activityId, activityIds))

    const map = new Map<string, Record<string, unknown>>()
    for (const r of records) {
      const { id, activityId, createdAt, updatedAt, ...details } = r as any
      map.set(activityId, details)
    }
    return map
  }

  private async fetchTransportationDetails(activityIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const records = await this.db.client
      .select()
      .from(this.db.schema.transportationDetails)
      .where(inArray(this.db.schema.transportationDetails.activityId, activityIds))

    const map = new Map<string, Record<string, unknown>>()
    for (const r of records) {
      const { id, activityId, createdAt, updatedAt, ...details } = r as any
      map.set(activityId, details)
    }
    return map
  }

  private async fetchDiningDetails(activityIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const records = await this.db.client
      .select()
      .from(this.db.schema.diningDetails)
      .where(inArray(this.db.schema.diningDetails.activityId, activityIds))

    const map = new Map<string, Record<string, unknown>>()
    for (const r of records) {
      const { id, activityId, createdAt, updatedAt, ...details } = r as any
      map.set(activityId, details)
    }
    return map
  }

  private async fetchPortInfoDetails(activityIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const records = await this.db.client
      .select()
      .from(this.db.schema.portInfoDetails)
      .where(inArray(this.db.schema.portInfoDetails.activityId, activityIds))

    const map = new Map<string, Record<string, unknown>>()
    for (const r of records) {
      const { id, activityId, createdAt, updatedAt, ...details } = r as any
      map.set(activityId, details)
    }
    return map
  }

  private async fetchOptionsDetails(activityIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const records = await this.db.client
      .select()
      .from(this.db.schema.optionsDetails)
      .where(inArray(this.db.schema.optionsDetails.activityId, activityIds))

    const map = new Map<string, Record<string, unknown>>()
    for (const r of records) {
      const { id, activityId, createdAt, updatedAt, ...details } = r as any
      map.set(activityId, details)
    }
    return map
  }

  private async fetchCustomCruiseDetails(activityIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const records = await this.db.client
      .select()
      .from(this.db.schema.customCruiseDetails)
      .where(inArray(this.db.schema.customCruiseDetails.activityId, activityIds))

    const map = new Map<string, Record<string, unknown>>()
    for (const r of records) {
      const { id, activityId, createdAt, updatedAt, ...details } = r as any
      map.set(activityId, details)
    }
    return map
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Extract HH:MM time from a Date or timestamp.
   * Returns null if no datetime provided.
   */
  private extractTime(datetime: Date | null | undefined): string | null {
    if (!datetime) return null
    const date = datetime instanceof Date ? datetime : new Date(datetime)
    if (isNaN(date.getTime())) return null

    const hours = String(date.getUTCHours()).padStart(2, '0')
    const minutes = String(date.getUTCMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  }

  /**
   * Calculate the day offset between two dates.
   */
  private calculateDayOffset(anchor: Date, target: Date): number {
    const anchorMs = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
    const targetMs = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
    return Math.round((targetMs - anchorMs) / (1000 * 60 * 60 * 24))
  }
}

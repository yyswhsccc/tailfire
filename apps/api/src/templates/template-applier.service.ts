/**
 * Template Applier Service
 *
 * Applies itinerary and package templates to create new structures.
 * Uses existing services to maintain consistency with side effects.
 *
 * Key responsibilities:
 * - Apply itinerary template: Create itinerary with days and activities
 * - Apply package template: Create package with activities across days
 * - Construct datetimes from day anchor + HH:MM time
 */

import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { parseISO, addDays, format, isValid } from 'date-fns'
import { ItinerariesService } from '../trips/itineraries.service'
import { ItineraryDaysService } from '../trips/itinerary-days.service'
import { ComponentOrchestrationService } from '../trips/component-orchestration.service'
import { BaseComponentService } from '../trips/base-component.service'
import { ActivitiesService } from '../trips/activities.service'
import { TripsService } from '../trips/trips.service'
import { ItineraryTemplatesService } from './itinerary-templates.service'
import { PackageTemplatesService } from './package-templates.service'
import type {
  ApplyItineraryTemplateDto,
  ApplyPackageTemplateDto,
  TemplateActivity,
  ActivityType,
} from '@tailfire/shared-types'

// Activity types with specific orchestration handlers
const ORCHESTRATED_TYPES = new Set<ActivityType>([
  'flight',
  'lodging',
  'transportation',
  'dining',
  'port_info',
  'options',
  'custom_cruise',
])

// Activity types without specific handlers (use base service)
const BASE_TYPES = new Set<ActivityType>(['tour', 'cruise'])

@Injectable()
export class TemplateApplierService {
  private readonly logger = new Logger(TemplateApplierService.name)

  constructor(
    private readonly itineraryTemplatesService: ItineraryTemplatesService,
    private readonly packageTemplatesService: PackageTemplatesService,
    private readonly itinerariesService: ItinerariesService,
    private readonly itineraryDaysService: ItineraryDaysService,
    private readonly orchestrationService: ComponentOrchestrationService,
    private readonly baseComponentService: BaseComponentService,
    private readonly activitiesService: ActivitiesService,
    private readonly tripsService: TripsService
  ) {}

  /**
   * Apply an itinerary template to create a new itinerary on a trip.
   *
   * @param tripId - Trip to add itinerary to
   * @param templateId - Itinerary template to apply
   * @param agencyId - Agency context for authorization
   * @param dto - Optional anchor day (defaults to trip start date)
   * @returns Created itinerary ID
   */
  async applyItineraryTemplate(
    tripId: string,
    templateId: string,
    agencyId: string,
    dto: ApplyItineraryTemplateDto
  ): Promise<{ itineraryId: string }> {
    // 1. Get the template
    const template = await this.itineraryTemplatesService.findByIdOrThrow(templateId, agencyId)

    // 2. Get the trip to determine anchor date
    const trip = await this.tripsService.findOne(tripId)
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`)
    }

    // Determine anchor date: use provided date or trip start date
    // If neither exists or invalid, we'll create days with TBD (null) dates
    const anchorDateStr = dto.anchorDay || trip.startDate
    let anchorDate: Date | null = null
    if (anchorDateStr) {
      const parsed = parseISO(anchorDateStr)
      anchorDate = isValid(parsed) ? parsed : null
    }

    this.logger.log(
      `Applying itinerary template ${templateId} to trip ${tripId}` +
      (anchorDate ? ` with anchor ${anchorDateStr}` : ' with TBD dates')
    )

    // 3. Create the itinerary
    const itinerary = await this.itinerariesService.create(tripId, {
      name: template.name,
      description: template.description ?? undefined,
      status: 'draft',
    })

    // 4. Create days and activities from template payload
    const payload = template.payload
    if (!payload?.dayOffsets) {
      this.logger.warn(`Template ${templateId} has no day offsets`)
      return { itineraryId: itinerary.id }
    }

    // Sort by dayIndex and dedupe to avoid duplicate day creation
    const sortedDayOffsets = [...payload.dayOffsets].sort((a, b) => a.dayIndex - b.dayIndex)
    const seenDayIndices = new Set<number>()

    for (const dayOffset of sortedDayOffsets) {
      // Skip duplicate dayIndex values
      if (seenDayIndices.has(dayOffset.dayIndex)) {
        this.logger.warn(`Skipping duplicate dayIndex ${dayOffset.dayIndex} in template ${templateId}`)
        continue
      }
      seenDayIndices.add(dayOffset.dayIndex)
      let day: { id: string }
      let dayDate: Date | null = null

      if (anchorDate) {
        // Calculate the date for this day from anchor
        dayDate = addDays(anchorDate, dayOffset.dayIndex)
        const dayDateStr = format(dayDate, 'yyyy-MM-dd')

        // Create or find day via ItineraryDaysService
        day = await this.itineraryDaysService.findOrCreateByDate(itinerary.id, dayDateStr)
      } else {
        // No dates - create day with TBD (null) date using dayNumber ordering
        const dayNumber = dayOffset.dayIndex + 1
        day = await this.itineraryDaysService.create({
          itineraryId: itinerary.id,
          dayNumber,
          date: null,
          title: `Day ${dayNumber}`,
        })
      }

      // Create activities for this day
      for (const activity of dayOffset.activities || []) {
        await this.createActivityFromTemplate(activity, day.id, dayDate, agencyId)
      }
    }

    this.logger.log(`Successfully created itinerary ${itinerary.id} from template ${templateId}`)
    return { itineraryId: itinerary.id }
  }

  /**
   * Apply a raw payload directly to an existing itinerary (no template lookup).
   * Used by ItineraryCloneService for duplication.
   */
  async applyPayloadToItinerary(
    itineraryId: string,
    _tripId: string,
    payload: { dayOffsets: Array<{ dayIndex: number; activities: TemplateActivity[] }> },
    anchorDateStr: string | null,
    agencyId: string,
  ): Promise<void> {
    let anchorDate: Date | null = null
    if (anchorDateStr) {
      const parsed = parseISO(anchorDateStr)
      anchorDate = isValid(parsed) ? parsed : null
    }

    if (!payload?.dayOffsets) return

    const sortedDayOffsets = [...payload.dayOffsets].sort((a, b) => a.dayIndex - b.dayIndex)
    const seenDayIndices = new Set<number>()

    for (const dayOffset of sortedDayOffsets) {
      if (seenDayIndices.has(dayOffset.dayIndex)) continue
      seenDayIndices.add(dayOffset.dayIndex)
      let day: { id: string }
      let dayDate: Date | null = null

      if (anchorDate) {
        dayDate = addDays(anchorDate, dayOffset.dayIndex)
        const dayDateStr = format(dayDate, 'yyyy-MM-dd')
        day = await this.itineraryDaysService.findOrCreateByDate(itineraryId, dayDateStr)
      } else {
        const dayNumber = dayOffset.dayIndex + 1
        day = await this.itineraryDaysService.create({
          itineraryId,
          dayNumber,
          date: null,
          title: `Day ${dayNumber}`,
        })
      }

      for (const activity of dayOffset.activities || []) {
        await this.createActivityFromTemplate(activity, day.id, dayDate, agencyId)
      }
    }
  }

  /**
   * Apply a package template to an existing itinerary.
   * Creates a package and inserts activities across days from anchor.
   *
   * @param itineraryId - Itinerary to add package to
   * @param templateId - Package template to apply
   * @param agencyId - Agency context for authorization
   * @param dto - Anchor day ID to start from
   * @returns Created package ID
   */
  async applyPackageTemplate(
    itineraryId: string,
    templateId: string,
    agencyId: string,
    dto: ApplyPackageTemplateDto
  ): Promise<{ packageId: string }> {
    // 1. Get the template
    const template = await this.packageTemplatesService.findByIdOrThrow(templateId, agencyId)

    // 2. Get the anchor day
    const anchorDay = await this.itineraryDaysService.findOne(dto.anchorDayId)

    // Parse anchor date if available and valid
    let anchorDate: Date | null = null
    if (anchorDay.date) {
      const parsed = parseISO(anchorDay.date)
      anchorDate = isValid(parsed) ? parsed : null
    }

    // 3. Get the itinerary to find tripId for package creation
    const itinerary = await this.itinerariesService.findOne(itineraryId)
    if (!itinerary) {
      throw new NotFoundException(`Itinerary ${itineraryId} not found`)
    }

    const payload = template.payload
    if (!payload?.dayOffsets || !payload?.packageMetadata) {
      throw new NotFoundException('Template payload is incomplete')
    }

    // Sort by dayIndex and dedupe
    const sortedDayOffsets = [...payload.dayOffsets].sort((a, b) => a.dayIndex - b.dayIndex)

    this.logger.log(
      `Applying package template ${templateId} to itinerary ${itineraryId} with anchor day ${dto.anchorDayId}` +
      (anchorDate ? '' : ' (TBD dates)')
    )

    // 4. Ensure days exist (auto-extend)
    const maxDayIndex = Math.max(...sortedDayOffsets.map((d) => d.dayIndex), 0)

    if (anchorDate) {
      // Date-based: calculate dates from anchor and bulk create
      const datesToCreate: string[] = []
      for (let i = 0; i <= maxDayIndex; i++) {
        const dayDate = addDays(anchorDate, i)
        datesToCreate.push(format(dayDate, 'yyyy-MM-dd'))
      }
      await this.itineraryDaysService.findOrCreateByDateRange(itineraryId, datesToCreate)
    } else {
      // TBD days: create by dayNumber if they don't exist
      // Get existing days to determine max dayNumber
      const existingDays = await this.itineraryDaysService.findAll(itineraryId)
      const anchorDayNumber = anchorDay.dayNumber

      for (let i = 1; i <= maxDayIndex; i++) {
        const targetDayNumber = anchorDayNumber + i
        const existsDay = existingDays.find((d) => d.dayNumber === targetDayNumber)
        if (!existsDay) {
          await this.itineraryDaysService.create({
            itineraryId,
            dayNumber: targetDayNumber,
            date: null,
            title: `Day ${targetDayNumber}`,
          })
        }
      }
    }

    // 5. Create the package as a package activity
    const { packageMetadata } = payload
    // Packages can be floating (null dayId) or anchored to the first day
    const pkgActivity = await this.activitiesService.create({
      itineraryDayId: dto.anchorDayId, // Anchor to the starting day
      activityType: 'package',
      name: packageMetadata.name,
      proposalStatus: 'draft',
      currency: packageMetadata.currency ?? 'CAD',
      pricingType: packageMetadata.pricingType ?? 'flat_rate',
    })
    const pkg = { id: pkgActivity.id }

    // 6. Create activities linked to the package
    const seenDayIndices = new Set<number>()

    for (const dayOffset of sortedDayOffsets) {
      // Skip duplicate dayIndex values
      if (seenDayIndices.has(dayOffset.dayIndex)) {
        this.logger.warn(`Skipping duplicate dayIndex ${dayOffset.dayIndex} in package template ${templateId}`)
        continue
      }
      seenDayIndices.add(dayOffset.dayIndex)

      let targetDay: { id: string }
      let targetDate: Date | null = null

      if (anchorDate) {
        // Date-based: find day by calculated date
        targetDate = addDays(anchorDate, dayOffset.dayIndex)
        const targetDateStr = format(targetDate, 'yyyy-MM-dd')
        targetDay = await this.itineraryDaysService.findOrCreateByDate(itineraryId, targetDateStr)
      } else {
        // TBD: find day by dayNumber
        const targetDayNumber = anchorDay.dayNumber + dayOffset.dayIndex
        const allDays = await this.itineraryDaysService.findAll(itineraryId)
        const foundDay = allDays.find((d) => d.dayNumber === targetDayNumber)
        if (!foundDay) {
          throw new NotFoundException(`Day with dayNumber ${targetDayNumber} not found`)
        }
        targetDay = foundDay
      }

      for (const activity of dayOffset.activities || []) {
        await this.createActivityFromTemplate(activity, targetDay.id, targetDate, agencyId, pkg.id)
      }
    }

    this.logger.log(`Successfully created package ${pkg.id} from template ${templateId}`)
    return { packageId: pkg.id }
  }

  /**
   * Create an activity from a template activity definition.
   * Routes to appropriate orchestration method based on activity type.
   */
  private async createActivityFromTemplate(
    activity: TemplateActivity,
    dayId: string,
    dayDate: Date | null,
    agencyId: string,
    parentActivityId?: string
  ): Promise<string> {
    const { componentType, activityType } = activity

    // Build datetime strings from anchor date + HH:MM time
    // If dayDate is null (TBD), set datetimes to null but keep timezone as-is
    const startDatetime = dayDate && activity.startTime
      ? this.constructDatetime(dayDate, activity.startTime)
      : null
    const endDatetime = dayDate && activity.endTime
      ? this.constructDatetime(dayDate, activity.endTime)
      : null

    // Common base data for all activity types
    const baseData = {
      itineraryDayId: dayId,
      parentActivityId,
      name: activity.name,
      sequenceOrder: activity.sequenceOrder,
      proposalStatus: 'draft' as const, // Default proposal status on apply
      startDatetime,
      endDatetime,
      timezone: activity.timezone,
      location: activity.location,
      address: activity.address,
      coordinates: activity.coordinates,
      notes: activity.notes,
      confirmationNumber: activity.confirmationNumber,
      // Pricing fields (if provided)
      ...(activity.pricing && {
        totalPriceCents: activity.pricing.totalPriceCents,
        currency: activity.pricing.currency,
        taxesAndFeesCents: activity.pricing.taxesCents,
        commissionTotalCents: activity.pricing.commissionAmountCents,
        commissionSplitPercentage: activity.pricing.commissionSplitPercent,
      }),
    }

    // Route to appropriate creation method based on type
    if (ORCHESTRATED_TYPES.has(componentType)) {
      return this.createOrchestratedActivity(componentType, baseData, activity.details)
    } else if (BASE_TYPES.has(componentType)) {
      return this.createBaseActivity(componentType, activityType, baseData, agencyId)
    } else {
      // Unknown type - log warning and use base service
      this.logger.warn(`Unknown activity type ${componentType}, using base service`)
      return this.createBaseActivity(componentType, activityType, baseData, agencyId)
    }
  }

  /**
   * Create activity via ComponentOrchestrationService for types with specific handlers.
   */
  private async createOrchestratedActivity(
    componentType: ActivityType,
    baseData: Record<string, unknown>,
    details?: Record<string, unknown>
  ): Promise<string> {
    switch (componentType) {
      case 'flight': {
        const result = await this.orchestrationService.createFlight({
          ...baseData,
          flightDetails: details as any,
        } as any)
        return result.id
      }
      case 'lodging': {
        const result = await this.orchestrationService.createLodging({
          ...baseData,
          lodgingDetails: details as any,
        } as any)
        return result.id
      }
      case 'transportation': {
        const result = await this.orchestrationService.createTransportation({
          ...baseData,
          transportationDetails: details as any,
        } as any)
        return result.id
      }
      case 'dining': {
        const result = await this.orchestrationService.createDining({
          ...baseData,
          diningDetails: details as any,
        } as any)
        return result.id
      }
      case 'port_info': {
        const result = await this.orchestrationService.createPortInfo({
          ...baseData,
          portInfoDetails: details as any,
        } as any)
        return result.id
      }
      case 'options': {
        const result = await this.orchestrationService.createOptions({
          ...baseData,
          optionsDetails: details as any,
        } as any)
        return result.id
      }
      case 'custom_cruise': {
        const result = await this.orchestrationService.createCustomCruise({
          ...baseData,
          customCruiseDetails: details as any,
        } as any)
        return result.id
      }
      default:
        throw new Error(`Unhandled orchestrated type: ${componentType}`)
    }
  }

  /**
   * Create activity via BaseComponentService for types without specific handlers.
   */
  private async createBaseActivity(
    componentType: ActivityType,
    activityType: ActivityType,
    baseData: Record<string, unknown>,
    agencyId: string
  ): Promise<string> {
    const activityId = await this.baseComponentService.create({
      agencyId,
      itineraryDayId: baseData.itineraryDayId as string,
      parentActivityId: baseData.parentActivityId as string | undefined,
      componentType,
      activityType,
      name: baseData.name as string,
      description: baseData.notes as string | undefined,
      sequenceOrder: baseData.sequenceOrder as number | undefined,
      startDatetime: baseData.startDatetime as string | undefined,
      endDatetime: baseData.endDatetime as string | undefined,
      timezone: baseData.timezone as string | undefined,
      location: baseData.location as string | undefined,
      address: baseData.address as string | undefined,
      coordinates: baseData.coordinates as any,
      notes: baseData.notes as string | undefined,
      confirmationNumber: baseData.confirmationNumber as string | undefined,
      status: baseData.status as string | undefined,
      currency: baseData.currency as string | undefined,
    })

    return activityId
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Construct a local ISO datetime string from a date and HH:MM time.
   * Returns format: "2024-03-15T09:30:00" (no Z suffix, no offset)
   * This is then parsed by validateDatetime() in base-component.service.ts
   */
  private constructDatetime(date: Date, time: string): string {
    // Use date-fns format to get YYYY-MM-DD, then append the time
    const dateStr = format(date, 'yyyy-MM-dd')
    return `${dateStr}T${time}:00`
  }
}

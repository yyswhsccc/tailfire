/**
 * Component Orchestration Service
 *
 * Coordinates transactional operations between base component and type-specific detail services.
 * Ensures atomic create/update/delete operations across base + detail tables.
 */

import { Injectable, BadRequestException, Logger } from '@nestjs/common'
import { tourItineraryDays } from '@tailfire/database'
import { asc } from 'drizzle-orm'
import * as Sentry from '@sentry/nestjs'

// Valid transportation subtypes
const VALID_TRANSPORTATION_SUBTYPES = [
  'transfer', 'car_rental', 'private_car', 'taxi',
  'shuttle', 'train', 'ferry', 'bus', 'limousine'
] as const

// Common IANA timezones for validation (subset - full list would be from a library)
const isValidTimezone = (tz: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}
import { eq, and, or, isNull } from 'drizzle-orm'
import { BaseComponentService } from './base-component.service'
import { FlightDetailsService } from './flight-details.service'
import { FlightSegmentsService } from './flight-segments.service'
import { LodgingDetailsService } from './lodging-details.service'
import { TransportationDetailsService } from './transportation-details.service'
import { DiningDetailsService } from './dining-details.service'
import { PortInfoDetailsService } from './port-info-details.service'
import { OptionsDetailsService } from './options-details.service'
import { CustomCruiseDetailsService } from './custom-cruise-details.service'
import { CustomTourDetailsService } from './custom-tour-details.service'
import { TourDayDetailsService } from './tour-day-details.service'
import { StorageService } from './storage.service'
import { DatabaseService } from '../db/database.service'
import { ItineraryDaysService } from './itinerary-days.service'
import { ActivitiesService } from './activities.service'
import { DayLocationService } from './day-location.service'
import type {
  CreateFlightComponentDto,
  FlightComponentDto,
  UpdateFlightComponentDto,
  CreateLodgingComponentDto,
  LodgingComponentDto,
  UpdateLodgingComponentDto,
  CreateTransportationComponentDto,
  TransportationComponentDto,
  UpdateTransportationComponentDto,
  CreateDiningComponentDto,
  DiningComponentDto,
  UpdateDiningComponentDto,
  CreatePortInfoComponentDto,
  PortInfoComponentDto,
  UpdatePortInfoComponentDto,
  CreateOptionsComponentDto,
  OptionsComponentDto,
  UpdateOptionsComponentDto,
  CreateCustomCruiseComponentDto,
  CustomCruiseComponentDto,
  UpdateCustomCruiseComponentDto,
  CreateCustomTourComponentDto,
  CustomTourComponentDto,
  UpdateCustomTourComponentDto,
  CreateTourDayComponentDto,
  TourDayComponentDto,
  UpdateTourDayComponentDto,
  PortType,
} from '@tailfire/shared-types'

@Injectable()
export class ComponentOrchestrationService {
  private readonly logger = new Logger(ComponentOrchestrationService.name)

  constructor(
    private readonly baseService: BaseComponentService,
    private readonly flightDetailsService: FlightDetailsService,
    private readonly flightSegmentsService: FlightSegmentsService,
    private readonly lodgingDetailsService: LodgingDetailsService,
    private readonly transportationDetailsService: TransportationDetailsService,
    private readonly diningDetailsService: DiningDetailsService,
    private readonly portInfoDetailsService: PortInfoDetailsService,
    private readonly optionsDetailsService: OptionsDetailsService,
    private readonly customCruiseDetailsService: CustomCruiseDetailsService,
    private readonly customTourDetailsService: CustomTourDetailsService,
    private readonly tourDayDetailsService: TourDayDetailsService,
    private readonly storageService: StorageService,
    private readonly db: DatabaseService,
    private readonly itineraryDaysService: ItineraryDaysService,
    private readonly activitiesService: ActivitiesService,
    private readonly dayLocationService: DayLocationService
  ) {}

  /**
   * Get agencyId for an activity (needed for RLS on pricing inserts)
   */
  private async getActivityAgencyId(activityId: string): Promise<string> {
    const [activity] = await this.db.client
      .select({ agencyId: this.db.schema.itineraryActivities.agencyId })
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, activityId))
      .limit(1)
    if (!activity?.agencyId) {
      throw new BadRequestException(`Activity ${activityId} not found or has no agency`)
    }
    return activity.agencyId
  }

  /**
   * Mark the parent itinerary as having unpublished changes after detail updates.
   */
  private async markItineraryChangedForActivity(activityId: string): Promise<void> {
    const [activity] = await this.db.client
      .select({ itineraryDayId: this.db.schema.itineraryActivities.itineraryDayId })
      .from(this.db.schema.itineraryActivities)
      .where(eq(this.db.schema.itineraryActivities.id, activityId))
      .limit(1)
    if (!activity?.itineraryDayId) return
    const [day] = await this.db.client
      .select({ itineraryId: this.db.schema.itineraryDays.itineraryId })
      .from(this.db.schema.itineraryDays)
      .where(eq(this.db.schema.itineraryDays.id, activity.itineraryDayId))
      .limit(1)
    if (day) {
      await this.db.client
        .update(this.db.schema.itineraries)
        .set({ hasUnpublishedChanges: true })
        .where(eq(this.db.schema.itineraries.id, day.itineraryId))
    }
  }

  /**
   * Get agencyId from itinerary day (needed for RLS on activity creates)
   */
  private async getAgencyIdFromDayId(dayId: string | null | undefined): Promise<string> {
    if (!dayId) {
      throw new BadRequestException('itineraryDayId is required to determine agency')
    }
    const [day] = await this.db.client
      .select({ agencyId: this.db.schema.itineraryDays.agencyId })
      .from(this.db.schema.itineraryDays)
      .where(eq(this.db.schema.itineraryDays.id, dayId))
      .limit(1)
    if (!day?.agencyId) {
      throw new BadRequestException(`Itinerary day ${dayId} not found or has no agency`)
    }
    return day.agencyId
  }

  /**
   * Get itineraryId from a dayId
   */
  private async getItineraryIdFromDayId(dayId: string): Promise<string | null> {
    const [day] = await this.db.client
      .select({ itineraryId: this.db.schema.itineraryDays.itineraryId })
      .from(this.db.schema.itineraryDays)
      .where(eq(this.db.schema.itineraryDays.id, dayId))
      .limit(1)
    return day?.itineraryId ?? null
  }

  /**
   * Non-blocking cascade of day location recalculation after activity save.
   * Failures are captured to Sentry but do not block the activity save.
   */
  private async cascadeDayLocations(
    activityId: string,
    dayId: string,
    itineraryId: string
  ): Promise<void> {
    try {
      await this.dayLocationService.recalculateFromDay(itineraryId, dayId)
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'day-location', trigger: 'activity-save' },
        extra: { activityId, dayId, itineraryId },
      })
    }
  }

  /**
   * Look up dayId and itineraryId for an existing activity, then cascade.
   * Used by update methods that only have the activity id.
   */
  private async cascadeDayLocationsForActivity(activityId: string): Promise<void> {
    try {
      const [activity] = await this.db.client
        .select({ itineraryDayId: this.db.schema.itineraryActivities.itineraryDayId })
        .from(this.db.schema.itineraryActivities)
        .where(eq(this.db.schema.itineraryActivities.id, activityId))
        .limit(1)
      if (!activity?.itineraryDayId) return
      const itineraryId = await this.getItineraryIdFromDayId(activity.itineraryDayId)
      if (!itineraryId) return
      await this.dayLocationService.recalculateFromDay(itineraryId, activity.itineraryDayId)
    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'day-location', trigger: 'activity-save' },
        extra: { activityId },
      })
    }
  }

  /**
   * Clean up storage files for a component before deletion
   * This prevents orphaned files in Supabase Storage when components are deleted
   */
  private async cleanupComponentStorage(activityId: string): Promise<void> {
    if (!this.storageService.isAvailable()) {
      return // Storage not configured, skip cleanup
    }

    try {
      // Delete all files in the component's storage folder
      await this.storageService.deleteComponentDocuments(activityId)
    } catch (error) {
      // Log but don't fail - database cleanup should still proceed
      console.error(`Failed to cleanup storage for component ${activityId}:`, error)
    }
  }

  /**
   * Normalize time to HH:MM:SS format, handling both HH:MM and HH:MM:SS inputs.
   */
  private normalizeTime(time?: string | null): string {
    if (!time) return '12:00:00'
    const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (!match) return '12:00:00'
    const hh = match[1]!.padStart(2, '0')
    const mm = match[2]!
    const ss = match[3] ?? '00'
    return `${hh}:${mm}:${ss}`
  }

  /**
   * Compute startDatetime/endDatetime from lodgingDetails if not provided.
   * Fallback for older frontend versions that don't send these fields.
   */
  private computeLodgingDatetimes(dto: CreateLodgingComponentDto | UpdateLodgingComponentDto) {
    let startDatetime = dto.startDatetime
    let endDatetime = dto.endDatetime

    if (!startDatetime && dto.lodgingDetails?.checkInDate) {
      const time = this.normalizeTime(dto.lodgingDetails.checkInTime)
      startDatetime = `${dto.lodgingDetails.checkInDate}T${time}`
    }
    if (!endDatetime && dto.lodgingDetails?.checkOutDate) {
      const time = this.normalizeTime(dto.lodgingDetails.checkOutTime)
      endDatetime = `${dto.lodgingDetails.checkOutDate}T${time}`
    }

    return { startDatetime, endDatetime }
  }

  /**
   * Create a flight component with details (transactional)
   */
  async createFlight(dto: CreateFlightComponentDto): Promise<FlightComponentDto> {
    // Get agencyId from itinerary day for RLS
    const agencyId = await this.getAgencyIdFromDayId(dto.itineraryDayId)

    // Create base component
    const activityId = await this.baseService.create({
      agencyId,
      itineraryDayId: dto.itineraryDayId,
      componentType: 'flight',
      activityType: 'flight',
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    })

    // Create flight details if provided
    if (dto.flightDetails) {
      await this.flightDetailsService.create(activityId, dto.flightDetails)

      // Create flight segments if provided in flightDetails.segments
      if (dto.flightDetails.segments && dto.flightDetails.segments.length > 0) {
        await this.flightSegmentsService.createMany(activityId, dto.flightDetails.segments)
      }
    }

    // Update activity_pricing if pricing fields are provided
    // Note: BaseComponentService.create() auto-creates an activity_pricing record, so we update it
    const hasPricingData = dto.totalPriceCents !== undefined || dto.termsAndConditions ||
      dto.cancellationPolicy || dto.supplier || dto.commissionTotalCents !== undefined ||
      dto.bookingReference !== undefined || dto.pricingBreakdownJson !== undefined

    if (hasPricingData) {
      await this.db.client
        .update(this.db.schema.activityPricing)
        .set({
          pricingType: dto.pricingType || 'per_person',
          ...(dto.totalPriceCents !== undefined && dto.totalPriceCents !== null && {
            basePrice: (dto.totalPriceCents / 100).toFixed(2),
            totalPriceCents: dto.totalPriceCents,
          }),
          taxesAndFeesCents: dto.taxesAndFeesCents ?? null,
          currency: dto.currency || 'CAD',
          // Commission fields (expected values)
          commissionTotalCents: dto.commissionTotalCents ?? null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() ?? null,
          commissionExpectedDate: dto.commissionExpectedDate ?? null,
          // Booking details
          termsAndConditions: dto.termsAndConditions ?? null,
          cancellationPolicy: dto.cancellationPolicy ?? null,
          supplier: dto.supplier ?? null,
          bookingReference: dto.bookingReference ?? null,
          ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.activityPricing.activityId, activityId))
    }

    await this.markItineraryChangedForActivity(activityId)

    // Cascade day location recalculation (non-fatal — failures logged to Sentry)
    if (dto.itineraryDayId) {
      const itineraryId = await this.getItineraryIdFromDayId(dto.itineraryDayId)
      if (itineraryId) {
        await this.cascadeDayLocations(activityId, dto.itineraryDayId, itineraryId)
      }
    }

    // Return the complete flight component
    return this.getFlight(activityId)
  }

  /**
   * Get a flight component with details
   *
   * Multi-segment support:
   * - Fetches segments from flight_segments table
   * - For backwards compatibility, populates legacy fields from first segment
   * - Returns segments[] array in flightDetails
   */
  async getFlight(id: string): Promise<FlightComponentDto> {
    const baseComponent = await this.baseService.findById(id)
    const flightDetails = await this.flightDetailsService.findByComponentId(id)

    // Fetch flight segments (multi-segment support)
    const segments = await this.flightSegmentsService.findByActivityId(id)

    // Fetch component_pricing if it exists
    const [activityPricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.activityId, id))
      .limit(1)

    // Build flightDetails with segments
    // For backwards compatibility: if segments exist, use first segment for legacy fields
    let mergedFlightDetails = flightDetails || undefined
    if (segments.length > 0) {
      const firstSegment = segments[0]!
      const lastSegment = segments[segments.length - 1]!
      mergedFlightDetails = {
        // Legacy fields populated from first segment (for backwards compatibility)
        airline: firstSegment.airline || flightDetails?.airline || null,
        flightNumber: firstSegment.flightNumber || flightDetails?.flightNumber || null,
        departureAirportCode: firstSegment.departureAirportCode || flightDetails?.departureAirportCode || null,
        departureDate: firstSegment.departureDate || flightDetails?.departureDate || null,
        departureTime: firstSegment.departureTime || flightDetails?.departureTime || null,
        departureTimezone: firstSegment.departureTimezone || flightDetails?.departureTimezone || null,
        departureTerminal: firstSegment.departureTerminal || flightDetails?.departureTerminal || null,
        departureGate: firstSegment.departureGate || flightDetails?.departureGate || null,
        // Arrival fields from last segment (for multi-segment journeys)
        arrivalAirportCode: lastSegment.arrivalAirportCode || flightDetails?.arrivalAirportCode || null,
        arrivalDate: lastSegment.arrivalDate || flightDetails?.arrivalDate || null,
        arrivalTime: lastSegment.arrivalTime || flightDetails?.arrivalTime || null,
        arrivalTimezone: lastSegment.arrivalTimezone || flightDetails?.arrivalTimezone || null,
        arrivalTerminal: lastSegment.arrivalTerminal || flightDetails?.arrivalTerminal || null,
        arrivalGate: lastSegment.arrivalGate || flightDetails?.arrivalGate || null,
        // Multi-segment data
        segments,
      }
    } else if (flightDetails) {
      // No segments - keep legacy flightDetails as-is with empty segments array
      mergedFlightDetails = {
        ...flightDetails,
        segments: [],
      }
    }

    return {
      id: baseComponent.id,
      itineraryDayId: baseComponent.itineraryDayId,
      parentActivityId: baseComponent.parentActivityId || null,
      componentType: 'flight',
      activityType: 'flight',
      name: baseComponent.name,
      description: baseComponent.description || null,
      sequenceOrder: baseComponent.sequenceOrder,
      startDatetime: baseComponent.startDatetime?.toISOString() || null,
      endDatetime: baseComponent.endDatetime?.toISOString() || null,
      timezone: baseComponent.timezone || null,
      location: baseComponent.location || null,
      address: baseComponent.address || null,
      coordinates: baseComponent.coordinates || null,
      notes: baseComponent.notes || null,
      confirmationNumber: baseComponent.confirmationNumber || null,
      status: baseComponent.status,
      pricingType: baseComponent.pricingType || null,
      currency: baseComponent.currency,
      invoiceType: activityPricing?.invoiceType || null,
      totalPriceCents: activityPricing?.totalPriceCents || null,
      taxesAndFeesCents: activityPricing?.taxesAndFeesCents || null,
      activityPricingId: activityPricing?.id || null,
      // Commission fields (expected values)
      commissionTotalCents: activityPricing?.commissionTotalCents || null,
      commissionSplitPercentage: activityPricing?.commissionSplitPercentage || null,
      commissionExpectedDate: activityPricing?.commissionExpectedDate || null,
      // Booking details
      termsAndConditions: activityPricing?.termsAndConditions || null,
      cancellationPolicy: activityPricing?.cancellationPolicy || null,
      supplier: activityPricing?.supplier || null,
      bookingReference: activityPricing?.bookingReference || null,
      netPriceCents: activityPricing?.netPriceCents ?? null,
      nonRefundableDeposit: activityPricing?.nonRefundableDeposit ?? null,
      cancellationScheduleJson: activityPricing?.cancellationScheduleJson as any[] || null,
      pricingBreakdownJson: activityPricing?.pricingBreakdownJson as any[] || null,
      photos: baseComponent.photos || null,
      createdAt: baseComponent.createdAt.toISOString(),
      updatedAt: baseComponent.updatedAt.toISOString(),
      flightDetails: mergedFlightDetails,
    }
  }

  /**
   * Update a flight component with details (transactional)
   *
   * Multi-segment support:
   * - If segments[] is provided in flightDetails, replaces all existing segments
   * - Delete + insert strategy ensures clean state
   */
  async updateFlight(id: string, dto: UpdateFlightComponentDto): Promise<FlightComponentDto> {
    // Update base component fields
    await this.baseService.update(id, {
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    })

    // Update flight details if provided
    if (dto.flightDetails) {
      const existingDetails = await this.flightDetailsService.findByComponentId(id)
      if (existingDetails) {
        await this.flightDetailsService.update(id, dto.flightDetails)
      } else {
        await this.flightDetailsService.create(id, dto.flightDetails)
      }

      // Update flight segments if provided (replace all)
      if (dto.flightDetails.segments !== undefined) {
        await this.flightSegmentsService.updateMany(id, dto.flightDetails.segments || [])
      }
    }

    // Update or create component_pricing if pricing or booking detail fields are provided
    const hasPricingUpdate = dto.totalPriceCents !== undefined ||
      dto.termsAndConditions !== undefined ||
      dto.cancellationPolicy !== undefined ||
      dto.supplier !== undefined ||
      dto.bookingReference !== undefined ||
      dto.pricingBreakdownJson !== undefined

    if (hasPricingUpdate) {
      const [existingPricing] = await this.db.client
        .select()
        .from(this.db.schema.activityPricing)
        .where(eq(this.db.schema.activityPricing.activityId, id))
        .limit(1)

      if (existingPricing) {
        // Update existing pricing - .returning() ensures the query executes with Supabase pooler
        await this.db.client
          .update(this.db.schema.activityPricing)
          .set({
            pricingType: dto.pricingType || existingPricing.pricingType,
            ...(dto.totalPriceCents !== null && dto.totalPriceCents !== undefined && {
              basePrice: (dto.totalPriceCents / 100).toFixed(2),
              totalPriceCents: dto.totalPriceCents,
            }),
            taxesAndFeesCents: dto.taxesAndFeesCents !== undefined ? dto.taxesAndFeesCents : existingPricing.taxesAndFeesCents,
            currency: dto.currency || existingPricing.currency,
            // Commission fields (update if provided, otherwise keep existing)
            commissionTotalCents: dto.commissionTotalCents !== undefined ? dto.commissionTotalCents : existingPricing.commissionTotalCents,
            commissionSplitPercentage: dto.commissionSplitPercentage !== undefined ? dto.commissionSplitPercentage?.toString() : existingPricing.commissionSplitPercentage,
            commissionExpectedDate: dto.commissionExpectedDate !== undefined ? dto.commissionExpectedDate : existingPricing.commissionExpectedDate,
            // Booking details (update if provided, otherwise keep existing)
            termsAndConditions: dto.termsAndConditions !== undefined ? dto.termsAndConditions : existingPricing.termsAndConditions,
            cancellationPolicy: dto.cancellationPolicy !== undefined ? dto.cancellationPolicy : existingPricing.cancellationPolicy,
            supplier: dto.supplier !== undefined ? dto.supplier : existingPricing.supplier,
            bookingReference: dto.bookingReference !== undefined ? dto.bookingReference : existingPricing.bookingReference,
            ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.activityPricing.id, existingPricing.id))
          .returning()
      } else if (dto.totalPriceCents !== null && dto.totalPriceCents !== undefined) {
        // Create new pricing record - get agencyId for RLS
        const agencyId = await this.getActivityAgencyId(id)
        await this.db.client.insert(this.db.schema.activityPricing).values({
          agencyId,
          activityId: id,
          pricingType: dto.pricingType || 'per_person',
          basePrice: (dto.totalPriceCents / 100).toFixed(2), // Convert cents to decimal
          totalPriceCents: dto.totalPriceCents,
          taxesAndFeesCents: dto.taxesAndFeesCents || null,
          currency: dto.currency || 'CAD',
          // Commission fields (expected values)
          commissionTotalCents: dto.commissionTotalCents || null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() || null,
          commissionExpectedDate: dto.commissionExpectedDate || null,
          // Booking details
          termsAndConditions: dto.termsAndConditions || null,
          cancellationPolicy: dto.cancellationPolicy || null,
          supplier: dto.supplier || null,
          bookingReference: dto.bookingReference || null,
          ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
        })
      }
    }

    // Mark itinerary as having unpublished changes
    await this.markItineraryChangedForActivity(id)

    // Cascade day location recalculation (non-fatal — failures logged to Sentry)
    await this.cascadeDayLocationsForActivity(id)

    // Return the updated flight component
    return this.getFlight(id)
  }

  /**
   * Delete a flight component (cascades to details via FK)
   */
  async deleteFlight(id: string): Promise<void> {
    await this.markItineraryChangedForActivity(id)
    // Clean up storage files before database delete
    await this.cleanupComponentStorage(id)

    await this.baseService.delete(id)
    // Flight details and documents are automatically deleted via CASCADE foreign key
  }

  // ============================================================================
  // Lodging Component Methods
  // ============================================================================

  /**
   * Create a lodging component with details (transactional)
   */
  async createLodging(dto: CreateLodgingComponentDto): Promise<LodgingComponentDto> {
    // Get agencyId from itinerary day for RLS
    const agencyId = await this.getAgencyIdFromDayId(dto.itineraryDayId)

    // Compute spanning datetimes from lodging details if not provided
    const { startDatetime, endDatetime } = this.computeLodgingDatetimes(dto)

    // Create base component
    const activityId = await this.baseService.create({
      agencyId,
      itineraryDayId: dto.itineraryDayId,
      componentType: 'lodging',
      activityType: 'lodging',
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime,
      endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    })

    // Create lodging details if provided
    if (dto.lodgingDetails) {
      await this.lodgingDetailsService.create(activityId, dto.lodgingDetails)
    }

    // Update activity_pricing if pricing fields are provided
    // Note: BaseComponentService.create() auto-creates an activity_pricing record, so we update it
    const hasPricingData = dto.totalPriceCents !== undefined || dto.termsAndConditions ||
      dto.cancellationPolicy || dto.supplier || dto.commissionTotalCents !== undefined ||
      dto.bookingReference !== undefined || dto.pricingBreakdownJson !== undefined

    if (hasPricingData) {
      await this.db.client
        .update(this.db.schema.activityPricing)
        .set({
          pricingType: dto.pricingType || 'per_room',
          ...(dto.totalPriceCents !== undefined && dto.totalPriceCents !== null && {
            basePrice: (dto.totalPriceCents / 100).toFixed(2),
            totalPriceCents: dto.totalPriceCents,
          }),
          taxesAndFeesCents: dto.taxesAndFeesCents ?? null,
          currency: dto.currency || 'CAD',
          commissionTotalCents: dto.commissionTotalCents ?? null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() ?? null,
          commissionExpectedDate: dto.commissionExpectedDate ?? null,
          // Booking details
          termsAndConditions: dto.termsAndConditions ?? null,
          cancellationPolicy: dto.cancellationPolicy ?? null,
          supplier: dto.supplier ?? null,
          bookingReference: dto.bookingReference ?? null,
          ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.activityPricing.activityId, activityId))
    }

    await this.markItineraryChangedForActivity(activityId)

    // Cascade day location recalculation (non-fatal — failures logged to Sentry)
    if (dto.itineraryDayId) {
      const itineraryId = await this.getItineraryIdFromDayId(dto.itineraryDayId)
      if (itineraryId) {
        await this.cascadeDayLocations(activityId, dto.itineraryDayId, itineraryId)
      }
    }

    return this.getLodging(activityId)
  }

  /**
   * Get a lodging component with details
   */
  async getLodging(id: string): Promise<LodgingComponentDto> {
    const baseComponent = await this.baseService.findById(id)
    const lodgingDetails = await this.lodgingDetailsService.findByComponentId(id)

    // Fetch component_pricing if it exists
    const [activityPricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.activityId, id))
      .limit(1)

    return {
      id: baseComponent.id,
      itineraryDayId: baseComponent.itineraryDayId,
      parentActivityId: baseComponent.parentActivityId || null,
      componentType: 'lodging',
      activityType: 'lodging',
      name: baseComponent.name,
      description: baseComponent.description || null,
      sequenceOrder: baseComponent.sequenceOrder,
      startDatetime: baseComponent.startDatetime?.toISOString() || null,
      endDatetime: baseComponent.endDatetime?.toISOString() || null,
      timezone: baseComponent.timezone || null,
      location: baseComponent.location || null,
      address: baseComponent.address || null,
      coordinates: baseComponent.coordinates || null,
      notes: baseComponent.notes || null,
      confirmationNumber: baseComponent.confirmationNumber || null,
      status: baseComponent.status,
      pricingType: baseComponent.pricingType || null,
      currency: baseComponent.currency,
      invoiceType: activityPricing?.invoiceType || null,
      totalPriceCents: activityPricing?.totalPriceCents || null,
      taxesAndFeesCents: activityPricing?.taxesAndFeesCents || null,
      activityPricingId: activityPricing?.id || null,
      commissionTotalCents: activityPricing?.commissionTotalCents || null,
      commissionSplitPercentage: activityPricing?.commissionSplitPercentage || null,
      commissionExpectedDate: activityPricing?.commissionExpectedDate || null,
      // Booking details
      termsAndConditions: activityPricing?.termsAndConditions || null,
      cancellationPolicy: activityPricing?.cancellationPolicy || null,
      supplier: activityPricing?.supplier || null,
      bookingReference: activityPricing?.bookingReference || null,
      netPriceCents: activityPricing?.netPriceCents ?? null,
      nonRefundableDeposit: activityPricing?.nonRefundableDeposit ?? null,
      cancellationScheduleJson: activityPricing?.cancellationScheduleJson as any[] || null,
      pricingBreakdownJson: activityPricing?.pricingBreakdownJson as any[] || null,
      photos: baseComponent.photos || null,
      createdAt: baseComponent.createdAt.toISOString(),
      updatedAt: baseComponent.updatedAt.toISOString(),
      lodgingDetails: lodgingDetails || undefined,
    }
  }

  /**
   * Update a lodging component with details (transactional)
   */
  async updateLodging(id: string, dto: UpdateLodgingComponentDto): Promise<LodgingComponentDto> {
    // Compute spanning datetimes from lodging details if not provided
    const { startDatetime, endDatetime } = this.computeLodgingDatetimes(dto)

    // Update base component fields
    await this.baseService.update(id, {
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime,
      endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    })

    // Update lodging details if provided
    if (dto.lodgingDetails) {
      const existingDetails = await this.lodgingDetailsService.findByComponentId(id)
      if (existingDetails) {
        await this.lodgingDetailsService.update(id, dto.lodgingDetails)
      } else {
        await this.lodgingDetailsService.create(id, dto.lodgingDetails)
      }
    }

    // Update or create component_pricing if pricing or booking detail fields are provided
    const hasPricingUpdate = dto.totalPriceCents !== undefined ||
      dto.termsAndConditions !== undefined ||
      dto.cancellationPolicy !== undefined ||
      dto.supplier !== undefined ||
      dto.bookingReference !== undefined ||
      dto.pricingBreakdownJson !== undefined

    if (hasPricingUpdate) {
      const [existingPricing] = await this.db.client
        .select()
        .from(this.db.schema.activityPricing)
        .where(eq(this.db.schema.activityPricing.activityId, id))
        .limit(1)

      if (existingPricing) {
        await this.db.client
          .update(this.db.schema.activityPricing)
          .set({
            pricingType: dto.pricingType || existingPricing.pricingType,
            ...(dto.totalPriceCents !== null && dto.totalPriceCents !== undefined && {
              basePrice: (dto.totalPriceCents / 100).toFixed(2),
              totalPriceCents: dto.totalPriceCents,
            }),
            taxesAndFeesCents: dto.taxesAndFeesCents !== undefined ? dto.taxesAndFeesCents : existingPricing.taxesAndFeesCents,
            currency: dto.currency || existingPricing.currency,
            commissionTotalCents: dto.commissionTotalCents !== undefined ? dto.commissionTotalCents : existingPricing.commissionTotalCents,
            commissionSplitPercentage: dto.commissionSplitPercentage !== undefined ? dto.commissionSplitPercentage?.toString() : existingPricing.commissionSplitPercentage,
            commissionExpectedDate: dto.commissionExpectedDate !== undefined ? dto.commissionExpectedDate : existingPricing.commissionExpectedDate,
            // Booking details
            termsAndConditions: dto.termsAndConditions !== undefined ? dto.termsAndConditions : existingPricing.termsAndConditions,
            cancellationPolicy: dto.cancellationPolicy !== undefined ? dto.cancellationPolicy : existingPricing.cancellationPolicy,
            supplier: dto.supplier !== undefined ? dto.supplier : existingPricing.supplier,
            bookingReference: dto.bookingReference !== undefined ? dto.bookingReference : existingPricing.bookingReference,
            ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.activityPricing.id, existingPricing.id))
          .returning()
      } else if (dto.totalPriceCents !== null && dto.totalPriceCents !== undefined) {
        // Get agencyId for RLS
        const agencyId = await this.getActivityAgencyId(id)
        await this.db.client.insert(this.db.schema.activityPricing).values({
          agencyId,
          activityId: id,
          pricingType: dto.pricingType || 'per_room',
          basePrice: (dto.totalPriceCents / 100).toFixed(2),
          totalPriceCents: dto.totalPriceCents,
          taxesAndFeesCents: dto.taxesAndFeesCents || null,
          currency: dto.currency || 'CAD',
          commissionTotalCents: dto.commissionTotalCents || null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() || null,
          commissionExpectedDate: dto.commissionExpectedDate || null,
          // Booking details
          termsAndConditions: dto.termsAndConditions || null,
          cancellationPolicy: dto.cancellationPolicy || null,
          supplier: dto.supplier || null,
          bookingReference: dto.bookingReference || null,
          ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
        })
      }
    }

    await this.markItineraryChangedForActivity(id)

    // Cascade day location recalculation (non-fatal — failures logged to Sentry)
    await this.cascadeDayLocationsForActivity(id)

    return this.getLodging(id)
  }

  /**
   * Delete a lodging component (cascades to details via FK)
   */
  async deleteLodging(id: string): Promise<void> {
    await this.markItineraryChangedForActivity(id)
    // Clean up storage files before database delete
    await this.cleanupComponentStorage(id)

    await this.baseService.delete(id)
    // Lodging details and documents are automatically deleted via CASCADE foreign key
  }

  // ============================================================================
  // Transportation Component Methods
  // ============================================================================

  /**
   * Create a transportation component with details (transactional)
   */
  async createTransportation(dto: CreateTransportationComponentDto): Promise<TransportationComponentDto> {
    // Validate transportation details
    if (dto.transportationDetails) {
      const details = dto.transportationDetails

      // Validate subtype if provided
      if (details.subtype && !VALID_TRANSPORTATION_SUBTYPES.includes(details.subtype as any)) {
        throw new BadRequestException(
          `Invalid transportation subtype: ${details.subtype}. Must be one of: ${VALID_TRANSPORTATION_SUBTYPES.join(', ')}`
        )
      }

      // Validate pickup timezone if provided
      if (details.pickupTimezone && !isValidTimezone(details.pickupTimezone)) {
        throw new BadRequestException(
          `Invalid pickup timezone: ${details.pickupTimezone}. Must be a valid IANA timezone.`
        )
      }

      // Validate dropoff timezone if provided
      if (details.dropoffTimezone && !isValidTimezone(details.dropoffTimezone)) {
        throw new BadRequestException(
          `Invalid dropoff timezone: ${details.dropoffTimezone}. Must be a valid IANA timezone.`
        )
      }
    }

    // Get agencyId from itinerary day for RLS
    const agencyId = await this.getAgencyIdFromDayId(dto.itineraryDayId)

    // Create base component
    const activityId = await this.baseService.create({
      agencyId,
      itineraryDayId: dto.itineraryDayId,
      componentType: 'transportation',
      activityType: 'transportation',
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    })

    // Create transportation details if provided
    if (dto.transportationDetails) {
      await this.transportationDetailsService.create(activityId, dto.transportationDetails)
    }

    // Update activity_pricing if pricing fields are provided
    // Note: BaseComponentService.create() auto-creates an activity_pricing record, so we update it
    const hasPricingData = dto.totalPriceCents !== undefined || dto.termsAndConditions ||
      dto.cancellationPolicy || dto.supplier || dto.commissionTotalCents !== undefined ||
      dto.bookingReference !== undefined || dto.pricingBreakdownJson !== undefined

    if (hasPricingData) {
      await this.db.client
        .update(this.db.schema.activityPricing)
        .set({
          pricingType: dto.pricingType || 'flat_rate',
          ...(dto.totalPriceCents !== undefined && dto.totalPriceCents !== null && {
            basePrice: (dto.totalPriceCents / 100).toFixed(2),
            totalPriceCents: dto.totalPriceCents,
          }),
          taxesAndFeesCents: dto.taxesAndFeesCents ?? null,
          currency: dto.currency || 'CAD',
          commissionTotalCents: dto.commissionTotalCents ?? null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() ?? null,
          commissionExpectedDate: dto.commissionExpectedDate ?? null,
          // Booking details
          termsAndConditions: dto.termsAndConditions ?? null,
          cancellationPolicy: dto.cancellationPolicy ?? null,
          supplier: dto.supplier ?? null,
          bookingReference: dto.bookingReference ?? null,
          ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.activityPricing.activityId, activityId))
    }

    return this.getTransportation(activityId)
  }

  /**
   * Get a transportation component with details
   */
  async getTransportation(id: string): Promise<TransportationComponentDto> {
    const baseComponent = await this.baseService.findById(id)
    const transportationDetails = await this.transportationDetailsService.findByComponentId(id)

    // Fetch component_pricing if it exists
    const [activityPricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.activityId, id))
      .limit(1)

    return {
      id: baseComponent.id,
      itineraryDayId: baseComponent.itineraryDayId,
      parentActivityId: baseComponent.parentActivityId || null,
      componentType: 'transportation',
      activityType: 'transportation',
      name: baseComponent.name,
      description: baseComponent.description || null,
      sequenceOrder: baseComponent.sequenceOrder,
      startDatetime: baseComponent.startDatetime?.toISOString() || null,
      endDatetime: baseComponent.endDatetime?.toISOString() || null,
      timezone: baseComponent.timezone || null,
      location: baseComponent.location || null,
      address: baseComponent.address || null,
      coordinates: baseComponent.coordinates || null,
      notes: baseComponent.notes || null,
      confirmationNumber: baseComponent.confirmationNumber || null,
      status: baseComponent.status,
      pricingType: baseComponent.pricingType || null,
      currency: baseComponent.currency,
      invoiceType: activityPricing?.invoiceType || null,
      totalPriceCents: activityPricing?.totalPriceCents || null,
      taxesAndFeesCents: activityPricing?.taxesAndFeesCents || null,
      activityPricingId: activityPricing?.id || null,
      commissionTotalCents: activityPricing?.commissionTotalCents || null,
      commissionSplitPercentage: activityPricing?.commissionSplitPercentage || null,
      commissionExpectedDate: activityPricing?.commissionExpectedDate || null,
      // Booking details
      termsAndConditions: activityPricing?.termsAndConditions || null,
      cancellationPolicy: activityPricing?.cancellationPolicy || null,
      supplier: activityPricing?.supplier || null,
      bookingReference: activityPricing?.bookingReference || null,
      netPriceCents: activityPricing?.netPriceCents ?? null,
      nonRefundableDeposit: activityPricing?.nonRefundableDeposit ?? null,
      cancellationScheduleJson: activityPricing?.cancellationScheduleJson as any[] || null,
      pricingBreakdownJson: activityPricing?.pricingBreakdownJson as any[] || null,
      photos: baseComponent.photos || null,
      createdAt: baseComponent.createdAt.toISOString(),
      updatedAt: baseComponent.updatedAt.toISOString(),
      transportationDetails: transportationDetails || undefined,
    }
  }

  /**
   * Update a transportation component with details (transactional)
   */
  async updateTransportation(id: string, dto: UpdateTransportationComponentDto): Promise<TransportationComponentDto> {
    // Validate transportation details
    if (dto.transportationDetails) {
      const details = dto.transportationDetails

      // Validate subtype if provided
      if (details.subtype && !VALID_TRANSPORTATION_SUBTYPES.includes(details.subtype as any)) {
        throw new BadRequestException(
          `Invalid transportation subtype: ${details.subtype}. Must be one of: ${VALID_TRANSPORTATION_SUBTYPES.join(', ')}`
        )
      }

      // Validate pickup timezone if provided
      if (details.pickupTimezone && !isValidTimezone(details.pickupTimezone)) {
        throw new BadRequestException(
          `Invalid pickup timezone: ${details.pickupTimezone}. Must be a valid IANA timezone.`
        )
      }

      // Validate dropoff timezone if provided
      if (details.dropoffTimezone && !isValidTimezone(details.dropoffTimezone)) {
        throw new BadRequestException(
          `Invalid dropoff timezone: ${details.dropoffTimezone}. Must be a valid IANA timezone.`
        )
      }
    }

    // Update base component fields
    await this.baseService.update(id, {
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    })

    // Update transportation details if provided
    if (dto.transportationDetails) {
      const existingDetails = await this.transportationDetailsService.findByComponentId(id)
      if (existingDetails) {
        await this.transportationDetailsService.update(id, dto.transportationDetails)
      } else {
        await this.transportationDetailsService.create(id, dto.transportationDetails)
      }
    }

    // Update or create component_pricing if pricing or booking detail fields are provided
    const hasPricingUpdate = dto.totalPriceCents !== undefined ||
      dto.termsAndConditions !== undefined ||
      dto.cancellationPolicy !== undefined ||
      dto.supplier !== undefined ||
      dto.bookingReference !== undefined ||
      dto.pricingBreakdownJson !== undefined

    if (hasPricingUpdate) {
      const [existingPricing] = await this.db.client
        .select()
        .from(this.db.schema.activityPricing)
        .where(eq(this.db.schema.activityPricing.activityId, id))
        .limit(1)

      if (existingPricing) {
        await this.db.client
          .update(this.db.schema.activityPricing)
          .set({
            pricingType: dto.pricingType || existingPricing.pricingType,
            ...(dto.totalPriceCents !== null && dto.totalPriceCents !== undefined && {
              basePrice: (dto.totalPriceCents / 100).toFixed(2),
              totalPriceCents: dto.totalPriceCents,
            }),
            taxesAndFeesCents: dto.taxesAndFeesCents !== undefined ? dto.taxesAndFeesCents : existingPricing.taxesAndFeesCents,
            currency: dto.currency || existingPricing.currency,
            commissionTotalCents: dto.commissionTotalCents !== undefined ? dto.commissionTotalCents : existingPricing.commissionTotalCents,
            commissionSplitPercentage: dto.commissionSplitPercentage !== undefined ? dto.commissionSplitPercentage?.toString() : existingPricing.commissionSplitPercentage,
            commissionExpectedDate: dto.commissionExpectedDate !== undefined ? dto.commissionExpectedDate : existingPricing.commissionExpectedDate,
            // Booking details
            termsAndConditions: dto.termsAndConditions !== undefined ? dto.termsAndConditions : existingPricing.termsAndConditions,
            cancellationPolicy: dto.cancellationPolicy !== undefined ? dto.cancellationPolicy : existingPricing.cancellationPolicy,
            supplier: dto.supplier !== undefined ? dto.supplier : existingPricing.supplier,
            bookingReference: dto.bookingReference !== undefined ? dto.bookingReference : existingPricing.bookingReference,
            ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.activityPricing.id, existingPricing.id))
          .returning()
      } else if (dto.totalPriceCents !== null && dto.totalPriceCents !== undefined) {
        // Get agencyId for RLS
        const agencyId = await this.getActivityAgencyId(id)
        await this.db.client.insert(this.db.schema.activityPricing).values({
          agencyId,
          activityId: id,
          pricingType: dto.pricingType || 'flat_rate',
          basePrice: (dto.totalPriceCents / 100).toFixed(2),
          totalPriceCents: dto.totalPriceCents,
          taxesAndFeesCents: dto.taxesAndFeesCents || null,
          currency: dto.currency || 'CAD',
          commissionTotalCents: dto.commissionTotalCents || null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() || null,
          commissionExpectedDate: dto.commissionExpectedDate || null,
          // Booking details
          termsAndConditions: dto.termsAndConditions || null,
          cancellationPolicy: dto.cancellationPolicy || null,
          supplier: dto.supplier || null,
          bookingReference: dto.bookingReference || null,
          ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
        })
      }
    }

    await this.markItineraryChangedForActivity(id)

    return this.getTransportation(id)
  }

  /**
   * Delete a transportation component (cascades to details via FK)
   */
  async deleteTransportation(id: string): Promise<void> {
    await this.markItineraryChangedForActivity(id)
    // Clean up storage files before database delete
    await this.cleanupComponentStorage(id)

    await this.baseService.delete(id)
    // Transportation details and documents are automatically deleted via CASCADE foreign key
  }

  // ============================================================================
  // Dining Component Methods
  // ============================================================================

  /**
   * Create a dining component with details (transactional)
   */
  async createDining(dto: CreateDiningComponentDto): Promise<DiningComponentDto> {
    // Validate party size if provided
    if (dto.diningDetails?.partySize !== undefined && dto.diningDetails?.partySize !== null) {
      if (dto.diningDetails.partySize < 1 || dto.diningDetails.partySize > 100) {
        throw new BadRequestException('Party size must be between 1 and 100')
      }
    }

    // Get agencyId from itinerary day for RLS
    const agencyId = await this.getAgencyIdFromDayId(dto.itineraryDayId)

    // Create base component
    const activityId = await this.baseService.create({
      agencyId,
      itineraryDayId: dto.itineraryDayId,
      componentType: 'dining',
      activityType: 'dining',
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    })

    // Create dining details if provided
    if (dto.diningDetails) {
      await this.diningDetailsService.create(activityId, dto.diningDetails)
    }

    // Update activity_pricing if pricing fields are provided
    // Note: BaseComponentService.create() auto-creates an activity_pricing record, so we update it
    const hasPricingData = dto.totalPriceCents !== undefined || dto.termsAndConditions ||
      dto.cancellationPolicy || dto.supplier || dto.commissionTotalCents !== undefined ||
      dto.bookingReference !== undefined || dto.pricingBreakdownJson !== undefined

    if (hasPricingData) {
      await this.db.client
        .update(this.db.schema.activityPricing)
        .set({
          pricingType: dto.pricingType || 'per_person',
          ...(dto.totalPriceCents !== undefined && dto.totalPriceCents !== null && {
            basePrice: (dto.totalPriceCents / 100).toFixed(2),
            totalPriceCents: dto.totalPriceCents,
          }),
          taxesAndFeesCents: dto.taxesAndFeesCents ?? null,
          currency: dto.currency || 'CAD',
          commissionTotalCents: dto.commissionTotalCents ?? null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() ?? null,
          commissionExpectedDate: dto.commissionExpectedDate ?? null,
          // Booking details
          termsAndConditions: dto.termsAndConditions ?? null,
          cancellationPolicy: dto.cancellationPolicy ?? null,
          supplier: dto.supplier ?? null,
          bookingReference: dto.bookingReference ?? null,
          ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.activityPricing.activityId, activityId))
    }

    return this.getDining(activityId)
  }

  /**
   * Get a dining component with details
   */
  async getDining(id: string): Promise<DiningComponentDto> {
    const baseComponent = await this.baseService.findById(id)
    const diningDetails = await this.diningDetailsService.findByComponentId(id)

    // Fetch component_pricing if it exists
    const [activityPricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.activityId, id))
      .limit(1)

    return {
      id: baseComponent.id,
      itineraryDayId: baseComponent.itineraryDayId,
      parentActivityId: baseComponent.parentActivityId || null,
      componentType: 'dining',
      activityType: 'dining',
      name: baseComponent.name,
      description: baseComponent.description || null,
      sequenceOrder: baseComponent.sequenceOrder,
      startDatetime: baseComponent.startDatetime?.toISOString() || null,
      endDatetime: baseComponent.endDatetime?.toISOString() || null,
      timezone: baseComponent.timezone || null,
      location: baseComponent.location || null,
      address: baseComponent.address || null,
      coordinates: baseComponent.coordinates || null,
      notes: baseComponent.notes || null,
      confirmationNumber: baseComponent.confirmationNumber || null,
      status: baseComponent.status,
      pricingType: baseComponent.pricingType || null,
      currency: baseComponent.currency,
      invoiceType: activityPricing?.invoiceType || null,
      totalPriceCents: activityPricing?.totalPriceCents || null,
      taxesAndFeesCents: activityPricing?.taxesAndFeesCents || null,
      activityPricingId: activityPricing?.id || null,
      commissionTotalCents: activityPricing?.commissionTotalCents || null,
      commissionSplitPercentage: activityPricing?.commissionSplitPercentage || null,
      commissionExpectedDate: activityPricing?.commissionExpectedDate || null,
      // Booking details
      termsAndConditions: activityPricing?.termsAndConditions || null,
      cancellationPolicy: activityPricing?.cancellationPolicy || null,
      supplier: activityPricing?.supplier || null,
      bookingReference: activityPricing?.bookingReference || null,
      netPriceCents: activityPricing?.netPriceCents ?? null,
      nonRefundableDeposit: activityPricing?.nonRefundableDeposit ?? null,
      cancellationScheduleJson: activityPricing?.cancellationScheduleJson as any[] || null,
      pricingBreakdownJson: activityPricing?.pricingBreakdownJson as any[] || null,
      photos: baseComponent.photos || null,
      createdAt: baseComponent.createdAt.toISOString(),
      updatedAt: baseComponent.updatedAt.toISOString(),
      diningDetails: diningDetails || undefined,
    }
  }

  /**
   * Update a dining component with details (transactional)
   */
  async updateDining(id: string, dto: UpdateDiningComponentDto): Promise<DiningComponentDto> {
    // Validate party size if provided
    if (dto.diningDetails?.partySize !== undefined && dto.diningDetails?.partySize !== null) {
      if (dto.diningDetails.partySize < 1 || dto.diningDetails.partySize > 100) {
        throw new BadRequestException('Party size must be between 1 and 100')
      }
    }

    // Update base component fields
    await this.baseService.update(id, {
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    })

    // Update dining details if provided
    if (dto.diningDetails) {
      const existingDetails = await this.diningDetailsService.findByComponentId(id)
      if (existingDetails) {
        await this.diningDetailsService.update(id, dto.diningDetails)
      } else {
        await this.diningDetailsService.create(id, dto.diningDetails)
      }
    }

    // Update or create component_pricing if pricing or booking detail fields are provided
    const hasPricingUpdate = dto.totalPriceCents !== undefined ||
      dto.termsAndConditions !== undefined ||
      dto.cancellationPolicy !== undefined ||
      dto.supplier !== undefined ||
      dto.bookingReference !== undefined ||
      dto.pricingBreakdownJson !== undefined

    if (hasPricingUpdate) {
      const [existingPricing] = await this.db.client
        .select()
        .from(this.db.schema.activityPricing)
        .where(eq(this.db.schema.activityPricing.activityId, id))
        .limit(1)

      if (existingPricing) {
        await this.db.client
          .update(this.db.schema.activityPricing)
          .set({
            pricingType: dto.pricingType || existingPricing.pricingType,
            ...(dto.totalPriceCents !== null && dto.totalPriceCents !== undefined && {
              basePrice: (dto.totalPriceCents / 100).toFixed(2),
              totalPriceCents: dto.totalPriceCents,
            }),
            taxesAndFeesCents: dto.taxesAndFeesCents !== undefined ? dto.taxesAndFeesCents : existingPricing.taxesAndFeesCents,
            currency: dto.currency || existingPricing.currency,
            commissionTotalCents: dto.commissionTotalCents !== undefined ? dto.commissionTotalCents : existingPricing.commissionTotalCents,
            commissionSplitPercentage: dto.commissionSplitPercentage !== undefined ? dto.commissionSplitPercentage?.toString() : existingPricing.commissionSplitPercentage,
            commissionExpectedDate: dto.commissionExpectedDate !== undefined ? dto.commissionExpectedDate : existingPricing.commissionExpectedDate,
            // Booking details
            termsAndConditions: dto.termsAndConditions !== undefined ? dto.termsAndConditions : existingPricing.termsAndConditions,
            cancellationPolicy: dto.cancellationPolicy !== undefined ? dto.cancellationPolicy : existingPricing.cancellationPolicy,
            supplier: dto.supplier !== undefined ? dto.supplier : existingPricing.supplier,
            bookingReference: dto.bookingReference !== undefined ? dto.bookingReference : existingPricing.bookingReference,
            ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.activityPricing.id, existingPricing.id))
          .returning()
      } else if (dto.totalPriceCents !== null && dto.totalPriceCents !== undefined) {
        // Get agencyId for RLS
        const agencyId = await this.getActivityAgencyId(id)
        await this.db.client.insert(this.db.schema.activityPricing).values({
          agencyId,
          activityId: id,
          pricingType: dto.pricingType || 'per_person',
          basePrice: (dto.totalPriceCents / 100).toFixed(2),
          totalPriceCents: dto.totalPriceCents,
          taxesAndFeesCents: dto.taxesAndFeesCents || null,
          currency: dto.currency || 'CAD',
          commissionTotalCents: dto.commissionTotalCents || null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() || null,
          commissionExpectedDate: dto.commissionExpectedDate || null,
          // Booking details
          termsAndConditions: dto.termsAndConditions || null,
          cancellationPolicy: dto.cancellationPolicy || null,
          supplier: dto.supplier || null,
          bookingReference: dto.bookingReference || null,
          ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
        })
      }
    }

    await this.markItineraryChangedForActivity(id)

    return this.getDining(id)
  }

  /**
   * Delete a dining component (cascades to details via FK)
   */
  async deleteDining(id: string): Promise<void> {
    await this.markItineraryChangedForActivity(id)
    // Clean up storage files before database delete
    await this.cleanupComponentStorage(id)

    await this.baseService.delete(id)
    // Dining details and documents are automatically deleted via CASCADE foreign key
  }

  // ============================================================================
  // Port Info Component Methods (no pricing - hasPricing: false)
  // ============================================================================

  /**
   * Create a port info component with details (transactional)
   */
  async createPortInfo(dto: CreatePortInfoComponentDto): Promise<PortInfoComponentDto> {
    // Get agencyId from itinerary day for RLS
    const agencyId = await this.getAgencyIdFromDayId(dto.itineraryDayId)

    // Create base component
    const activityId = await this.baseService.create({
      agencyId,
      itineraryDayId: dto.itineraryDayId,
      parentActivityId: dto.parentActivityId,
      componentType: 'port_info',
      activityType: 'port_info',
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      photos: dto.photos,
    })

    // Create port info details if provided
    if (dto.portInfoDetails) {
      await this.portInfoDetailsService.create(activityId, dto.portInfoDetails)
    }

    await this.markItineraryChangedForActivity(activityId)

    // Cascade day location recalculation (non-fatal — failures logged to Sentry)
    if (dto.itineraryDayId) {
      const itineraryId = await this.getItineraryIdFromDayId(dto.itineraryDayId)
      if (itineraryId) {
        await this.cascadeDayLocations(activityId, dto.itineraryDayId, itineraryId)
      }
    }

    return this.getPortInfo(activityId)
  }

  /**
   * Get a port info component with details
   */
  async getPortInfo(id: string): Promise<PortInfoComponentDto> {
    const baseComponent = await this.baseService.findById(id)
    const portInfoDetails = await this.portInfoDetailsService.findByComponentId(id)

    return {
      id: baseComponent.id,
      itineraryDayId: baseComponent.itineraryDayId,
      parentActivityId: baseComponent.parentActivityId || null,
      componentType: 'port_info',
      activityType: 'port_info',
      name: baseComponent.name,
      description: baseComponent.description || null,
      sequenceOrder: baseComponent.sequenceOrder,
      startDatetime: baseComponent.startDatetime?.toISOString() || null,
      endDatetime: baseComponent.endDatetime?.toISOString() || null,
      timezone: baseComponent.timezone || null,
      location: baseComponent.location || null,
      address: baseComponent.address || null,
      coordinates: baseComponent.coordinates || null,
      notes: baseComponent.notes || null,
      confirmationNumber: baseComponent.confirmationNumber || null,
      status: baseComponent.status,
      // Port info has no pricing
      pricingType: null,
      currency: 'CAD',
      invoiceType: null,
      totalPriceCents: null,
      taxesAndFeesCents: null,
      activityPricingId: null,
      commissionTotalCents: null,
      commissionSplitPercentage: null,
      commissionExpectedDate: null,
      // Booking details (null for port info - no pricing)
      termsAndConditions: null,
      cancellationPolicy: null,
      supplier: null,
      bookingReference: null,
      netPriceCents: null,
      nonRefundableDeposit: null,
      cancellationScheduleJson: null,
      pricingBreakdownJson: null,
      photos: baseComponent.photos || null,
      createdAt: baseComponent.createdAt.toISOString(),
      updatedAt: baseComponent.updatedAt.toISOString(),
      portInfoDetails: portInfoDetails || undefined,
    }
  }

  /**
   * Update a port info component with details (transactional)
   * Note: Port Info does not have pricing/booking details
   */
  async updatePortInfo(id: string, dto: UpdatePortInfoComponentDto): Promise<PortInfoComponentDto> {
    // Update base component fields
    await this.baseService.update(id, {
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      photos: dto.photos,
    })

    // Update port info details if provided
    if (dto.portInfoDetails) {
      const existingDetails = await this.portInfoDetailsService.findByComponentId(id)
      if (existingDetails) {
        await this.portInfoDetailsService.update(id, dto.portInfoDetails)
      } else {
        await this.portInfoDetailsService.create(id, dto.portInfoDetails)
      }
    }

    await this.markItineraryChangedForActivity(id)

    // Cascade day location recalculation (non-fatal — failures logged to Sentry)
    await this.cascadeDayLocationsForActivity(id)

    return this.getPortInfo(id)
  }

  /**
   * Delete a port info component (cascades to details via FK)
   */
  async deletePortInfo(id: string): Promise<void> {
    await this.markItineraryChangedForActivity(id)
    // Clean up storage files before database delete
    await this.cleanupComponentStorage(id)

    await this.baseService.delete(id)
    // Port info details and documents are automatically deleted via CASCADE foreign key
  }

  // ============================================================================
  // Options Component Methods (hasPricing: true, hasSupplier: true)
  // ============================================================================

  /**
   * Create an options component with details (transactional)
   */
  async createOptions(dto: CreateOptionsComponentDto): Promise<OptionsComponentDto> {
    // Get agencyId from itinerary day for RLS
    const agencyId = await this.getAgencyIdFromDayId(dto.itineraryDayId)

    // Create base component
    const activityId = await this.baseService.create({
      agencyId,
      itineraryDayId: dto.itineraryDayId,
      componentType: 'options',
      activityType: 'options',
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    })

    // Create options details if provided
    if (dto.optionsDetails) {
      await this.optionsDetailsService.create(activityId, dto.optionsDetails)
    }

    // Update activity_pricing if pricing fields are provided
    // Note: BaseComponentService.create() auto-creates an activity_pricing record, so we update it
    const hasPricingData = dto.totalPriceCents !== undefined || dto.termsAndConditions ||
      dto.cancellationPolicy || dto.supplier || dto.commissionTotalCents !== undefined ||
      dto.bookingReference !== undefined || dto.pricingBreakdownJson !== undefined

    if (hasPricingData) {
      await this.db.client
        .update(this.db.schema.activityPricing)
        .set({
          pricingType: dto.pricingType || 'per_person',
          ...(dto.totalPriceCents !== undefined && dto.totalPriceCents !== null && {
            basePrice: (dto.totalPriceCents / 100).toFixed(2),
            totalPriceCents: dto.totalPriceCents,
          }),
          taxesAndFeesCents: dto.taxesAndFeesCents ?? null,
          currency: dto.currency || 'CAD',
          commissionTotalCents: dto.commissionTotalCents ?? null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() ?? null,
          commissionExpectedDate: dto.commissionExpectedDate ?? null,
          // Booking details
          termsAndConditions: dto.termsAndConditions ?? null,
          cancellationPolicy: dto.cancellationPolicy ?? null,
          supplier: dto.supplier ?? null,
          bookingReference: dto.bookingReference ?? null,
          ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.activityPricing.activityId, activityId))
    }

    return this.getOptions(activityId)
  }

  /**
   * Get an options component with details
   */
  async getOptions(id: string): Promise<OptionsComponentDto> {
    const baseComponent = await this.baseService.findById(id)
    const optionsDetails = await this.optionsDetailsService.findByComponentId(id)

    // Fetch component_pricing if it exists
    const [activityPricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.activityId, id))
      .limit(1)

    return {
      id: baseComponent.id,
      itineraryDayId: baseComponent.itineraryDayId,
      parentActivityId: baseComponent.parentActivityId || null,
      componentType: 'options',
      activityType: 'options',
      name: baseComponent.name,
      description: baseComponent.description || null,
      sequenceOrder: baseComponent.sequenceOrder,
      startDatetime: baseComponent.startDatetime?.toISOString() || null,
      endDatetime: baseComponent.endDatetime?.toISOString() || null,
      timezone: baseComponent.timezone || null,
      location: baseComponent.location || null,
      address: baseComponent.address || null,
      coordinates: baseComponent.coordinates || null,
      notes: baseComponent.notes || null,
      confirmationNumber: baseComponent.confirmationNumber || null,
      status: baseComponent.status,
      pricingType: baseComponent.pricingType || null,
      currency: baseComponent.currency,
      invoiceType: activityPricing?.invoiceType || null,
      totalPriceCents: activityPricing?.totalPriceCents || null,
      taxesAndFeesCents: activityPricing?.taxesAndFeesCents || null,
      activityPricingId: activityPricing?.id || null,
      commissionTotalCents: activityPricing?.commissionTotalCents || null,
      commissionSplitPercentage: activityPricing?.commissionSplitPercentage || null,
      commissionExpectedDate: activityPricing?.commissionExpectedDate || null,
      // Booking details
      termsAndConditions: activityPricing?.termsAndConditions || null,
      cancellationPolicy: activityPricing?.cancellationPolicy || null,
      supplier: activityPricing?.supplier || null,
      bookingReference: activityPricing?.bookingReference || null,
      netPriceCents: activityPricing?.netPriceCents ?? null,
      nonRefundableDeposit: activityPricing?.nonRefundableDeposit ?? null,
      cancellationScheduleJson: activityPricing?.cancellationScheduleJson as any[] || null,
      pricingBreakdownJson: activityPricing?.pricingBreakdownJson as any[] || null,
      photos: baseComponent.photos || null,
      createdAt: baseComponent.createdAt.toISOString(),
      updatedAt: baseComponent.updatedAt.toISOString(),
      optionsDetails: optionsDetails || undefined,
    }
  }

  /**
   * Update an options component with details (transactional)
   */
  async updateOptions(id: string, dto: UpdateOptionsComponentDto): Promise<OptionsComponentDto> {
    // Update base component fields
    await this.baseService.update(id, {
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    })

    // Update options details if provided
    if (dto.optionsDetails) {
      const existingDetails = await this.optionsDetailsService.findByComponentId(id)
      if (existingDetails) {
        await this.optionsDetailsService.update(id, dto.optionsDetails)
      } else {
        await this.optionsDetailsService.create(id, dto.optionsDetails)
      }
    }

    // Update or create component_pricing if pricing or booking detail fields are provided
    const hasPricingUpdate = dto.totalPriceCents !== undefined ||
      dto.termsAndConditions !== undefined ||
      dto.cancellationPolicy !== undefined ||
      dto.supplier !== undefined ||
      dto.bookingReference !== undefined ||
      dto.pricingBreakdownJson !== undefined

    if (hasPricingUpdate) {
      const [existingPricing] = await this.db.client
        .select()
        .from(this.db.schema.activityPricing)
        .where(eq(this.db.schema.activityPricing.activityId, id))
        .limit(1)

      if (existingPricing) {
        // Update existing pricing - merge with existing values (undefined = keep existing, null = clear, value = update)
        await this.db.client
          .update(this.db.schema.activityPricing)
          .set({
            pricingType: dto.pricingType || existingPricing.pricingType,
            ...(dto.totalPriceCents !== null && dto.totalPriceCents !== undefined && {
              basePrice: (dto.totalPriceCents / 100).toFixed(2),
              totalPriceCents: dto.totalPriceCents,
            }),
            taxesAndFeesCents: dto.taxesAndFeesCents !== undefined ? dto.taxesAndFeesCents : existingPricing.taxesAndFeesCents,
            currency: dto.currency || existingPricing.currency,
            // Commission fields (update if provided, otherwise keep existing)
            commissionTotalCents: dto.commissionTotalCents !== undefined ? dto.commissionTotalCents : existingPricing.commissionTotalCents,
            commissionSplitPercentage: dto.commissionSplitPercentage !== undefined ? dto.commissionSplitPercentage?.toString() : existingPricing.commissionSplitPercentage,
            commissionExpectedDate: dto.commissionExpectedDate !== undefined ? dto.commissionExpectedDate : existingPricing.commissionExpectedDate,
            // Booking details (update if provided, otherwise keep existing)
            termsAndConditions: dto.termsAndConditions !== undefined ? dto.termsAndConditions : existingPricing.termsAndConditions,
            cancellationPolicy: dto.cancellationPolicy !== undefined ? dto.cancellationPolicy : existingPricing.cancellationPolicy,
            supplier: dto.supplier !== undefined ? dto.supplier : existingPricing.supplier,
            bookingReference: dto.bookingReference !== undefined ? dto.bookingReference : existingPricing.bookingReference,
            ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.activityPricing.id, existingPricing.id))
          .returning()
      } else if (dto.totalPriceCents !== null && dto.totalPriceCents !== undefined) {
        // Create new pricing record - get agencyId for RLS
        const agencyId = await this.getActivityAgencyId(id)
        await this.db.client.insert(this.db.schema.activityPricing).values({
          agencyId,
          activityId: id,
          pricingType: dto.pricingType || 'per_person',
          basePrice: (dto.totalPriceCents / 100).toFixed(2),
          totalPriceCents: dto.totalPriceCents,
          taxesAndFeesCents: dto.taxesAndFeesCents || null,
          currency: dto.currency || 'CAD',
          // Commission fields
          commissionTotalCents: dto.commissionTotalCents || null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() || null,
          commissionExpectedDate: dto.commissionExpectedDate || null,
          // Booking details
          termsAndConditions: dto.termsAndConditions || null,
          cancellationPolicy: dto.cancellationPolicy || null,
          supplier: dto.supplier || null,
          bookingReference: dto.bookingReference || null,
          ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
        })
      }
    }

    await this.markItineraryChangedForActivity(id)

    return this.getOptions(id)
  }

  /**
   * Delete an options component (cascades to details via FK)
   */
  async deleteOptions(id: string): Promise<void> {
    await this.markItineraryChangedForActivity(id)
    // Clean up storage files before database delete
    await this.cleanupComponentStorage(id)

    await this.baseService.delete(id)
    // Options details and documents are automatically deleted via CASCADE foreign key
  }

  // ============================================================================
  // Custom Cruise Component Methods (hasPricing: true, hasSupplier: true)
  // ============================================================================

  /**
   * Create a custom cruise component with details (transactional)
   * Optimized: Constructs DTO from returned insert data instead of re-fetching
   */
  async createCustomCruise(dto: CreateCustomCruiseComponentDto): Promise<CustomCruiseComponentDto> {
    // Get agencyId from itinerary day for RLS
    const agencyId = await this.getAgencyIdFromDayId(dto.itineraryDayId)

    // Create base component using the optimized method that returns full data
    const { component, activityPricing: initialPricing } = await this.baseService.create({
      agencyId,
      itineraryDayId: dto.itineraryDayId,
      componentType: 'custom_cruise',
      activityType: 'custom_cruise',
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    }, { returnDetails: true })

    // Create custom cruise details if provided
    // Note: We pass through the input DTO since it contains the same data we're inserting
    if (dto.customCruiseDetails) {
      await this.customCruiseDetailsService.create(component.id, dto.customCruiseDetails)
    }

    // Update activity_pricing if pricing fields are provided and get updated values
    let finalPricing = initialPricing
    const hasPricingData = dto.totalPriceCents !== undefined || dto.termsAndConditions ||
      dto.cancellationPolicy || dto.supplier || dto.commissionTotalCents !== undefined ||
      dto.bookingReference !== undefined || dto.pricingBreakdownJson !== undefined

    if (hasPricingData && initialPricing) {
      const [updatedPricing] = await this.db.client
        .update(this.db.schema.activityPricing)
        .set({
          pricingType: dto.pricingType || 'per_person',
          ...(dto.totalPriceCents !== undefined && dto.totalPriceCents !== null && {
            basePrice: (dto.totalPriceCents / 100).toFixed(2),
            totalPriceCents: dto.totalPriceCents,
          }),
          taxesAndFeesCents: dto.taxesAndFeesCents ?? null,
          currency: dto.currency || 'CAD',
          commissionTotalCents: dto.commissionTotalCents ?? null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() ?? null,
          commissionExpectedDate: dto.commissionExpectedDate ?? null,
          // Booking details
          termsAndConditions: dto.termsAndConditions ?? null,
          cancellationPolicy: dto.cancellationPolicy ?? null,
          supplier: dto.supplier ?? null,
          bookingReference: dto.bookingReference ?? null,
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.activityPricing.activityId, component.id))
        .returning()
      if (updatedPricing) {
        finalPricing = updatedPricing
      }
    }

    // Construct DTO directly from inserted/updated data (no re-fetch)
    return {
      id: component.id,
      itineraryDayId: component.itineraryDayId,
      parentActivityId: component.parentActivityId || null,
      componentType: 'custom_cruise',
      activityType: 'custom_cruise',
      name: component.name,
      description: component.description || null,
      sequenceOrder: component.sequenceOrder,
      startDatetime: component.startDatetime?.toISOString() || null,
      endDatetime: component.endDatetime?.toISOString() || null,
      timezone: component.timezone || null,
      location: component.location || null,
      address: component.address || null,
      coordinates: component.coordinates || null,
      notes: component.notes || null,
      confirmationNumber: component.confirmationNumber || null,
      status: component.status || 'proposed',
      pricingType: component.pricingType || null,
      currency: component.currency || 'CAD',
      invoiceType: finalPricing?.invoiceType || null,
      totalPriceCents: finalPricing?.totalPriceCents || null,
      taxesAndFeesCents: finalPricing?.taxesAndFeesCents || null,
      activityPricingId: finalPricing?.id || null,
      commissionTotalCents: finalPricing?.commissionTotalCents || null,
      commissionSplitPercentage: finalPricing?.commissionSplitPercentage || null,
      commissionExpectedDate: finalPricing?.commissionExpectedDate || null,
      termsAndConditions: finalPricing?.termsAndConditions || null,
      cancellationPolicy: finalPricing?.cancellationPolicy || null,
      supplier: finalPricing?.supplier || null,
      bookingReference: finalPricing?.bookingReference || null,
      netPriceCents: finalPricing?.netPriceCents ?? null,
      nonRefundableDeposit: finalPricing?.nonRefundableDeposit ?? null,
      cancellationScheduleJson: finalPricing?.cancellationScheduleJson as any[] || null,
      pricingBreakdownJson: finalPricing?.pricingBreakdownJson as any[] || null,
      photos: component.photos || null,
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
      customCruiseDetails: dto.customCruiseDetails || undefined,
    }
  }

  /**
   * Get a custom cruise component with details
   */
  async getCustomCruise(id: string): Promise<CustomCruiseComponentDto> {
    const baseComponent = await this.baseService.findById(id)
    const customCruiseDetails = await this.customCruiseDetailsService.findByComponentId(id)

    // Fetch component_pricing if it exists
    const [activityPricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.activityId, id))
      .limit(1)

    return {
      id: baseComponent.id,
      itineraryDayId: baseComponent.itineraryDayId,
      parentActivityId: baseComponent.parentActivityId || null,
      componentType: 'custom_cruise',
      activityType: 'custom_cruise',
      name: baseComponent.name,
      description: baseComponent.description || null,
      sequenceOrder: baseComponent.sequenceOrder,
      startDatetime: baseComponent.startDatetime?.toISOString() || null,
      endDatetime: baseComponent.endDatetime?.toISOString() || null,
      timezone: baseComponent.timezone || null,
      location: baseComponent.location || null,
      address: baseComponent.address || null,
      coordinates: baseComponent.coordinates || null,
      notes: baseComponent.notes || null,
      confirmationNumber: baseComponent.confirmationNumber || null,
      status: baseComponent.status,
      pricingType: baseComponent.pricingType || null,
      currency: baseComponent.currency,
      invoiceType: activityPricing?.invoiceType || null,
      totalPriceCents: activityPricing?.totalPriceCents || null,
      taxesAndFeesCents: activityPricing?.taxesAndFeesCents || null,
      activityPricingId: activityPricing?.id || null,
      commissionTotalCents: activityPricing?.commissionTotalCents || null,
      commissionSplitPercentage: activityPricing?.commissionSplitPercentage || null,
      commissionExpectedDate: activityPricing?.commissionExpectedDate || null,
      // Booking details
      termsAndConditions: activityPricing?.termsAndConditions || null,
      cancellationPolicy: activityPricing?.cancellationPolicy || null,
      supplier: activityPricing?.supplier || null,
      bookingReference: activityPricing?.bookingReference || null,
      netPriceCents: activityPricing?.netPriceCents ?? null,
      nonRefundableDeposit: activityPricing?.nonRefundableDeposit ?? null,
      cancellationScheduleJson: activityPricing?.cancellationScheduleJson as any[] || null,
      pricingBreakdownJson: activityPricing?.pricingBreakdownJson as any[] || null,
      photos: baseComponent.photos || null,
      createdAt: baseComponent.createdAt.toISOString(),
      updatedAt: baseComponent.updatedAt.toISOString(),
      customCruiseDetails: customCruiseDetails || undefined,
    }
  }

  /**
   * Update a custom cruise component with details (transactional)
   */
  async updateCustomCruise(id: string, dto: UpdateCustomCruiseComponentDto): Promise<CustomCruiseComponentDto> {
    // Update base component fields
    await this.baseService.update(id, {
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    })

    // Update custom cruise details if provided
    if (dto.customCruiseDetails) {
      const existingDetails = await this.customCruiseDetailsService.findByComponentId(id)
      if (existingDetails) {
        await this.customCruiseDetailsService.update(id, dto.customCruiseDetails)
      } else {
        await this.customCruiseDetailsService.create(id, dto.customCruiseDetails)
      }
    }

    // Update or create component_pricing if pricing or booking detail fields are provided
    const hasPricingUpdate = dto.totalPriceCents !== undefined ||
      dto.termsAndConditions !== undefined ||
      dto.cancellationPolicy !== undefined ||
      dto.supplier !== undefined ||
      dto.bookingReference !== undefined ||
      dto.pricingBreakdownJson !== undefined

    if (hasPricingUpdate) {
      const [existingPricing] = await this.db.client
        .select()
        .from(this.db.schema.activityPricing)
        .where(eq(this.db.schema.activityPricing.activityId, id))
        .limit(1)

      if (existingPricing) {
        // Update existing pricing - merge with existing values (undefined = keep existing, null = clear, value = update)
        await this.db.client
          .update(this.db.schema.activityPricing)
          .set({
            pricingType: dto.pricingType || existingPricing.pricingType,
            ...(dto.totalPriceCents !== null && dto.totalPriceCents !== undefined && {
              basePrice: (dto.totalPriceCents / 100).toFixed(2),
              totalPriceCents: dto.totalPriceCents,
            }),
            taxesAndFeesCents: dto.taxesAndFeesCents !== undefined ? dto.taxesAndFeesCents : existingPricing.taxesAndFeesCents,
            currency: dto.currency || existingPricing.currency,
            // Commission fields (update if provided, otherwise keep existing)
            commissionTotalCents: dto.commissionTotalCents !== undefined ? dto.commissionTotalCents : existingPricing.commissionTotalCents,
            commissionSplitPercentage: dto.commissionSplitPercentage !== undefined ? dto.commissionSplitPercentage?.toString() : existingPricing.commissionSplitPercentage,
            commissionExpectedDate: dto.commissionExpectedDate !== undefined ? dto.commissionExpectedDate : existingPricing.commissionExpectedDate,
            // Booking details (update if provided, otherwise keep existing)
            termsAndConditions: dto.termsAndConditions !== undefined ? dto.termsAndConditions : existingPricing.termsAndConditions,
            cancellationPolicy: dto.cancellationPolicy !== undefined ? dto.cancellationPolicy : existingPricing.cancellationPolicy,
            supplier: dto.supplier !== undefined ? dto.supplier : existingPricing.supplier,
            bookingReference: dto.bookingReference !== undefined ? dto.bookingReference : existingPricing.bookingReference,
            ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.activityPricing.id, existingPricing.id))
          .returning()
      } else if (dto.totalPriceCents !== null && dto.totalPriceCents !== undefined) {
        // Create new pricing record - get agencyId for RLS
        const agencyId = await this.getActivityAgencyId(id)
        await this.db.client.insert(this.db.schema.activityPricing).values({
          agencyId,
          activityId: id,
          pricingType: dto.pricingType || 'per_person',
          basePrice: (dto.totalPriceCents / 100).toFixed(2),
          totalPriceCents: dto.totalPriceCents,
          taxesAndFeesCents: dto.taxesAndFeesCents || null,
          currency: dto.currency || 'CAD',
          // Commission fields
          commissionTotalCents: dto.commissionTotalCents || null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() || null,
          commissionExpectedDate: dto.commissionExpectedDate || null,
          // Booking details
          termsAndConditions: dto.termsAndConditions || null,
          cancellationPolicy: dto.cancellationPolicy || null,
          supplier: dto.supplier || null,
          bookingReference: dto.bookingReference || null,
          ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
        })
      }
    }

    await this.markItineraryChangedForActivity(id)

    return this.getCustomCruise(id)
  }

  /**
   * Delete a custom cruise component (cascades to details via FK)
   */
  async deleteCustomCruise(id: string): Promise<void> {
    await this.markItineraryChangedForActivity(id)
    // Clean up storage files before database delete
    await this.cleanupComponentStorage(id)

    await this.baseService.delete(id)
    // Custom cruise details and documents are automatically deleted via CASCADE foreign key
  }

  // =============================================================================
  // Custom Tour Operations
  // =============================================================================

  /**
   * Create a custom tour component with details (transactional)
   */
  async createCustomTour(dto: CreateCustomTourComponentDto): Promise<CustomTourComponentDto> {
    // Get agencyId from itinerary day for RLS
    const agencyId = await this.getAgencyIdFromDayId(dto.itineraryDayId)

    // Create base component using the optimized method that returns full data
    const { component, activityPricing: initialPricing } = await this.baseService.create({
      agencyId,
      itineraryDayId: dto.itineraryDayId,
      componentType: 'custom_tour',
      activityType: 'custom_tour',
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    }, { returnDetails: true })

    // Create custom tour details if provided
    if (dto.customTourDetails) {
      await this.customTourDetailsService.create(component.id, dto.customTourDetails)
    }

    // Update activity_pricing if pricing fields are provided and get updated values
    let finalPricing = initialPricing
    const hasPricingData = dto.totalPriceCents !== undefined || dto.termsAndConditions ||
      dto.cancellationPolicy || dto.supplier || dto.commissionTotalCents !== undefined ||
      dto.bookingReference !== undefined || dto.pricingBreakdownJson !== undefined

    if (hasPricingData && initialPricing) {
      const [updatedPricing] = await this.db.client
        .update(this.db.schema.activityPricing)
        .set({
          pricingType: dto.pricingType || 'per_person',
          ...(dto.totalPriceCents !== undefined && dto.totalPriceCents !== null && {
            basePrice: (dto.totalPriceCents / 100).toFixed(2),
            totalPriceCents: dto.totalPriceCents,
          }),
          taxesAndFeesCents: dto.taxesAndFeesCents ?? null,
          currency: dto.currency || 'CAD',
          commissionTotalCents: dto.commissionTotalCents ?? null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() ?? null,
          commissionExpectedDate: dto.commissionExpectedDate ?? null,
          // Booking details
          termsAndConditions: dto.termsAndConditions ?? null,
          cancellationPolicy: dto.cancellationPolicy ?? null,
          supplier: dto.supplier ?? null,
          bookingReference: dto.bookingReference ?? null,
          updatedAt: new Date(),
        })
        .where(eq(this.db.schema.activityPricing.activityId, component.id))
        .returning()
      if (updatedPricing) {
        finalPricing = updatedPricing
      }
    }

    // Construct DTO directly from inserted/updated data (no re-fetch)
    return {
      id: component.id,
      itineraryDayId: component.itineraryDayId,
      parentActivityId: component.parentActivityId || null,
      componentType: 'custom_tour',
      activityType: 'custom_tour',
      name: component.name,
      description: component.description || null,
      sequenceOrder: component.sequenceOrder,
      startDatetime: component.startDatetime?.toISOString() || null,
      endDatetime: component.endDatetime?.toISOString() || null,
      timezone: component.timezone || null,
      location: component.location || null,
      address: component.address || null,
      coordinates: component.coordinates || null,
      notes: component.notes || null,
      confirmationNumber: component.confirmationNumber || null,
      status: component.status || 'proposed',
      pricingType: component.pricingType || null,
      currency: component.currency || 'CAD',
      invoiceType: finalPricing?.invoiceType || null,
      totalPriceCents: finalPricing?.totalPriceCents || null,
      taxesAndFeesCents: finalPricing?.taxesAndFeesCents || null,
      activityPricingId: finalPricing?.id || null,
      commissionTotalCents: finalPricing?.commissionTotalCents || null,
      commissionSplitPercentage: finalPricing?.commissionSplitPercentage || null,
      commissionExpectedDate: finalPricing?.commissionExpectedDate || null,
      termsAndConditions: finalPricing?.termsAndConditions || null,
      cancellationPolicy: finalPricing?.cancellationPolicy || null,
      supplier: finalPricing?.supplier || null,
      bookingReference: finalPricing?.bookingReference || null,
      netPriceCents: finalPricing?.netPriceCents ?? null,
      nonRefundableDeposit: finalPricing?.nonRefundableDeposit ?? null,
      cancellationScheduleJson: finalPricing?.cancellationScheduleJson as any[] || null,
      pricingBreakdownJson: finalPricing?.pricingBreakdownJson as any[] || null,
      photos: component.photos || null,
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
      customTourDetails: dto.customTourDetails || undefined,
    }
  }

  /**
   * Get a custom tour component with details
   */
  async getCustomTour(id: string): Promise<CustomTourComponentDto> {
    const baseComponent = await this.baseService.findById(id)
    const customTourDetails = await this.customTourDetailsService.findByComponentId(id)

    // Fetch component_pricing if it exists
    const [activityPricing] = await this.db.client
      .select()
      .from(this.db.schema.activityPricing)
      .where(eq(this.db.schema.activityPricing.activityId, id))
      .limit(1)

    return {
      id: baseComponent.id,
      itineraryDayId: baseComponent.itineraryDayId,
      parentActivityId: baseComponent.parentActivityId || null,
      componentType: 'custom_tour',
      activityType: 'custom_tour',
      name: baseComponent.name,
      description: baseComponent.description || null,
      sequenceOrder: baseComponent.sequenceOrder,
      startDatetime: baseComponent.startDatetime?.toISOString() || null,
      endDatetime: baseComponent.endDatetime?.toISOString() || null,
      timezone: baseComponent.timezone || null,
      location: baseComponent.location || null,
      address: baseComponent.address || null,
      coordinates: baseComponent.coordinates || null,
      notes: baseComponent.notes || null,
      confirmationNumber: baseComponent.confirmationNumber || null,
      status: baseComponent.status,
      pricingType: baseComponent.pricingType || null,
      currency: baseComponent.currency,
      invoiceType: activityPricing?.invoiceType || null,
      totalPriceCents: activityPricing?.totalPriceCents || null,
      taxesAndFeesCents: activityPricing?.taxesAndFeesCents || null,
      activityPricingId: activityPricing?.id || null,
      commissionTotalCents: activityPricing?.commissionTotalCents || null,
      commissionSplitPercentage: activityPricing?.commissionSplitPercentage || null,
      commissionExpectedDate: activityPricing?.commissionExpectedDate || null,
      // Booking details
      termsAndConditions: activityPricing?.termsAndConditions || null,
      cancellationPolicy: activityPricing?.cancellationPolicy || null,
      supplier: activityPricing?.supplier || null,
      bookingReference: activityPricing?.bookingReference || null,
      netPriceCents: activityPricing?.netPriceCents ?? null,
      nonRefundableDeposit: activityPricing?.nonRefundableDeposit ?? null,
      cancellationScheduleJson: activityPricing?.cancellationScheduleJson as any[] || null,
      pricingBreakdownJson: activityPricing?.pricingBreakdownJson as any[] || null,
      photos: baseComponent.photos || null,
      createdAt: baseComponent.createdAt.toISOString(),
      updatedAt: baseComponent.updatedAt.toISOString(),
      customTourDetails: customTourDetails || undefined,
    }
  }

  /**
   * Update a custom tour component with details (transactional)
   */
  async updateCustomTour(id: string, dto: UpdateCustomTourComponentDto): Promise<CustomTourComponentDto> {
    // Update base component fields
    await this.baseService.update(id, {
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      confirmationNumber: dto.confirmationNumber,
      status: dto.status,
      pricingType: dto.pricingType,
      currency: dto.currency,
      photos: dto.photos,
    })

    // Update custom tour details if provided
    if (dto.customTourDetails) {
      const existingDetails = await this.customTourDetailsService.findByComponentId(id)
      if (existingDetails) {
        await this.customTourDetailsService.update(id, dto.customTourDetails)
      } else {
        await this.customTourDetailsService.create(id, dto.customTourDetails)
      }
    }

    // Update or create component_pricing if pricing or booking detail fields are provided
    const hasPricingUpdate = dto.totalPriceCents !== undefined ||
      dto.termsAndConditions !== undefined ||
      dto.cancellationPolicy !== undefined ||
      dto.supplier !== undefined ||
      dto.bookingReference !== undefined ||
      dto.pricingBreakdownJson !== undefined

    if (hasPricingUpdate) {
      const [existingPricing] = await this.db.client
        .select()
        .from(this.db.schema.activityPricing)
        .where(eq(this.db.schema.activityPricing.activityId, id))
        .limit(1)

      if (existingPricing) {
        // Update existing pricing - merge with existing values (undefined = keep existing, null = clear, value = update)
        await this.db.client
          .update(this.db.schema.activityPricing)
          .set({
            pricingType: dto.pricingType || existingPricing.pricingType,
            ...(dto.totalPriceCents !== null && dto.totalPriceCents !== undefined && {
              basePrice: (dto.totalPriceCents / 100).toFixed(2),
              totalPriceCents: dto.totalPriceCents,
            }),
            taxesAndFeesCents: dto.taxesAndFeesCents !== undefined ? dto.taxesAndFeesCents : existingPricing.taxesAndFeesCents,
            currency: dto.currency || existingPricing.currency,
            // Commission fields (update if provided, otherwise keep existing)
            commissionTotalCents: dto.commissionTotalCents !== undefined ? dto.commissionTotalCents : existingPricing.commissionTotalCents,
            commissionSplitPercentage: dto.commissionSplitPercentage !== undefined ? dto.commissionSplitPercentage?.toString() : existingPricing.commissionSplitPercentage,
            commissionExpectedDate: dto.commissionExpectedDate !== undefined ? dto.commissionExpectedDate : existingPricing.commissionExpectedDate,
            // Booking details (update if provided, otherwise keep existing)
            termsAndConditions: dto.termsAndConditions !== undefined ? dto.termsAndConditions : existingPricing.termsAndConditions,
            cancellationPolicy: dto.cancellationPolicy !== undefined ? dto.cancellationPolicy : existingPricing.cancellationPolicy,
            supplier: dto.supplier !== undefined ? dto.supplier : existingPricing.supplier,
            bookingReference: dto.bookingReference !== undefined ? dto.bookingReference : existingPricing.bookingReference,
            ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
            updatedAt: new Date(),
          })
          .where(eq(this.db.schema.activityPricing.id, existingPricing.id))
          .returning()
      } else if (dto.totalPriceCents !== null && dto.totalPriceCents !== undefined) {
        // Create new pricing record - get agencyId for RLS
        const agencyId = await this.getActivityAgencyId(id)
        await this.db.client.insert(this.db.schema.activityPricing).values({
          agencyId,
          activityId: id,
          pricingType: dto.pricingType || 'per_person',
          basePrice: (dto.totalPriceCents / 100).toFixed(2),
          totalPriceCents: dto.totalPriceCents,
          taxesAndFeesCents: dto.taxesAndFeesCents || null,
          currency: dto.currency || 'CAD',
          // Commission fields
          commissionTotalCents: dto.commissionTotalCents || null,
          commissionSplitPercentage: dto.commissionSplitPercentage?.toString() || null,
          commissionExpectedDate: dto.commissionExpectedDate || null,
          // Booking details
          termsAndConditions: dto.termsAndConditions || null,
          cancellationPolicy: dto.cancellationPolicy || null,
          supplier: dto.supplier || null,
          bookingReference: dto.bookingReference || null,
          ...(dto.pricingBreakdownJson !== undefined && { pricingBreakdownJson: dto.pricingBreakdownJson }),
        })
      }
    }

    await this.markItineraryChangedForActivity(id)

    return this.getCustomTour(id)
  }

  /**
   * Delete a custom tour component (cascades to details and tour_day children via FK)
   */
  async deleteCustomTour(id: string): Promise<void> {
    // Clean up storage files before database delete
    await this.cleanupComponentStorage(id)

    await this.baseService.delete(id)
    // Custom tour details, tour day children, and documents are automatically deleted via CASCADE foreign key
  }

  // =============================================================================
  // Tour Day Operations
  // =============================================================================

  /**
   * Create a tour day component (child of custom_tour)
   */
  async createTourDay(dto: CreateTourDayComponentDto): Promise<TourDayComponentDto> {
    // Get agencyId from itinerary day for RLS
    const agencyId = await this.getAgencyIdFromDayId(dto.itineraryDayId)

    // Create base component
    const { component } = await this.baseService.create({
      agencyId,
      itineraryDayId: dto.itineraryDayId,
      parentActivityId: dto.parentActivityId,
      componentType: 'tour_day',
      activityType: 'tour_day',
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      status: dto.status,
    }, { returnDetails: true })

    // Create tour day details if provided
    if (dto.tourDayDetails) {
      await this.tourDayDetailsService.create(component.id, dto.tourDayDetails)
    }

    // Return constructed DTO
    return {
      id: component.id,
      itineraryDayId: component.itineraryDayId,
      parentActivityId: component.parentActivityId || null,
      componentType: 'tour_day',
      activityType: 'tour_day',
      name: component.name,
      description: component.description || null,
      sequenceOrder: component.sequenceOrder,
      startDatetime: component.startDatetime?.toISOString() || null,
      endDatetime: component.endDatetime?.toISOString() || null,
      timezone: component.timezone || null,
      location: component.location || null,
      address: component.address || null,
      coordinates: component.coordinates || null,
      notes: component.notes || null,
      confirmationNumber: null,
      status: component.status || 'proposed',
      pricingType: null,
      currency: 'CAD',
      invoiceType: null,
      totalPriceCents: null,
      taxesAndFeesCents: null,
      activityPricingId: null,
      commissionTotalCents: null,
      commissionSplitPercentage: null,
      commissionExpectedDate: null,
      termsAndConditions: null,
      cancellationPolicy: null,
      supplier: null,
      bookingReference: null,
      netPriceCents: null,
      nonRefundableDeposit: null,
      cancellationScheduleJson: null,
      pricingBreakdownJson: null,
      photos: null,
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
      tourDayDetails: dto.tourDayDetails || undefined,
    }
  }

  /**
   * Get a tour day component
   */
  async getTourDay(id: string): Promise<TourDayComponentDto> {
    const baseComponent = await this.baseService.findById(id)
    const tourDayDetails = await this.tourDayDetailsService.findByComponentId(id)

    return {
      id: baseComponent.id,
      itineraryDayId: baseComponent.itineraryDayId,
      parentActivityId: baseComponent.parentActivityId || null,
      componentType: 'tour_day',
      activityType: 'tour_day',
      name: baseComponent.name,
      description: baseComponent.description || null,
      sequenceOrder: baseComponent.sequenceOrder,
      startDatetime: baseComponent.startDatetime?.toISOString() || null,
      endDatetime: baseComponent.endDatetime?.toISOString() || null,
      timezone: baseComponent.timezone || null,
      location: baseComponent.location || null,
      address: baseComponent.address || null,
      coordinates: baseComponent.coordinates || null,
      notes: baseComponent.notes || null,
      confirmationNumber: null,
      status: baseComponent.status,
      pricingType: null,
      currency: baseComponent.currency,
      invoiceType: null,
      totalPriceCents: null,
      taxesAndFeesCents: null,
      activityPricingId: null,
      commissionTotalCents: null,
      commissionSplitPercentage: null,
      commissionExpectedDate: null,
      termsAndConditions: null,
      cancellationPolicy: null,
      supplier: null,
      bookingReference: null,
      netPriceCents: null,
      nonRefundableDeposit: null,
      cancellationScheduleJson: null,
      pricingBreakdownJson: null,
      photos: null,
      createdAt: baseComponent.createdAt.toISOString(),
      updatedAt: baseComponent.updatedAt.toISOString(),
      tourDayDetails: tourDayDetails || undefined,
    }
  }

  /**
   * Update a tour day component
   */
  async updateTourDay(id: string, dto: UpdateTourDayComponentDto): Promise<TourDayComponentDto> {
    // Update base component fields
    await this.baseService.update(id, {
      name: dto.name,
      description: dto.description,
      sequenceOrder: dto.sequenceOrder,
      startDatetime: dto.startDatetime,
      endDatetime: dto.endDatetime,
      timezone: dto.timezone,
      location: dto.location,
      address: dto.address,
      coordinates: dto.coordinates,
      notes: dto.notes,
      status: dto.status,
    })

    // Update tour day details if provided
    if (dto.tourDayDetails) {
      await this.tourDayDetailsService.upsert(id, dto.tourDayDetails)
    }

    await this.markItineraryChangedForActivity(id)

    return this.getTourDay(id)
  }

  /**
   * Delete a tour day component
   */
  async deleteTourDay(id: string): Promise<void> {
    await this.markItineraryChangedForActivity(id)
    await this.baseService.delete(id)
  }

  // ============================================================================
  // Tour Day Schedule Generation
  // ============================================================================

  /**
   * Generate tour day entries for a custom tour.
   * Creates tour_day activities for each day of the tour, linked via parentActivityId.
   *
   * Uses itinerary data from the catalog (tour_itinerary_days) or from
   * the customTourDetails.itineraryJson snapshot.
   *
   * This method is idempotent - calling it multiple times will delete existing
   * entries and recreate them (CASCADE delete via parentActivityId FK).
   *
   * @param tourId - The ID of the custom_tour component
   * @param tourData - Optional tour data to avoid re-fetching
   * @returns Object with created tour_day IDs and count of deleted entries
   */
  async generateTourDaySchedule(
    tourId: string,
    tourData?: {
      itineraryId: string
      customTourDetails: {
        tourId?: string // catalog tour ID
        departureStartDate?: string
        departureEndDate?: string
        days?: number
        itineraryJson?: Array<{
          dayNumber: number
          title?: string
          description?: string
          overnightCity?: string
        }>
      }
      skipDelete?: boolean
      autoExtendItinerary?: boolean
    }
  ): Promise<{
    created: TourDayComponentDto[]
    deleted: number
  }> {
    let itineraryId: string
    let tourDetails: {
      tourId?: string
      departureStartDate?: string
      departureEndDate?: string
      days?: number
      itineraryJson?: Array<{
        dayNumber: number
        title?: string
        description?: string
        overnightCity?: string
      }>
    }

    if (tourData) {
      // Use provided tour data (avoids DB queries)
      // Validate the tour exists and belongs to the provided itinerary
      const [tourActivity] = await this.db.client
        .select({
          id: this.db.schema.itineraryActivities.id,
          itineraryDayId: this.db.schema.itineraryActivities.itineraryDayId,
          itineraryId: this.db.schema.itineraryDays.itineraryId,
        })
        .from(this.db.schema.itineraryActivities)
        .innerJoin(
          this.db.schema.itineraryDays,
          eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id)
        )
        .where(eq(this.db.schema.itineraryActivities.id, tourId))
        .limit(1)

      if (!tourActivity) {
        throw new BadRequestException('Tour component not found')
      }

      if (tourActivity.itineraryId !== tourData.itineraryId) {
        throw new BadRequestException('Tour does not belong to the specified itinerary')
      }

      itineraryId = tourData.itineraryId
      tourDetails = tourData.customTourDetails
    } else {
      // Fetch tour data from database
      const tour = await this.getCustomTour(tourId)
      if (!tour) {
        throw new BadRequestException('Tour component not found')
      }

      // Get itinerary ID from the activity's day
      if (!tour.itineraryDayId) {
        throw new BadRequestException('Tour has no associated itinerary day')
      }
      const [day] = await this.db.client
        .select({ itineraryId: this.db.schema.itineraryDays.itineraryId })
        .from(this.db.schema.itineraryDays)
        .where(eq(this.db.schema.itineraryDays.id, tour.itineraryDayId))
        .limit(1)

      if (!day) {
        throw new BadRequestException('Tour day not found')
      }

      itineraryId = day.itineraryId
      // Convert null values to undefined for type compatibility
      const details = tour.customTourDetails
      tourDetails = details ? {
        tourId: details.tourId ?? undefined,
        departureStartDate: details.departureStartDate ?? undefined,
        departureEndDate: details.departureEndDate ?? undefined,
        days: details.days ?? undefined,
        itineraryJson: details.itineraryJson?.map(d => ({
          dayNumber: d.dayNumber,
          title: d.title ?? undefined,
          description: d.description ?? undefined,
          overnightCity: d.overnightCity ?? undefined,
        })),
      } : {}
    }

    // Get itinerary days data - either from snapshot or catalog
    let itineraryDaysData: Array<{
      dayNumber: number
      title?: string
      description?: string
      overnightCity?: string
    }> = []

    if (tourDetails.itineraryJson && tourDetails.itineraryJson.length > 0) {
      // Use snapshot data from customTourDetails
      itineraryDaysData = tourDetails.itineraryJson
    } else if (tourDetails.tourId) {
      // Fetch from catalog using the linked tour ID
      const catalogTourId = tourDetails.tourId
      const catalogDays = await this.db.db
        .select()
        .from(tourItineraryDays)
        .where(eq(tourItineraryDays.tourId, catalogTourId))
        .orderBy(asc(tourItineraryDays.dayNumber))

      itineraryDaysData = catalogDays.map((day) => ({
        dayNumber: day.dayNumber,
        title: day.title ?? undefined,
        description: day.description ?? undefined,
        overnightCity: day.overnightCity ?? undefined,
      }))
    }

    if (itineraryDaysData.length === 0 && tourDetails.days) {
      // No itinerary data available, generate placeholder days
      for (let i = 1; i <= tourDetails.days; i++) {
        itineraryDaysData.push({
          dayNumber: i,
          title: `Day ${i}`,
        })
      }
    }

    if (itineraryDaysData.length === 0) {
      return { created: [], deleted: 0 }
    }

    // Delete existing tour_day activities if any
    let deleted = 0
    if (!tourData?.skipDelete) {
      const existingDays = await this.db.client
        .select({ id: this.db.schema.itineraryActivities.id })
        .from(this.db.schema.itineraryActivities)
        .where(eq(this.db.schema.itineraryActivities.parentActivityId, tourId))

      for (const day of existingDays) {
        await this.deleteTourDay(day.id)
        deleted++
      }
    }

    // Parse departure start date to calculate day dates
    const startDate = tourDetails.departureStartDate
      ? new Date(tourDetails.departureStartDate)
      : new Date()

    // Build list of dates needed for the tour
    const tourDuration = itineraryDaysData.length
    const neededDates: string[] = []
    for (let i = 0; i < tourDuration; i++) {
      const dayDate = new Date(startDate)
      dayDate.setDate(dayDate.getDate() + i)
      const dateStr = dayDate.toISOString().split('T')[0]
      if (dateStr) {
        neededDates.push(dateStr)
      }
    }

    // Get existing itinerary days
    const itinerary = await this.itineraryDaysService.findAll(itineraryId)
    const itineraryDaysByDate = new Map<string, { id: string; date: string }>(
      itinerary
        .filter((d): d is typeof d & { date: string } => d.date !== null)
        .map((d) => [d.date, { id: d.id, date: d.date }])
    )

    // Check if we need to extend the itinerary
    const missingDates = neededDates.filter((date) => !itineraryDaysByDate.has(date))
    if (missingDates.length > 0) {
      if (tourData?.autoExtendItinerary) {
        // Auto-extend itinerary by creating missing days using bulk method
        const createdDays = await this.itineraryDaysService.findOrCreateByDateRange(itineraryId, missingDates)
        // Add newly created days to the map
        for (const d of createdDays) {
          if (d.date) {
            itineraryDaysByDate.set(d.date, { id: d.id, date: d.date })
          }
        }
      } else {
        throw new BadRequestException(
          `Itinerary does not have days for the full tour duration. Missing dates: ${missingDates.join(', ')}. ` +
            `Set autoExtendItinerary=true to auto-create the required days.`
        )
      }
    }

    // Create tour_day activities for each day
    const created: TourDayComponentDto[] = []

    for (const dayData of itineraryDaysData) {
      const dayIndex = dayData.dayNumber - 1
      const dayDate = neededDates[dayIndex]
      if (!dayDate) {
        this.logger.warn(`No date calculated for tour day ${dayData.dayNumber}, skipping`)
        continue
      }

      const itineraryDay = itineraryDaysByDate.get(dayDate)
      if (!itineraryDay) {
        this.logger.warn(`No itinerary day found for date ${dayDate}, skipping tour day ${dayData.dayNumber}`)
        continue
      }

      const tourDay = await this.createTourDay({
        itineraryDayId: itineraryDay.id,
        parentActivityId: tourId,
        componentType: 'tour_day',
        name: dayData.title || `Day ${dayData.dayNumber}`,
        description: dayData.description,
        status: 'proposed',
        tourDayDetails: {
          dayNumber: dayData.dayNumber,
          overnightCity: dayData.overnightCity,
          isLocked: true, // Locked by default - read-only from parent tour
        },
      })

      created.push(tourDay)
    }

    return { created, deleted }
  }

  /**
   * Create Port Info components from a cruise's port calls JSON
   * Converts portCallsJson entries into individual Port Info components
   *
   * @param cruiseId - The ID of the custom cruise component
   * @returns Array of created Port Info component IDs
   */
  async createPortEntriesFromCruise(cruiseId: string): Promise<{ created: string[]; skipped: number }> {
    // Get the cruise component
    const cruise = await this.getCustomCruise(cruiseId)
    if (!cruise) {
      throw new BadRequestException('Cruise component not found')
    }

    const portCalls = cruise.customCruiseDetails?.portCallsJson || []
    if (portCalls.length === 0) {
      return { created: [], skipped: 0 }
    }

    const createdIds: string[] = []
    let skipped = 0

    for (const portCall of portCalls) {
      // Skip sea days
      const portName = portCall.portName?.toLowerCase() || ''
      if (portName.includes('at sea') || portName.includes('sea day') || portName === '') {
        skipped++
        continue
      }

      // Create Port Info component on the same day as the cruise
      // Note: Phase 2 enhancement could match ports to specific itinerary days by date
      const portInfo = await this.createPortInfo({
        itineraryDayId: cruise.itineraryDayId,
        componentType: 'port_info',
        name: portCall.portName,
        status: 'proposed',
        portInfoDetails: {
          portName: portCall.portName,
          arrivalDate: portCall.arriveDate || null,
          arrivalTime: portCall.arriveTime || null,
          departureDate: portCall.departDate || null,
          departureTime: portCall.departTime || null,
          coordinates: portCall.latitude && portCall.longitude
            ? { lat: parseFloat(portCall.latitude), lng: parseFloat(portCall.longitude) }
            : null,
          tenderRequired: portCall.tender || false,
        },
      })

      createdIds.push(portInfo.id)
    }

    return { created: createdIds, skipped }
  }

  // ============================================================================
  // Cruise Port Schedule Generation
  // ============================================================================

  /**
   * Generate port schedule entries for a custom cruise.
   * Creates port_info activities for each day of the cruise, linked via parentActivityId.
   *
   * Uses portCallsJson from cruise details to get actual port names and times.
   * Falls back to departurePort/arrivalPort for first/last day if no portCallsJson.
   *
   * This method is idempotent - calling it multiple times will delete existing
   * entries and recreate them (CASCADE delete via parentActivityId FK).
   *
   * ## Performance Characteristics
   *
   * **Target:** ~4 seconds (network-bound)
   *
   * The remaining latency is constrained by network round-trips to the remote Supabase
   * database (~300-500ms per query). Key operations:
   * - Ownership validation: ~300ms (single lightweight query)
   * - Day upsert: ~1000ms (bulk upsert with ON CONFLICT)
   * - Activity bulk insert: ~400ms
   * - Port details bulk insert: ~400ms
   *
   * **Optimizations applied:**
   * - Bulk operations reduce per-item overhead
   * - Optional cruiseData parameter skips ~1500ms of re-fetching
   * - Optional skipDelete flag avoids unnecessary delete query for new cruises
   * - DTOs constructed from local data (avoids N+1 re-fetch after insert)
   *
   * **Further optimization potential:**
   * - Database connection pooling improvements
   * - Moving more logic to database procedures
   * - Using database-side JSON processing
   *
   * @param cruiseId - The ID of the custom cruise component
   * @param cruiseData - Optional cruise data to avoid re-fetching (use when calling right after creation)
   * @returns Object with created port_info IDs and count of deleted entries
   */
  async generateCruisePortSchedule(
    cruiseId: string,
    cruiseData?: {
      itineraryId: string
      customCruiseDetails: {
        departureDate: string
        arrivalDate: string
        portCallsJson?: any[]
        departurePort?: string | null
        arrivalPort?: string | null
      }
      /** Skip deleting existing port activities (for newly created cruises) */
      skipDelete?: boolean
      /** Auto-extend itinerary dates to fit the cruise (instead of throwing an error) */
      autoExtendItinerary?: boolean
    }
  ): Promise<{
    created: PortInfoComponentDto[]
    deleted: number
  }> {
    const totalStart = Date.now()
    const timings: Record<string, number> = {}

    let stepStart: number
    let itineraryId: string
    let cruiseDetails: {
      departureDate: string
      arrivalDate: string
      portCallsJson?: any[]
      departurePort?: string | null
      arrivalPort?: string | null
    }

    if (cruiseData) {
      // Use provided cruise data (avoids ~1000ms+ of DB queries)
      // VALIDATION: Verify the cruise exists and belongs to the provided itinerary
      stepStart = Date.now()
      const [cruiseActivity] = await this.db.client
        .select({
          id: this.db.schema.itineraryActivities.id,
          itineraryDayId: this.db.schema.itineraryActivities.itineraryDayId,
          itineraryId: this.db.schema.itineraryDays.itineraryId,
        })
        .from(this.db.schema.itineraryActivities)
        .innerJoin(
          this.db.schema.itineraryDays,
          eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id)
        )
        .where(eq(this.db.schema.itineraryActivities.id, cruiseId))
        .limit(1)
      timings['validateOwnership'] = Date.now() - stepStart

      if (!cruiseActivity) {
        throw new BadRequestException('Cruise activity not found')
      }

      if (cruiseActivity.itineraryId !== cruiseData.itineraryId) {
        // Use 400 (not 403) to avoid leaking information about resource existence
        throw new BadRequestException('Provided itineraryId does not match cruise ownership')
      }

      // VALIDATION: If skipDelete is requested, verify no existing children
      // This prevents skipping delete on cruises that already have port activities
      if (cruiseData.skipDelete) {
        stepStart = Date.now()
        const hasChildren = await this.activitiesService.hasChildActivities(cruiseId)
        timings['checkExistingChildren'] = Date.now() - stepStart

        if (hasChildren) {
          // Use debug level to avoid log noise in production
          this.logger.debug({
            message: 'skipDelete ignored - cruise already has child activities',
            cruiseId,
            itineraryId: cruiseData.itineraryId,
          })
          // Override skipDelete - must delete existing activities
          cruiseData.skipDelete = false
        }
      }

      itineraryId = cruiseData.itineraryId
      cruiseDetails = cruiseData.customCruiseDetails
      timings['getCruise'] = 0
      timings['getCruiseDay'] = 0
    } else {
      // Fetch cruise data from database
      stepStart = Date.now()
      const cruise = await this.getCustomCruise(cruiseId)
      timings['getCruise'] = Date.now() - stepStart
      if (!cruise) {
        throw new BadRequestException('Cruise component not found')
      }

      if (!cruise.customCruiseDetails) {
        throw new BadRequestException('Cruise details not found')
      }
      cruiseDetails = cruise.customCruiseDetails as typeof cruiseDetails

      // Cruises must be linked to a day to generate port schedules
      if (!cruise.itineraryDayId) {
        throw new BadRequestException('Cruise must be linked to a day to generate port schedule')
      }

      // Get the itinerary ID from the day the cruise is on
      stepStart = Date.now()
      const [cruiseDay] = await this.db.client
        .select()
        .from(this.db.schema.itineraryDays)
        .where(eq(this.db.schema.itineraryDays.id, cruise.itineraryDayId))
        .limit(1)
      timings['getCruiseDay'] = Date.now() - stepStart

      if (!cruiseDay) {
        throw new BadRequestException('Cruise day not found')
      }

      if (!cruiseDay.itineraryId) {
        throw new BadRequestException('Cruise day has no associated itinerary')
      }

      itineraryId = cruiseDay.itineraryId
    }

    // Validate cruise has required dates (use cruise details dates, not base activity dates)
    if (!cruiseDetails.departureDate || !cruiseDetails.arrivalDate) {
      throw new BadRequestException('Cruise must have departure and arrival dates to generate port schedule')
    }

    // Validate cruise dates fall within itinerary dates
    // Fetch the itinerary to get its date bounds
    stepStart = Date.now()
    const [itinerary] = await this.db.client
      .select({
        startDate: this.db.schema.itineraries.startDate,
        endDate: this.db.schema.itineraries.endDate,
      })
      .from(this.db.schema.itineraries)
      .where(eq(this.db.schema.itineraries.id, itineraryId))
      .limit(1)
    timings['getItineraryDates'] = Date.now() - stepStart

    if (itinerary?.startDate && itinerary?.endDate) {
      const itineraryStart = new Date(itinerary.startDate + 'T00:00:00')
      const itineraryEnd = new Date(itinerary.endDate + 'T00:00:00')
      const cruiseDeparture = new Date(cruiseDetails.departureDate + 'T00:00:00')
      const cruiseArrival = new Date(cruiseDetails.arrivalDate + 'T00:00:00')

      if (cruiseDeparture < itineraryStart || cruiseArrival > itineraryEnd) {
        if (cruiseData?.autoExtendItinerary) {
          // Auto-extend itinerary dates to accommodate the cruise
          const newStartDate = cruiseDeparture < itineraryStart ? cruiseDetails.departureDate : itinerary.startDate
          const newEndDate = cruiseArrival > itineraryEnd ? cruiseDetails.arrivalDate : itinerary.endDate

          stepStart = Date.now()
          await this.db.client
            .update(this.db.schema.itineraries)
            .set({ startDate: newStartDate, endDate: newEndDate })
            .where(eq(this.db.schema.itineraries.id, itineraryId))
          timings['extendItineraryDates'] = Date.now() - stepStart

          this.logger.log({
            message: 'Auto-extended itinerary dates to accommodate cruise',
            itineraryId,
            originalDates: { start: itinerary.startDate, end: itinerary.endDate },
            newDates: { start: newStartDate, end: newEndDate },
            cruiseDates: { departure: cruiseDetails.departureDate, arrival: cruiseDetails.arrivalDate },
          })
        } else {
          throw new BadRequestException(
            `Cruise dates (${cruiseDetails.departureDate} to ${cruiseDetails.arrivalDate}) ` +
            `do not fit within itinerary dates (${itinerary.startDate} to ${itinerary.endDate}). ` +
            `Please select a cruise that departs on or after ${itinerary.startDate} and returns by ${itinerary.endDate}, ` +
            `or adjust the itinerary dates to accommodate this cruise.`
          )
        }
      }
    }

    // Delete any existing port_info activities linked to this cruise
    // Note: CASCADE delete will handle port_info_details automatically
    // Skip for newly created cruises (no existing activities to delete)
    let deletedCount = 0
    if (cruiseData?.skipDelete) {
      timings['deleteExisting'] = 0
    } else {
      stepStart = Date.now()
      deletedCount = await this.activitiesService.deleteByParentId(cruiseId)
      timings['deleteExisting'] = Date.now() - stepStart
    }

    // Parse cruise dates from cruise details (departureDate/arrivalDate)
    const startDate = new Date(cruiseDetails.departureDate + 'T00:00:00')
    const endDate = new Date(cruiseDetails.arrivalDate + 'T00:00:00')

    // Validate dates are valid and in correct order
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid cruise dates')
    }
    if (endDate < startDate) {
      throw new BadRequestException('Cruise arrival date must be on or after departure date')
    }

    // Calculate number of days (inclusive)
    const dayCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Get port calls from cruise details - indexed by day number
    const portCalls = cruiseDetails.portCallsJson || []
    const portCallsByDay = new Map<number, any>()
    for (const portCall of portCalls) {
      if (portCall.day) {
        portCallsByDay.set(portCall.day, portCall)
      }
    }

    // ========================================================================
    // OPTIMIZED BULK OPERATIONS
    // ========================================================================

    // Step 1: Compute all dates upfront
    // Use UTC methods consistently to match autoGenerate (itinerary-days.service.ts)
    const allDates: string[] = []
    for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
      const currentDate = new Date(startDate)
      currentDate.setUTCDate(startDate.getUTCDate() + dayIndex)
      allDates.push(currentDate.toISOString().split('T')[0]!)
    }



    // Step 2: Bulk find/create all itinerary days in one operation
    stepStart = Date.now()
    const itineraryDays = await this.itineraryDaysService.findOrCreateByDateRange(itineraryId, allDates)
    timings['findOrCreateDays'] = Date.now() - stepStart

    // Create a map of date -> itinerary day for easy lookup
    const daysByDate = new Map<string, { id: string; date: string | null }>()
    for (const day of itineraryDays) {
      if (day.date) {
        daysByDate.set(day.date, day)
      }
    }

    // Step 3: Compute all port info data upfront
    interface PortInfoData {
      itineraryDayId: string
      dateStr: string
      portType: PortType
      portName: string
      description: string
      arrivalTime: string | null
      departureTime: string | null
      tenderRequired: boolean
      currentDateISO: string
      coordinates: { lat: number; lng: number } | null
    }

    const portInfoDataList: PortInfoData[] = []

    for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
      const dateStr = allDates[dayIndex]!
      const itineraryDay = daysByDate.get(dateStr)

      if (!itineraryDay) {
        this.logger.warn(`No itinerary day found for date ${dateStr}, skipping`)
        continue
      }

      const currentDate = new Date(startDate)
      currentDate.setUTCDate(startDate.getUTCDate() + dayIndex)

      // Cruise day number is 1-indexed (dayIndex 0 = day 1)
      const cruiseDayNumber = dayIndex + 1
      const portCall = portCallsByDay.get(cruiseDayNumber)

      // Determine port type and details from portCallsJson
      let portType: PortType
      let portName: string
      let description: string
      let arrivalTime: string | null = null
      let departureTime: string | null = null
      let tenderRequired = false

      // Parse coordinates from port call data (if available from catalog enrichment)
      let coordinates: { lat: number; lng: number } | null = null

      if (portCall) {
        // Use port call data from Traveltek
        portName = portCall.portName || 'Unknown Port'
        tenderRequired = portCall.tender || false
        arrivalTime = portCall.arriveTime !== '00:00:00' ? portCall.arriveTime : null
        departureTime = portCall.departTime !== '00:00:00' ? portCall.departTime : null

        // Extract coordinates from catalog-enriched port call data
        // Guard: reject null, undefined, empty/whitespace strings; allow numeric 0 (valid equator/meridian)
        const latRaw = portCall.latitude
        const lngRaw = portCall.longitude
        const hasLat = latRaw !== null && latRaw !== undefined && String(latRaw).trim() !== ''
        const hasLng = lngRaw !== null && lngRaw !== undefined && String(lngRaw).trim() !== ''
        if (hasLat && hasLng) {
          const parsedLat = Number(latRaw)
          const parsedLng = Number(lngRaw)
          if (
            Number.isFinite(parsedLat) && Number.isFinite(parsedLng) &&
            parsedLat >= -90 && parsedLat <= 90 &&
            parsedLng >= -180 && parsedLng <= 180
          ) {
            coordinates = { lat: parsedLat, lng: parsedLng }
          }
        }

        if (portCall.isSeaDay) {
          portType = 'sea_day'
          portName = 'At Sea'
          description = 'Day at sea'
          coordinates = null // Sea days have no meaningful coordinates
        } else if (dayIndex === 0) {
          portType = 'departure'
          description = `Embarkation at ${portName}`
        } else if (dayIndex === dayCount - 1) {
          portType = 'arrival'
          description = `Disembarkation at ${portName}`
        } else {
          portType = 'port_call'
          description = tenderRequired ? `Port of call (tender required)` : 'Port of call'
        }
      } else {
        // Fallback if no portCallsJson data for this day
        if (dayIndex === 0) {
          portType = 'departure'
          portName = cruiseDetails.departurePort || 'Departure Port'
          description = `Embarkation at ${portName}`
        } else if (dayIndex === dayCount - 1) {
          portType = 'arrival'
          portName = cruiseDetails.arrivalPort || 'Arrival Port'
          description = `Disembarkation at ${portName}`
        } else {
          portType = 'sea_day'
          portName = 'At Sea'
          description = 'Day at sea'
        }
      }

      portInfoDataList.push({
        itineraryDayId: itineraryDay.id,
        dateStr,
        portType,
        portName,
        description,
        arrivalTime,
        departureTime,
        tenderRequired,
        currentDateISO: currentDate.toISOString(),
        coordinates,
      })
    }

    // Step 4: Bulk insert all port_info activities
    // Get agencyId from the cruise for RLS
    const agencyId = await this.getActivityAgencyId(cruiseId)

    const activitiesToCreate = portInfoDataList.map((data, idx) => ({
      itineraryDayId: data.itineraryDayId,
      parentActivityId: cruiseId,
      activityType: 'port_info' as const,
      name: data.portName,
      description: data.description,
      sequenceOrder: idx,
      startDatetime: data.currentDateISO,
      status: 'proposed' as const,
      location: data.portName,
      coordinates: data.coordinates,
    }))

    stepStart = Date.now()
    const createdActivities = await this.activitiesService.bulkCreate(agencyId, activitiesToCreate)
    timings['bulkCreateActivities'] = Date.now() - stepStart

    // Step 5: Bulk insert all port_info_details
    const portInfoDetailsToCreate = createdActivities.map((activity, idx) => {
      const data = portInfoDataList[idx]!
      return {
        activityId: activity.id,
        data: {
          portName: data.portName,
          portType: data.portType,
          arrivalDate: data.portType === 'arrival' || data.portType === 'port_call' ? data.dateStr : null,
          arrivalTime: data.arrivalTime,
          departureDate: data.portType === 'departure' || data.portType === 'port_call' ? data.dateStr : null,
          departureTime: data.departureTime,
          tenderRequired: data.tenderRequired,
          coordinates: data.coordinates,
        },
      }
    })

    stepStart = Date.now()
    await this.portInfoDetailsService.bulkCreate(portInfoDetailsToCreate)
    timings['bulkCreateDetails'] = Date.now() - stepStart

    // Step 5b: Update itinerary day start/end locations from port coordinates
    // Non-blocking — if this fails, port schedule still works
    try {
      const dayLocationUpdates = portInfoDataList
        .filter(data => data.coordinates && data.portType !== 'sea_day')
        .map(data => ({
          dayId: data.itineraryDayId,
          portName: data.portName,
          lat: String(data.coordinates!.lat),
          lng: String(data.coordinates!.lng),
        }))

      if (dayLocationUpdates.length > 0) {
        stepStart = Date.now()
        const now = new Date()

        // Update days in parallel — guard start/end overrides independently
        await Promise.all(dayLocationUpdates.map(async (update) => {
          // Update start location (only if not manually overridden)
          await this.db.client
            .update(this.db.schema.itineraryDays)
            .set({
              startLocationName: update.portName,
              startLocationLat: update.lat,
              startLocationLng: update.lng,
              updatedAt: now,
            })
            .where(
              and(
                eq(this.db.schema.itineraryDays.id, update.dayId),
                or(
                  eq(this.db.schema.itineraryDays.startLocationOverride, false),
                  isNull(this.db.schema.itineraryDays.startLocationOverride),
                ),
              ),
            )

          // Update end location (only if not manually overridden)
          await this.db.client
            .update(this.db.schema.itineraryDays)
            .set({
              endLocationName: update.portName,
              endLocationLat: update.lat,
              endLocationLng: update.lng,
              updatedAt: now,
            })
            .where(
              and(
                eq(this.db.schema.itineraryDays.id, update.dayId),
                or(
                  eq(this.db.schema.itineraryDays.endLocationOverride, false),
                  isNull(this.db.schema.itineraryDays.endLocationOverride),
                ),
              ),
            )
        }))

        // Mark itinerary as having unpublished changes
        await this.db.client
          .update(this.db.schema.itineraries)
          .set({ hasUnpublishedChanges: true })
          .where(eq(this.db.schema.itineraries.id, itineraryId))

        timings['updateDayLocations'] = Date.now() - stepStart
        this.logger.log({
          message: 'Updated itinerary day locations from port coordinates',
          cruiseId,
          itineraryId,
          daysUpdated: dayLocationUpdates.length,
        })
      }
    } catch (error) {
      this.logger.warn({
        message: 'Failed to update itinerary day locations from port coordinates (non-blocking)',
        cruiseId,
        itineraryId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // Step 6: Construct port info DTOs directly from local data (no N+1 queries)
    // We have all the data we need from portInfoDataList and createdActivities
    const now = new Date().toISOString()
    const createdPortInfos: PortInfoComponentDto[] = createdActivities.map((activity, idx) => {
      const data = portInfoDataList[idx]!
      const detailsData = portInfoDetailsToCreate[idx]!.data
      return {
        id: activity.id,
        itineraryDayId: activity.itineraryDayId,
        parentActivityId: cruiseId,
        componentType: 'port_info' as const,
        activityType: 'port_info' as const,
        name: activity.name,
        description: data.description,
        sequenceOrder: idx,
        startDatetime: data.currentDateISO,
        endDatetime: null,
        timezone: null,
        location: data.portName,
        address: null,
        coordinates: data.coordinates,
        notes: null,
        confirmationNumber: null,
        status: 'proposed' as const,
        pricingType: null,
        currency: 'USD',
        totalPriceCents: null,
        taxesAndFeesCents: null,
        activityPricingId: null,
        invoiceType: null,
        commissionTotalCents: null,
        commissionSplitPercentage: null,
        commissionExpectedDate: null,
        termsAndConditions: null,
        cancellationPolicy: null,
        supplier: null,
        bookingReference: null,
        netPriceCents: null,
        nonRefundableDeposit: null,
        cancellationScheduleJson: null,
        pricingBreakdownJson: null,
        photos: null,
        createdAt: now,
        updatedAt: now,
        portInfoDetails: {
          portType: detailsData.portType,
          portName: detailsData.portName,
          portLocation: null,
          arrivalDate: detailsData.arrivalDate,
          arrivalTime: detailsData.arrivalTime,
          departureDate: detailsData.departureDate,
          departureTime: detailsData.departureTime,
          timezone: null,
          dockName: null,
          address: null,
          coordinates: data.coordinates,
          phone: null,
          website: null,
          excursionNotes: null,
          tenderRequired: detailsData.tenderRequired,
          specialRequests: null,
        },
      }
    })

    const totalDuration = Date.now() - totalStart
    // Use debug level for performance metrics to avoid noise in production logs
    this.logger.debug({
      message: 'Port schedule generation completed',
      event: 'port_schedule_generation_ms',
      duration: totalDuration,
      dayCount,
      cruiseId,
      itineraryId,
      exceeded_target: totalDuration > 1000,
      timings,
    })

    return {
      created: createdPortInfos,
      deleted: deletedCount,
    }
  }

  /**
   * Get all port schedule entries for a cruise
   * Returns port_info activities linked via parentActivityId
   */
  async getCruisePortSchedule(cruiseId: string): Promise<PortInfoComponentDto[]> {
    // Get child activities (port_info entries)
    const childActivities = await this.activitiesService.findByParentId(cruiseId)

    // Convert to full PortInfoComponentDto with details
    const portInfos: PortInfoComponentDto[] = []
    for (const activity of childActivities) {
      if (activity.activityType === 'port_info') {
        const portInfo = await this.getPortInfo(activity.id)
        portInfos.push(portInfo)
      }
    }

    return portInfos
  }
}

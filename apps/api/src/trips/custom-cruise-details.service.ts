/**
 * Custom Cruise Details Service
 *
 * Handles CRUD operations for custom cruise-specific data.
 * Works with the custom_cruise_details table.
 * Traveltek-aligned field structure for manual entry and future API ingestion.
 */

import { Injectable, BadRequestException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { CustomCruiseDetailsDto, CruiseSource, CruisePortCall } from '@tailfire/shared-types'

// Valid source types (must match DB CHECK constraint)
const VALID_SOURCES: CruiseSource[] = ['traveltek', 'manual']

// UUID v4 regex pattern for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Validates a UUID string and returns null if invalid
 * Prevents database errors from invalid foreign key references
 */
function validateUuid(value: string | null | undefined): string | null {
  if (!value) return null
  return UUID_REGEX.test(value) ? value : null
}

@Injectable()
export class CustomCruiseDetailsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get custom cruise details for a component
   */
  async findByComponentId(activityId: string): Promise<CustomCruiseDetailsDto | null> {
    const [details] = await this.db.client
      .select()
      .from(this.db.schema.customCruiseDetails)
      .where(eq(this.db.schema.customCruiseDetails.activityId, activityId))
      .limit(1)

    if (!details) {
      return null
    }

    return this.formatCustomCruiseDetails(details)
  }

  /**
   * Create custom cruise details for a component
   */
  async create(activityId: string, data: CustomCruiseDetailsDto): Promise<void> {
    // Validate enums
    this.validateEnums(data)

    // Validate numeric constraints
    this.validateNumericConstraints(data)

    await this.db.client.insert(this.db.schema.customCruiseDetails).values({
      activityId,

      // Traveltek Identity
      traveltekCruiseId: data.traveltekCruiseId || null,
      source: data.source || 'manual',

      // Cruise Line Information
      cruiseLineName: data.cruiseLineName || null,
      cruiseLineCode: data.cruiseLineCode || null,
      cruiseLineId: validateUuid(data.cruiseLineId),
      shipName: data.shipName || null,
      shipCode: data.shipCode || null,
      shipClass: data.shipClass || null,
      shipImageUrl: data.shipImageUrl || null,
      cruiseShipId: validateUuid(data.cruiseShipId),

      // Voyage Details
      itineraryName: data.itineraryName || null,
      voyageCode: data.voyageCode || null,
      region: data.region || null,
      cruiseRegionId: validateUuid(data.cruiseRegionId),
      nights: data.nights ?? null,
      seaDays: data.seaDays ?? null,

      // Departure Details
      departurePort: data.departurePort || null,
      departurePortId: validateUuid(data.departurePortId),
      departureDate: data.departureDate || null,
      departureTime: data.departureTime || null,
      departureTimezone: data.departureTimezone || null,

      // Arrival Details
      arrivalPort: data.arrivalPort || null,
      arrivalPortId: validateUuid(data.arrivalPortId),
      arrivalDate: data.arrivalDate || null,
      arrivalTime: data.arrivalTime || null,
      arrivalTimezone: data.arrivalTimezone || null,

      // Cabin Details
      cabinCategory: data.cabinCategory || null,
      cabinCode: data.cabinCode || null,
      cabinNumber: data.cabinNumber || null,
      cabinDeck: data.cabinDeck || null,
      cabinLocation: data.cabinLocation || null,
      cabinImageUrl: data.cabinImageUrl || null,
      cabinDescription: data.cabinDescription || null,

      // Booking Information
      bookingNumber: data.bookingNumber || null,
      fareCode: data.fareCode || null,
      bookingDeadline: data.bookingDeadline || null,

      // JSON Data
      portCallsJson: data.portCallsJson || [],
      cabinPricingJson: data.cabinPricingJson || {},
      shipContentJson: data.shipContentJson || {},

      // Import-specific data
      diningPreferences: data.diningPreferences || {},
      selectedExtras: data.selectedExtras || [],
      selectedPromotions: data.selectedPromotions || {},
      traveltekBookingId: data.traveltekBookingId ?? null,
      traveltekPortfolioId: data.traveltekPortfolioId ?? null,

      // Cruise-specific booking fields
      reservationNumber: data.reservationNumber || null,
      stateroomCategoryCode: data.stateroomCategoryCode || null,
      onboardCreditCents: data.onboardCreditCents ?? null,
      onboardCreditCurrency: data.onboardCreditCurrency || null,

      // Additional Details
      inclusions: data.inclusions || [],
      specialRequests: data.specialRequests || null,
    })

    // Sync booking_number → itinerary_activities.confirmation_number
    if (data.bookingNumber) {
      await this.db.client
        .update(this.db.schema.itineraryActivities)
        .set({ confirmationNumber: data.bookingNumber })
        .where(eq(this.db.schema.itineraryActivities.id, activityId))
    }
  }

  /**
   * Update custom cruise details for a component
   */
  async update(activityId: string, data: CustomCruiseDetailsDto): Promise<void> {
    // Validate enums if provided
    this.validateEnums(data)

    // Validate numeric constraints
    this.validateNumericConstraints(data)

    await this.db.client
      .update(this.db.schema.customCruiseDetails)
      .set({
        // Traveltek Identity
        ...(data.traveltekCruiseId !== undefined && { traveltekCruiseId: data.traveltekCruiseId }),
        ...(data.source !== undefined && { source: data.source }),

        // Cruise Line Information
        ...(data.cruiseLineName !== undefined && { cruiseLineName: data.cruiseLineName }),
        ...(data.cruiseLineCode !== undefined && { cruiseLineCode: data.cruiseLineCode }),
        ...(data.cruiseLineId !== undefined && { cruiseLineId: validateUuid(data.cruiseLineId) }),
        ...(data.shipName !== undefined && { shipName: data.shipName }),
        ...(data.shipCode !== undefined && { shipCode: data.shipCode }),
        ...(data.shipClass !== undefined && { shipClass: data.shipClass }),
        ...(data.shipImageUrl !== undefined && { shipImageUrl: data.shipImageUrl }),
        ...(data.cruiseShipId !== undefined && { cruiseShipId: validateUuid(data.cruiseShipId) }),

        // Voyage Details
        ...(data.itineraryName !== undefined && { itineraryName: data.itineraryName }),
        ...(data.voyageCode !== undefined && { voyageCode: data.voyageCode }),
        ...(data.region !== undefined && { region: data.region }),
        ...(data.cruiseRegionId !== undefined && { cruiseRegionId: validateUuid(data.cruiseRegionId) }),
        ...(data.nights !== undefined && { nights: data.nights }),
        ...(data.seaDays !== undefined && { seaDays: data.seaDays }),

        // Departure Details
        ...(data.departurePort !== undefined && { departurePort: data.departurePort }),
        ...(data.departurePortId !== undefined && { departurePortId: validateUuid(data.departurePortId) }),
        ...(data.departureDate !== undefined && { departureDate: data.departureDate }),
        ...(data.departureTime !== undefined && { departureTime: data.departureTime }),
        ...(data.departureTimezone !== undefined && { departureTimezone: data.departureTimezone }),

        // Arrival Details
        ...(data.arrivalPort !== undefined && { arrivalPort: data.arrivalPort }),
        ...(data.arrivalPortId !== undefined && { arrivalPortId: validateUuid(data.arrivalPortId) }),
        ...(data.arrivalDate !== undefined && { arrivalDate: data.arrivalDate }),
        ...(data.arrivalTime !== undefined && { arrivalTime: data.arrivalTime }),
        ...(data.arrivalTimezone !== undefined && { arrivalTimezone: data.arrivalTimezone }),

        // Cabin Details
        ...(data.cabinCategory !== undefined && { cabinCategory: data.cabinCategory }),
        ...(data.cabinCode !== undefined && { cabinCode: data.cabinCode }),
        ...(data.cabinNumber !== undefined && { cabinNumber: data.cabinNumber }),
        ...(data.cabinDeck !== undefined && { cabinDeck: data.cabinDeck }),
        ...(data.cabinLocation !== undefined && { cabinLocation: data.cabinLocation }),
        ...(data.cabinImageUrl !== undefined && { cabinImageUrl: data.cabinImageUrl }),
        ...(data.cabinDescription !== undefined && { cabinDescription: data.cabinDescription }),

        // Booking Information
        ...(data.bookingNumber !== undefined && { bookingNumber: data.bookingNumber }),
        ...(data.fareCode !== undefined && { fareCode: data.fareCode }),
        ...(data.bookingDeadline !== undefined && { bookingDeadline: data.bookingDeadline }),

        // JSON Data
        ...(data.portCallsJson !== undefined && { portCallsJson: data.portCallsJson }),
        ...(data.cabinPricingJson !== undefined && { cabinPricingJson: data.cabinPricingJson }),
        ...(data.shipContentJson !== undefined && { shipContentJson: data.shipContentJson }),

        // Import-specific data
        ...(data.diningPreferences !== undefined && { diningPreferences: data.diningPreferences }),
        ...(data.selectedExtras !== undefined && { selectedExtras: data.selectedExtras }),
        ...(data.selectedPromotions !== undefined && { selectedPromotions: data.selectedPromotions }),
        ...(data.traveltekBookingId !== undefined && { traveltekBookingId: data.traveltekBookingId }),
        ...(data.traveltekPortfolioId !== undefined && { traveltekPortfolioId: data.traveltekPortfolioId }),

        // Cruise-specific booking fields
        ...(data.reservationNumber !== undefined && { reservationNumber: data.reservationNumber }),
        ...(data.stateroomCategoryCode !== undefined && { stateroomCategoryCode: data.stateroomCategoryCode }),
        ...(data.onboardCreditCents !== undefined && { onboardCreditCents: data.onboardCreditCents }),
        ...(data.onboardCreditCurrency !== undefined && { onboardCreditCurrency: data.onboardCreditCurrency }),

        // Additional Details
        ...(data.inclusions !== undefined && { inclusions: data.inclusions }),
        ...(data.specialRequests !== undefined && { specialRequests: data.specialRequests }),

        updatedAt: new Date(),
      })
      .where(eq(this.db.schema.customCruiseDetails.activityId, activityId))

    // Sync booking_number → itinerary_activities.confirmation_number
    if (data.bookingNumber !== undefined) {
      await this.db.client
        .update(this.db.schema.itineraryActivities)
        .set({ confirmationNumber: data.bookingNumber || null })
        .where(eq(this.db.schema.itineraryActivities.id, activityId))
    }
  }

  /**
   * Delete custom cruise details (called automatically via cascade)
   */
  async delete(activityId: string): Promise<void> {
    await this.db.client
      .delete(this.db.schema.customCruiseDetails)
      .where(eq(this.db.schema.customCruiseDetails.activityId, activityId))
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Validate enum values for service-side validation
   * (DB also has CHECK constraints as backup)
   */
  private validateEnums(data: CustomCruiseDetailsDto): void {
    if (data.source !== undefined && data.source !== null) {
      if (!VALID_SOURCES.includes(data.source)) {
        throw new BadRequestException(
          `Invalid source: ${data.source}. Must be one of: ${VALID_SOURCES.join(', ')}`
        )
      }
    }
    // cabinCategory is now a free text field, no validation needed
  }

  /**
   * Validate numeric constraints for service-side validation
   * (DB also has CHECK constraints as backup)
   */
  private validateNumericConstraints(data: CustomCruiseDetailsDto): void {
    if (data.nights !== undefined && data.nights !== null && data.nights < 0) {
      throw new BadRequestException('nights must be >= 0')
    }
    if (data.seaDays !== undefined && data.seaDays !== null && data.seaDays < 0) {
      throw new BadRequestException('seaDays must be >= 0')
    }
  }

  private formatCustomCruiseDetails(details: any): CustomCruiseDetailsDto {
    return {
      // Traveltek Identity
      traveltekCruiseId: details.traveltekCruiseId || null,
      source: details.source || 'manual',

      // Cruise Line Information
      cruiseLineName: details.cruiseLineName || null,
      cruiseLineCode: details.cruiseLineCode || null,
      cruiseLineId: details.cruiseLineId || null,
      shipName: details.shipName || null,
      shipCode: details.shipCode || null,
      shipClass: details.shipClass || null,
      shipImageUrl: details.shipImageUrl || null,
      cruiseShipId: details.cruiseShipId || null,

      // Voyage Details
      itineraryName: details.itineraryName || null,
      voyageCode: details.voyageCode || null,
      region: details.region || null,
      cruiseRegionId: details.cruiseRegionId || null,
      nights: details.nights ?? null,
      seaDays: details.seaDays ?? null,

      // Departure Details
      departurePort: details.departurePort || null,
      departurePortId: details.departurePortId || null,
      departureDate: details.departureDate || null,
      departureTime: details.departureTime || null,
      departureTimezone: details.departureTimezone || null,

      // Arrival Details
      arrivalPort: details.arrivalPort || null,
      arrivalPortId: details.arrivalPortId || null,
      arrivalDate: details.arrivalDate || null,
      arrivalTime: details.arrivalTime || null,
      arrivalTimezone: details.arrivalTimezone || null,

      // Cabin Details
      cabinCategory: details.cabinCategory || null,
      cabinCode: details.cabinCode || null,
      cabinNumber: details.cabinNumber || null,
      cabinDeck: details.cabinDeck || null,
      cabinLocation: details.cabinLocation || null,
      cabinImageUrl: details.cabinImageUrl || null,
      cabinDescription: details.cabinDescription || null,

      // Booking Information
      bookingNumber: details.bookingNumber || null,
      fareCode: details.fareCode || null,
      bookingDeadline: details.bookingDeadline || null,

      // JSON Data - always return [] or {} not null
      portCallsJson: (details.portCallsJson || []) as CruisePortCall[],
      cabinPricingJson: details.cabinPricingJson || {},
      shipContentJson: details.shipContentJson || {},

      // Import-specific data
      diningPreferences: details.diningPreferences || {},
      selectedExtras: details.selectedExtras || [],
      selectedPromotions: details.selectedPromotions || {},
      traveltekBookingId: details.traveltekBookingId ?? null,
      traveltekPortfolioId: details.traveltekPortfolioId ?? null,

      // Cruise-specific booking fields
      reservationNumber: details.reservationNumber || null,
      stateroomCategoryCode: details.stateroomCategoryCode || null,
      onboardCreditCents: details.onboardCreditCents ?? null,
      onboardCreditCurrency: details.onboardCreditCurrency || null,

      // Additional Details
      inclusions: details.inclusions || [],
      specialRequests: details.specialRequests || null,
    }
  }
}

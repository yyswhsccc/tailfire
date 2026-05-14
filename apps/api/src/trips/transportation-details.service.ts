/**
 * Transportation Details Service
 *
 * Handles CRUD operations for transportation-specific data.
 * Works with the transportation_details table.
 */

import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { TransportationDetailsDto } from '@tailfire/shared-types'
import {
  coerce,
  buildCreateValues,
  buildUpdateSet,
  formatFields,
  type FieldMap,
} from './detail-mapper'

// ============================================================================
// Field Maps (42 fields total)
// ============================================================================

/** CREATE: Apply appropriate coercion per field */
const TRANSPORTATION_CREATE_FIELDS: FieldMap = {
  subtype: coerce.toNullable,
  providerName: coerce.toNullable,
  providerPhone: coerce.toNullable,
  providerEmail: coerce.toNullable,
  vehicleType: coerce.toNullable,
  vehicleModel: coerce.toNullable,
  vehicleCapacity: coerce.toNullable,
  licensePlate: coerce.toNullable,
  pickupDate: coerce.toNullable,
  pickupTime: coerce.toNullable,
  pickupTimezone: coerce.toNullable,
  pickupAddress: coerce.toNullable,
  pickupNotes: coerce.toNullable,
  dropoffDate: coerce.toNullable,
  dropoffTime: coerce.toNullable,
  dropoffTimezone: coerce.toNullable,
  dropoffAddress: coerce.toNullable,
  dropoffNotes: coerce.toNullable,
  driverName: coerce.toNullable,
  driverPhone: coerce.toNullable,
  rentalPickupLocation: coerce.toNullable,
  rentalDropoffLocation: coerce.toNullable,
  rentalInsuranceType: coerce.toNullable,
  rentalMileageLimit: coerce.toNullable,
  features: coerce.toArray, // || []
  specialRequests: coerce.toNullable,
  flightNumber: coerce.toNullable,
  pickupName: coerce.toNullable,
  pickupLat: coerce.toNullableStrict, // ?? null — preserves 0 (equator)
  pickupLng: coerce.toNullableStrict,
  pickupPlaceId: coerce.toNullable,
  dropoffName: coerce.toNullable,
  dropoffLat: coerce.toNullableStrict,
  dropoffLng: coerce.toNullableStrict,
  dropoffPlaceId: coerce.toNullable,
  rentalCompany: coerce.toNullable,
  rentalBookingRef: coerce.toNullable,
  rentalCarClass: coerce.toNullable,
  rentalFuelPolicy: coerce.toNullable,
  departureStation: coerce.toNullable,
  arrivalStation: coerce.toNullable,
  legs: coerce.identity, // jsonb — pass through as array (or null)
  isRoundTrip: coerce.toBoolInt, // ? 1 : 0
}

/** UPDATE: Identity for most, toBoolInt for isRoundTrip */
const TRANSPORTATION_UPDATE_FIELDS: FieldMap = {
  subtype: coerce.identity,
  providerName: coerce.identity,
  providerPhone: coerce.identity,
  providerEmail: coerce.identity,
  vehicleType: coerce.identity,
  vehicleModel: coerce.identity,
  vehicleCapacity: coerce.identity,
  licensePlate: coerce.identity,
  pickupDate: coerce.toNullable,
  pickupTime: coerce.toNullable,
  pickupTimezone: coerce.identity,
  pickupAddress: coerce.identity,
  pickupNotes: coerce.identity,
  dropoffDate: coerce.toNullable,
  dropoffTime: coerce.toNullable,
  dropoffTimezone: coerce.identity,
  dropoffAddress: coerce.identity,
  dropoffNotes: coerce.identity,
  driverName: coerce.identity,
  driverPhone: coerce.identity,
  rentalPickupLocation: coerce.identity,
  rentalDropoffLocation: coerce.identity,
  rentalInsuranceType: coerce.identity,
  rentalMileageLimit: coerce.identity,
  features: coerce.identity, // Pass as-is on update
  specialRequests: coerce.identity,
  flightNumber: coerce.identity,
  pickupName: coerce.identity,
  pickupLat: coerce.identity,
  pickupLng: coerce.identity,
  pickupPlaceId: coerce.identity,
  dropoffName: coerce.identity,
  dropoffLat: coerce.identity,
  dropoffLng: coerce.identity,
  dropoffPlaceId: coerce.identity,
  rentalCompany: coerce.identity,
  rentalBookingRef: coerce.identity,
  rentalCarClass: coerce.identity,
  rentalFuelPolicy: coerce.identity,
  departureStation: coerce.identity,
  arrivalStation: coerce.identity,
  legs: coerce.identity, // jsonb — pass through as array (or null) on update
  isRoundTrip: coerce.toBoolInt, // ALWAYS converts (current behavior)
}

/** FORMAT: toNullable for most, toArray for features, fromBoolInt for isRoundTrip */
const TRANSPORTATION_FORMAT_FIELDS: FieldMap = {
  subtype: coerce.toNullable,
  providerName: coerce.toNullable,
  providerPhone: coerce.toNullable,
  providerEmail: coerce.toNullable,
  vehicleType: coerce.toNullable,
  vehicleModel: coerce.toNullable,
  vehicleCapacity: coerce.toNullable,
  licensePlate: coerce.toNullable,
  pickupDate: coerce.toNullable,
  pickupTime: coerce.toNullable,
  pickupTimezone: coerce.toNullable,
  pickupAddress: coerce.toNullable,
  pickupNotes: coerce.toNullable,
  dropoffDate: coerce.toNullable,
  dropoffTime: coerce.toNullable,
  dropoffTimezone: coerce.toNullable,
  dropoffAddress: coerce.toNullable,
  dropoffNotes: coerce.toNullable,
  driverName: coerce.toNullable,
  driverPhone: coerce.toNullable,
  rentalPickupLocation: coerce.toNullable,
  rentalDropoffLocation: coerce.toNullable,
  rentalInsuranceType: coerce.toNullable,
  rentalMileageLimit: coerce.toNullable,
  features: coerce.toArray, // || []
  specialRequests: coerce.toNullable,
  flightNumber: coerce.toNullable,
  pickupName: coerce.toNullable,
  pickupLat: coerce.toNumber, // numeric → JS number
  pickupLng: coerce.toNumber,
  pickupPlaceId: coerce.toNullable,
  dropoffName: coerce.toNullable,
  dropoffLat: coerce.toNumber,
  dropoffLng: coerce.toNumber,
  dropoffPlaceId: coerce.toNullable,
  rentalCompany: coerce.toNullable,
  rentalBookingRef: coerce.toNullable,
  rentalCarClass: coerce.toNullable,
  rentalFuelPolicy: coerce.toNullable,
  departureStation: coerce.toNullable,
  arrivalStation: coerce.toNullable,
  legs: coerce.identity, // jsonb — DB returns array (or null) directly
  isRoundTrip: coerce.fromBoolInt, // === 1
}

@Injectable()
export class TransportationDetailsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get transportation details for a component
   */
  async findByComponentId(activityId: string): Promise<TransportationDetailsDto | null> {
    const [details] = await this.db.client
      .select()
      .from(this.db.schema.transportationDetails)
      .where(eq(this.db.schema.transportationDetails.activityId, activityId))
      .limit(1)

    if (!details) {
      return null
    }

    return this.formatTransportationDetails(details)
  }

  /**
   * Create transportation details for a component
   */
  async create(activityId: string, data: TransportationDetailsDto): Promise<void> {
    const values = buildCreateValues(data as Record<string, unknown>, TRANSPORTATION_CREATE_FIELDS)
    await this.db.client.insert(this.db.schema.transportationDetails).values({
      activityId,
      ...values,
    })
  }

  /**
   * Update transportation details for a component
   */
  async update(activityId: string, data: TransportationDetailsDto): Promise<void> {
    const updateSet = buildUpdateSet(data as Record<string, unknown>, TRANSPORTATION_UPDATE_FIELDS)
    await this.db.client
      .update(this.db.schema.transportationDetails)
      .set(updateSet)
      .where(eq(this.db.schema.transportationDetails.activityId, activityId))
  }

  /**
   * Delete transportation details (called automatically via cascade)
   */
  async delete(activityId: string): Promise<void> {
    await this.db.client
      .delete(this.db.schema.transportationDetails)
      .where(eq(this.db.schema.transportationDetails.activityId, activityId))
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private formatTransportationDetails(details: Record<string, unknown>): TransportationDetailsDto {
    return formatFields(details, TRANSPORTATION_FORMAT_FIELDS) as TransportationDetailsDto
  }
}

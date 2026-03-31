/**
 * Flight Details Service
 *
 * Handles CRUD operations for flight-specific data.
 * Works with the flight_details table.
 */

import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { FlightDetailsDto } from '@tailfire/shared-types'
import {
  coerce,
  buildCreateValues,
  buildUpdateSet,
  formatFields,
  type FieldMap,
} from './detail-mapper'

// ============================================================================
// Field Maps
// ============================================================================

/** CREATE: Apply || null coercion to all fields */
const FLIGHT_CREATE_FIELDS: FieldMap = {
  airline: coerce.toNullable,
  flightNumber: coerce.toNullable,
  departureAirportCode: coerce.toNullable,
  departureDate: coerce.toNullable,
  departureTime: coerce.toNullable,
  departureTimezone: coerce.toNullable,
  departureTerminal: coerce.toNullable,
  departureGate: coerce.toNullable,
  arrivalAirportCode: coerce.toNullable,
  arrivalDate: coerce.toNullable,
  arrivalTime: coerce.toNullable,
  arrivalTimezone: coerce.toNullable,
  arrivalTerminal: coerce.toNullable,
  arrivalGate: coerce.toNullable,
}

/** UPDATE: Pass through as-is (preserves empty strings) */
const FLIGHT_UPDATE_FIELDS: FieldMap = {
  airline: coerce.identity,
  flightNumber: coerce.identity,
  departureAirportCode: coerce.identity,
  departureDate: coerce.toNullable,
  departureTime: coerce.toNullable,
  departureTimezone: coerce.identity,
  departureTerminal: coerce.identity,
  departureGate: coerce.identity,
  arrivalAirportCode: coerce.identity,
  arrivalDate: coerce.toNullable,
  arrivalTime: coerce.toNullable,
  arrivalTimezone: coerce.identity,
  arrivalTerminal: coerce.identity,
  arrivalGate: coerce.identity,
}

/** FORMAT: Same as create (|| null) */
const FLIGHT_FORMAT_FIELDS: FieldMap = FLIGHT_CREATE_FIELDS

@Injectable()
export class FlightDetailsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get flight details for a component
   */
  async findByComponentId(activityId: string): Promise<FlightDetailsDto | null> {
    const [details] = await this.db.client
      .select()
      .from(this.db.schema.flightDetails)
      .where(eq(this.db.schema.flightDetails.activityId, activityId))
      .limit(1)

    if (!details) {
      return null
    }

    return this.formatFlightDetails(details)
  }

  /**
   * Create flight details for a component
   */
  async create(activityId: string, data: FlightDetailsDto): Promise<void> {
    const values = buildCreateValues(data as Record<string, unknown>, FLIGHT_CREATE_FIELDS)
    await this.db.client.insert(this.db.schema.flightDetails).values({
      activityId,
      ...values,
    })
  }

  /**
   * Update flight details for a component
   */
  async update(activityId: string, data: FlightDetailsDto): Promise<void> {
    const updateSet = buildUpdateSet(data as Record<string, unknown>, FLIGHT_UPDATE_FIELDS)
    await this.db.client
      .update(this.db.schema.flightDetails)
      .set(updateSet)
      .where(eq(this.db.schema.flightDetails.activityId, activityId))
  }

  /**
   * Delete flight details (called automatically via cascade)
   */
  async delete(activityId: string): Promise<void> {
    await this.db.client
      .delete(this.db.schema.flightDetails)
      .where(eq(this.db.schema.flightDetails.activityId, activityId))
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private formatFlightDetails(details: Record<string, unknown>): FlightDetailsDto {
    return formatFields(details, FLIGHT_FORMAT_FIELDS) as FlightDetailsDto
  }
}

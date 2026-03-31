/**
 * Lodging Details Service
 *
 * Handles CRUD operations for lodging-specific data.
 * Works with the lodging_details table.
 *
 * Uses detail-mapper for standardized field transformations:
 * - Create: ?? null for strings, ?? [] for arrays
 * - Update: identity (preserves values), special handling for date/count fields
 * - Format: || null for all fields (preserves existing API response shape)
 */

import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { LodgingDetailsDto } from '@tailfire/shared-types'
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

/**
 * CREATE: Use ?? null (toNullableStrict) for strings, ?? [] for arrays.
 * Note: checkInDate, checkOutDate, roomCount have defaults handled separately.
 */
const LODGING_CREATE_FIELDS: FieldMap = {
  propertyName: coerce.toNullableStrict,
  address: coerce.toNullableStrict,
  phone: coerce.toNullableStrict,
  website: coerce.toNullableStrict,
  checkInTime: coerce.toNullableStrict,
  checkOutTime: coerce.toNullableStrict,
  timezone: coerce.toNullableStrict,
  roomType: coerce.toNullableStrict,
  specialRequests: coerce.toNullableStrict,
  amenities: coerce.toArray,
}

/**
 * UPDATE: Identity (pass through as-is) for most fields.
 * Note: checkInDate, checkOutDate, roomCount have special null handling done separately.
 */
const LODGING_UPDATE_FIELDS: FieldMap = {
  propertyName: coerce.identity,
  address: coerce.identity,
  phone: coerce.identity,
  website: coerce.identity,
  checkInTime: coerce.toNullable,
  checkOutTime: coerce.toNullable,
  timezone: coerce.identity,
  roomType: coerce.identity,
  specialRequests: coerce.identity,
  amenities: coerce.identity,
}

/**
 * FORMAT: Use || null for all fields (existing API response shape).
 * Note: amenities formats to null (not []) to match current behavior.
 */
const LODGING_FORMAT_FIELDS: FieldMap = {
  propertyName: coerce.toNullable,
  address: coerce.toNullable,
  phone: coerce.toNullable,
  website: coerce.toNullable,
  checkInDate: coerce.toNullable,
  checkInTime: coerce.toNullable,
  checkOutDate: coerce.toNullable,
  checkOutTime: coerce.toNullable,
  timezone: coerce.toNullable,
  roomType: coerce.toNullable,
  roomCount: coerce.toNullable,
  amenities: coerce.toNullable,
  specialRequests: coerce.toNullable,
}

@Injectable()
export class LodgingDetailsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get lodging details for a component
   */
  async findByComponentId(activityId: string): Promise<LodgingDetailsDto | null> {
    const [details] = await this.db.client
      .select()
      .from(this.db.schema.lodgingDetails)
      .where(eq(this.db.schema.lodgingDetails.activityId, activityId))
      .limit(1)

    if (!details) {
      return null
    }

    return formatFields(details, LODGING_FORMAT_FIELDS) as LodgingDetailsDto
  }

  /**
   * Create lodging details for a component
   */
  async create(activityId: string, data: LodgingDetailsDto): Promise<void> {
    const values = buildCreateValues(data, LODGING_CREATE_FIELDS)

    await this.db.client.insert(this.db.schema.lodgingDetails).values({
      activityId,
      ...values,
      // Special defaults: checkInDate/checkOutDate default to today, roomCount defaults to 1
      checkInDate: data.checkInDate ?? new Date().toISOString().split('T')[0],
      checkOutDate: data.checkOutDate ?? new Date().toISOString().split('T')[0],
      roomCount: data.roomCount ?? 1,
    } as any)
  }

  /**
   * Update lodging details for a component
   */
  async update(activityId: string, data: LodgingDetailsDto): Promise<void> {
    const set = buildUpdateSet(data, LODGING_UPDATE_FIELDS)

    // Special handling: checkInDate, checkOutDate, roomCount skip update if null
    // (preserves existing behavior where null doesn't overwrite)
    if (data.checkInDate !== undefined && data.checkInDate !== null) {
      set.checkInDate = data.checkInDate
    }
    if (data.checkOutDate !== undefined && data.checkOutDate !== null) {
      set.checkOutDate = data.checkOutDate
    }
    if (data.roomCount !== undefined && data.roomCount !== null) {
      set.roomCount = data.roomCount
    }

    await this.db.client
      .update(this.db.schema.lodgingDetails)
      .set(set)
      .where(eq(this.db.schema.lodgingDetails.activityId, activityId))
  }

  /**
   * Delete lodging details (called automatically via cascade)
   */
  async delete(activityId: string): Promise<void> {
    await this.db.client
      .delete(this.db.schema.lodgingDetails)
      .where(eq(this.db.schema.lodgingDetails.activityId, activityId))
  }
}

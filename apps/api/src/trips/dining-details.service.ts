/**
 * Dining Details Service
 *
 * Handles CRUD operations for dining-specific data.
 * Works with the dining_details table.
 *
 * Uses detail-mapper for standardized field transformations:
 * - Create: || null for all fields (dietaryRequirements also || null on create)
 * - Update: identity (preserves values)
 * - Format: || null for most fields, || [] for dietaryRequirements
 */

import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { DiningDetailsDto } from '@tailfire/shared-types'
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
 * CREATE: Use || null for all fields.
 * Note: dietaryRequirements uses || null on create (not []).
 */
const DINING_CREATE_FIELDS: FieldMap = {
  restaurantName: coerce.toNullable,
  cuisineType: coerce.toNullable,
  mealType: coerce.toNullable,
  reservationDate: coerce.toNullable,
  reservationTime: coerce.toNullable,
  timezone: coerce.toNullable,
  partySize: coerce.toNullable,
  address: coerce.toNullable,
  phone: coerce.toNullable,
  website: coerce.toNullable,
  coordinates: coerce.toNullable,
  priceRange: coerce.toNullable,
  dressCode: coerce.toNullable,
  dietaryRequirements: coerce.toNullable,
  specialRequests: coerce.toNullable,
  menuUrl: coerce.toNullable,
}

/**
 * UPDATE: Identity (pass through as-is) for all fields.
 */
const DINING_UPDATE_FIELDS: FieldMap = {
  restaurantName: coerce.identity,
  cuisineType: coerce.identity,
  mealType: coerce.identity,
  reservationDate: coerce.toNullable,
  reservationTime: coerce.toNullable,
  timezone: coerce.identity,
  partySize: coerce.identity,
  address: coerce.identity,
  phone: coerce.identity,
  website: coerce.identity,
  coordinates: coerce.identity,
  priceRange: coerce.identity,
  dressCode: coerce.identity,
  dietaryRequirements: coerce.identity,
  specialRequests: coerce.identity,
  menuUrl: coerce.identity,
}

/**
 * FORMAT: Use || null for most fields, || [] for dietaryRequirements.
 * Note: dietaryRequirements uses || [] on format (different from create).
 */
const DINING_FORMAT_FIELDS: FieldMap = {
  restaurantName: coerce.toNullable,
  cuisineType: coerce.toNullable,
  mealType: coerce.toNullable,
  reservationDate: coerce.toNullable,
  reservationTime: coerce.toNullable,
  timezone: coerce.toNullable,
  partySize: coerce.toNullable,
  address: coerce.toNullable,
  phone: coerce.toNullable,
  website: coerce.toNullable,
  coordinates: coerce.toNullable,
  priceRange: coerce.toNullable,
  dressCode: coerce.toNullable,
  dietaryRequirements: coerce.toArray,
  specialRequests: coerce.toNullable,
  menuUrl: coerce.toNullable,
}

@Injectable()
export class DiningDetailsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Get dining details for a component
   */
  async findByComponentId(activityId: string): Promise<DiningDetailsDto | null> {
    const [details] = await this.db.client
      .select()
      .from(this.db.schema.diningDetails)
      .where(eq(this.db.schema.diningDetails.activityId, activityId))
      .limit(1)

    if (!details) {
      return null
    }

    return formatFields(details, DINING_FORMAT_FIELDS) as DiningDetailsDto
  }

  /**
   * Create dining details for a component
   */
  async create(activityId: string, data: DiningDetailsDto): Promise<void> {
    const values = buildCreateValues(data, DINING_CREATE_FIELDS)

    await this.db.client.insert(this.db.schema.diningDetails).values({
      activityId,
      ...values,
    })
  }

  /**
   * Update dining details for a component
   */
  async update(activityId: string, data: DiningDetailsDto): Promise<void> {
    const set = buildUpdateSet(data, DINING_UPDATE_FIELDS)

    await this.db.client
      .update(this.db.schema.diningDetails)
      .set(set)
      .where(eq(this.db.schema.diningDetails.activityId, activityId))
  }

  /**
   * Delete dining details (called automatically via cascade)
   */
  async delete(activityId: string): Promise<void> {
    await this.db.client
      .delete(this.db.schema.diningDetails)
      .where(eq(this.db.schema.diningDetails.activityId, activityId))
  }
}

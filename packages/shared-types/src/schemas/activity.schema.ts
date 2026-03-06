/**
 * Activity Schemas
 *
 * Zod schemas for Activity DTOs.
 * Mirrors existing DTO shapes from activities.types.ts.
 */

import { z } from 'zod'
import {
  activityTypeSchema,
  activityStatusSchema,
  pricingTypeSchema,
} from './enums.schema'
import { coordinatesSchema, photoSchema } from './common.schema'

const pricingBreakdownItemSchema = z.object({
  label: z.string(),
  priceCents: z.number().int(),
  travelerId: z.string().uuid().optional(),
})

// =============================================================================
// Create Activity DTO Schema
// =============================================================================

/**
 * Schema for creating a new activity.
 * Matches the existing CreateActivityDto interface.
 */
export const createActivityDtoSchema = z.object({
  tripId: z.string().uuid().nullable().optional(), // Required for floating packages (no itineraryDayId)
  itineraryDayId: z.string().uuid().nullable().optional(), // Nullable for floating packages
  parentActivityId: z.string().uuid().nullable().optional(),
  activityType: activityTypeSchema,
  name: z.string().min(1, 'Activity name is required'),
  description: z.string().nullable().optional(),
  sequenceOrder: z.number().int().nonnegative().optional(),

  // Timing - all nullable/optional
  startDatetime: z.string().nullable().optional(),
  endDatetime: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),

  // Location - all nullable/optional
  location: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  coordinates: coordinatesSchema.nullable().optional(),

  // Details - all nullable/optional
  notes: z.string().nullable().optional(),
  confirmationNumber: z.string().nullable().optional(),
  status: activityStatusSchema.optional(),

  // Pricing - all nullable/optional
  pricingType: pricingTypeSchema.nullable().optional(),
  currency: z.string().length(3).optional(),
  totalPriceCents: z.number().int().nonnegative().optional(),
  taxesCents: z.number().int().nonnegative().optional(),
  commissionTotalCents: z.number().int().nonnegative().nullable().optional(),
  commissionSplitPercentage: z.number().min(0).max(100).nullable().optional(),

  // Per-person pricing breakdown
  pricingBreakdownJson: z.array(pricingBreakdownItemSchema).nullable().optional(),

  // Media - nullable/optional
  photos: z.array(photoSchema).nullable().optional(),

  // Package-specific: activities to link immediately after creation
  activityIds: z.array(z.string().uuid()).optional(),
})

export type CreateActivityDto = z.infer<typeof createActivityDtoSchema>

// =============================================================================
// Update Activity DTO Schema
// =============================================================================

/**
 * Schema for updating an activity.
 * All fields optional for PATCH operation.
 */
export const updateActivityDtoSchema = z.object({
  activityType: activityTypeSchema.optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  sequenceOrder: z.number().int().nonnegative().optional(),

  // Timing
  startDatetime: z.string().nullable().optional(),
  endDatetime: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),

  // Location
  location: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  coordinates: coordinatesSchema.nullable().optional(),

  // Details
  notes: z.string().nullable().optional(),
  confirmationNumber: z.string().nullable().optional(),
  status: activityStatusSchema.optional(),

  // Update-only fields
  isBooked: z.boolean().optional(),
  isVisibleInCalendar: z.boolean().optional(),
  bookingDate: z.string().nullable().optional(),

  // Pricing
  pricingType: pricingTypeSchema.nullable().optional(),
  currency: z.string().length(3).optional(),
  totalPriceCents: z.number().int().nonnegative().optional(),
  taxesCents: z.number().int().nonnegative().optional(),
  commissionTotalCents: z.number().int().nonnegative().nullable().optional(),
  commissionSplitPercentage: z.number().min(0).max(100).nullable().optional(),

  // Per-person pricing breakdown
  pricingBreakdownJson: z.array(pricingBreakdownItemSchema).nullable().optional(),

  // Media
  photos: z.array(photoSchema).nullable().optional(),
})

export type UpdateActivityDto = z.infer<typeof updateActivityDtoSchema>

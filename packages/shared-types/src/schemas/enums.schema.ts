/**
 * Enum Schemas
 *
 * Zod schemas for shared enums. These are the source of truth.
 * Types are derived via z.infer for type safety.
 */

import { z } from 'zod'

// =============================================================================
// Activity Type
// =============================================================================

export const activityTypeSchema = z.enum([
  'lodging',
  'flight',
  'tour',
  'transportation',
  'cruise',
  'dining',
  'options',
  'custom_cruise',
  'port_info',
  'package',
  'custom_tour',
  'tour_day',
  'insurance',
])

export type ActivityType = z.infer<typeof activityTypeSchema>

// =============================================================================
// Activity Proposal Status (replaces old ActivityStatus)
// =============================================================================

export const activityProposalStatusSchema = z.enum([
  'draft',
  'proposing',
  'approved',
  'cancelled',
])

export type ActivityProposalStatus = z.infer<typeof activityProposalStatusSchema>

// =============================================================================
// Activity Booking Status (replaces old isBooked boolean)
// =============================================================================

export const activityBookingStatusSchema = z.enum([
  'unbooked',
  'booked',
  'cancelled',
])

export type ActivityBookingStatus = z.infer<typeof activityBookingStatusSchema>

/**
 * @deprecated Use ActivityProposalStatus instead. Kept for backward compatibility during migration.
 */
export const activityStatusSchema = activityProposalStatusSchema

/**
 * @deprecated Use ActivityProposalStatus instead.
 */
export type ActivityStatus = ActivityProposalStatus

// =============================================================================
// Pricing Type
// =============================================================================

export const pricingTypeSchema = z.enum([
  'per_person',
  'per_room',
  'flat_rate',
  'per_night',
  'total',
])

export type PricingType = z.infer<typeof pricingTypeSchema>

// =============================================================================
// Port Type
// =============================================================================

export const portTypeSchema = z.enum([
  'departure',
  'arrival',
  'sea_day',
  'port_call',
])

export type PortType = z.infer<typeof portTypeSchema>

// =============================================================================
// Transportation Subtype
// =============================================================================

export const transportationSubtypeSchema = z.enum([
  'transfer',
  'car_rental',
  'private_car',
  'taxi',
  'shuttle',
  'train',
  'ferry',
  'bus',
  'limousine',
])

export type TransportationSubtype = z.infer<typeof transportationSubtypeSchema>

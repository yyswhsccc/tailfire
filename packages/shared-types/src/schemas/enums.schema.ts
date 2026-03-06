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
// Activity Status
// =============================================================================

export const activityStatusSchema = z.enum([
  'proposed',
  'confirmed',
  'cancelled',
  'optional',
])

export type ActivityStatus = z.infer<typeof activityStatusSchema>

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

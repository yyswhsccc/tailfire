/**
 * Component Request Schemas
 *
 * Zod schemas for create/update component DTOs.
 * Combines base activity fields with component-specific details.
 * Used for request body validation in TypedActivitiesController.
 */

import { z } from 'zod'
import { activityStatusSchema, activityProposalStatusSchema, activityBookingStatusSchema, pricingTypeSchema } from './enums.schema'
import { coordinatesSchema, photoSchema } from './common.schema'
import { flightDetailsDtoSchema } from './flight-details.schema'
import { lodgingDetailsDtoSchema } from './lodging-details.schema'
import { transportationDetailsDtoSchema } from './transportation.schema'
import { diningDetailsDtoSchema } from './dining-details.schema'
import { optionsDetailsDtoSchema } from './options-details.schema'
import { portInfoDetailsDtoSchema } from './port-info-details.schema'
import { customCruiseDetailsDtoSchema } from './custom-cruise-details.schema'
import { customTourDetailsDtoSchema, tourDayDetailsDtoSchema } from './custom-tour-details.schema'

// =============================================================================
// Per-Person Pricing Breakdown Item Schema
// =============================================================================

const pricingBreakdownItemSchema = z.object({
  label: z.string(),
  priceCents: z.number().int(),
  travelerId: z.string().uuid().optional(),
})

// =============================================================================
// Base Create Component Schema
// =============================================================================

/**
 * Base fields shared across all create component requests.
 * All fields except name are optional.
 */
const baseCreateComponentSchema = z.object({
  itineraryDayId: z.string().uuid().nullable().optional(), // Optional for floating packages
  parentActivityId: z.string().uuid().nullable().optional(),
  name: z.string().min(1, 'Activity name is required'),
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
  bookingDate: z.string().nullable().optional(),
  status: activityStatusSchema.optional(),

  // Pricing
  pricingType: pricingTypeSchema.nullable().optional(),
  currency: z.string().length(3).optional(),
  totalPriceCents: z.number().int().nullable().optional(),
  taxesAndFeesCents: z.number().int().nullable().optional(),
  invoiceType: z.enum(['individual_item', 'part_of_package']).nullable().optional(),

  // Commission
  commissionTotalCents: z.number().int().nullable().optional(),
  commissionSplitPercentage: z.number().nullable().optional(),
  commissionExpectedDate: z.string().nullable().optional(),

  // Booking details
  termsAndConditions: z.string().nullable().optional(),
  cancellationPolicy: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  bookingReference: z.string().nullable().optional(),

  // Per-person pricing breakdown
  pricingBreakdownJson: z.array(pricingBreakdownItemSchema).nullable().optional(),

  // Media
  photos: z.array(photoSchema).nullable().optional(),
})

// =============================================================================
// Base Update Component Schema
// =============================================================================

/**
 * Base fields for update component requests (all optional for PATCH).
 */
const baseUpdateComponentSchema = z.object({
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
  proposalStatus: activityProposalStatusSchema.optional(),
  bookingStatus: activityBookingStatusSchema.optional(),
  bookingDate: z.string().nullable().optional(),
  status: activityStatusSchema.optional(),

  // Pricing
  pricingType: pricingTypeSchema.nullable().optional(),
  currency: z.string().length(3).optional(),
  totalPriceCents: z.number().int().nullable().optional(),
  taxesAndFeesCents: z.number().int().nullable().optional(),
  invoiceType: z.enum(['individual_item', 'part_of_package']).nullable().optional(),

  // Commission
  commissionTotalCents: z.number().int().nullable().optional(),
  commissionSplitPercentage: z.number().nullable().optional(),
  commissionExpectedDate: z.string().nullable().optional(),

  // Booking details
  termsAndConditions: z.string().nullable().optional(),
  cancellationPolicy: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  bookingReference: z.string().nullable().optional(),

  // Per-person pricing breakdown
  pricingBreakdownJson: z.array(pricingBreakdownItemSchema).nullable().optional(),

  // Media
  photos: z.array(photoSchema).nullable().optional(),
})

// =============================================================================
// Flight Component Schemas
// =============================================================================

export const createFlightComponentDtoSchema = baseCreateComponentSchema.extend({
  componentType: z.literal('flight'),
  flightDetails: flightDetailsDtoSchema.optional(),
})

export const updateFlightComponentDtoSchema = baseUpdateComponentSchema.extend({
  flightDetails: flightDetailsDtoSchema.optional(),
})

// =============================================================================
// Lodging Component Schemas
// =============================================================================

export const createLodgingComponentDtoSchema = baseCreateComponentSchema.extend({
  componentType: z.literal('lodging'),
  lodgingDetails: lodgingDetailsDtoSchema.optional(),
})

export const updateLodgingComponentDtoSchema = baseUpdateComponentSchema.extend({
  lodgingDetails: lodgingDetailsDtoSchema.optional(),
})

// =============================================================================
// Transportation Component Schemas
// =============================================================================

export const createTransportationComponentDtoSchema = baseCreateComponentSchema.extend({
  componentType: z.literal('transportation'),
  transportationDetails: transportationDetailsDtoSchema.optional(),
})

export const updateTransportationComponentDtoSchema = baseUpdateComponentSchema.extend({
  transportationDetails: transportationDetailsDtoSchema.optional(),
})

// =============================================================================
// Dining Component Schemas
// =============================================================================

export const createDiningComponentDtoSchema = baseCreateComponentSchema.extend({
  componentType: z.literal('dining'),
  diningDetails: diningDetailsDtoSchema.optional(),
})

export const updateDiningComponentDtoSchema = baseUpdateComponentSchema.extend({
  diningDetails: diningDetailsDtoSchema.optional(),
})

// =============================================================================
// Port Info Component Schemas
// =============================================================================

export const createPortInfoComponentDtoSchema = baseCreateComponentSchema.extend({
  componentType: z.literal('port_info'),
  portInfoDetails: portInfoDetailsDtoSchema.optional(),
})

export const updatePortInfoComponentDtoSchema = baseUpdateComponentSchema.extend({
  portInfoDetails: portInfoDetailsDtoSchema.optional(),
})

// =============================================================================
// Options Component Schemas
// =============================================================================

export const createOptionsComponentDtoSchema = baseCreateComponentSchema.extend({
  componentType: z.literal('options'),
  optionsDetails: optionsDetailsDtoSchema.optional(),
})

export const updateOptionsComponentDtoSchema = baseUpdateComponentSchema.extend({
  optionsDetails: optionsDetailsDtoSchema.optional(),
})

// =============================================================================
// Custom Cruise Component Schemas
// =============================================================================

export const createCustomCruiseComponentDtoSchema = baseCreateComponentSchema.extend({
  componentType: z.literal('custom_cruise'),
  customCruiseDetails: customCruiseDetailsDtoSchema.optional(),
})

export const updateCustomCruiseComponentDtoSchema = baseUpdateComponentSchema.extend({
  customCruiseDetails: customCruiseDetailsDtoSchema.optional(),
})

// =============================================================================
// Custom Tour Component Schemas
// =============================================================================

export const createCustomTourComponentDtoSchema = baseCreateComponentSchema.extend({
  componentType: z.literal('custom_tour'),
  customTourDetails: customTourDetailsDtoSchema.optional(),
})

export const updateCustomTourComponentDtoSchema = baseUpdateComponentSchema.extend({
  customTourDetails: customTourDetailsDtoSchema.optional(),
})

// =============================================================================
// Tour Day Component Schemas
// =============================================================================

export const createTourDayComponentDtoSchema = baseCreateComponentSchema.extend({
  componentType: z.literal('tour_day'),
  tourDayDetails: tourDayDetailsDtoSchema.optional(),
})

export const updateTourDayComponentDtoSchema = baseUpdateComponentSchema.extend({
  tourDayDetails: tourDayDetailsDtoSchema.optional(),
})

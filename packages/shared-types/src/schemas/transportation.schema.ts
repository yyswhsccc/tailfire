/**
 * Transportation Schemas
 *
 * Zod schemas for Transportation DTOs.
 * Mirrors existing TransportationDetailsDto from components.types.ts.
 */

import { z } from 'zod'
import { transportationSubtypeSchema } from './enums.schema'

// =============================================================================
// Transportation Details DTO Schema
// =============================================================================

/**
 * Schema for transportation details.
 * All fields nullable/optional to match existing DTO permissiveness.
 *
 * Note: isRoundTrip is boolean in DTO. The detail-mapper converts to int for DB storage.
 */
export const transportationDetailsDtoSchema = z.object({
  subtype: transportationSubtypeSchema.nullable().optional(),

  // Provider info
  providerName: z.string().nullable().optional(),
  providerPhone: z.string().nullable().optional(),
  providerEmail: z.string().nullable().optional(),

  // Vehicle details
  vehicleType: z.string().nullable().optional(),
  vehicleModel: z.string().nullable().optional(),
  vehicleCapacity: z.number().int().nullable().optional(),
  licensePlate: z.string().nullable().optional(),

  // Pickup details
  pickupDate: z.string().nullable().optional(),
  pickupTime: z.string().nullable().optional(),
  pickupTimezone: z.string().nullable().optional(),
  pickupAddress: z.string().nullable().optional(),
  pickupNotes: z.string().nullable().optional(),

  // Dropoff details
  dropoffDate: z.string().nullable().optional(),
  dropoffTime: z.string().nullable().optional(),
  dropoffTimezone: z.string().nullable().optional(),
  dropoffAddress: z.string().nullable().optional(),
  dropoffNotes: z.string().nullable().optional(),

  // Driver info
  driverName: z.string().nullable().optional(),
  driverPhone: z.string().nullable().optional(),

  // Car rental specific
  rentalPickupLocation: z.string().nullable().optional(),
  rentalDropoffLocation: z.string().nullable().optional(),
  rentalInsuranceType: z.string().nullable().optional(),
  rentalMileageLimit: z.string().nullable().optional(),

  // Additional
  features: z.array(z.string()).nullable().optional(),
  specialRequests: z.string().nullable().optional(),
  flightNumber: z.string().nullable().optional(),
  isRoundTrip: z.boolean().nullable().optional(),

  // Structured location data (Google Places + Amadeus)
  pickupName: z.string().nullable().optional(),
  pickupLat: z.number().nullable().optional(),
  pickupLng: z.number().nullable().optional(),
  pickupPlaceId: z.string().nullable().optional(),
  dropoffName: z.string().nullable().optional(),
  dropoffLat: z.number().nullable().optional(),
  dropoffLng: z.number().nullable().optional(),
  dropoffPlaceId: z.string().nullable().optional(),

  // Enhanced car rental
  rentalCompany: z.string().nullable().optional(),
  rentalBookingRef: z.string().nullable().optional(),
  rentalCarClass: z.string().nullable().optional(),
  rentalFuelPolicy: z.string().nullable().optional(),

  // Station/terminal
  departureStation: z.string().nullable().optional(),
  arrivalStation: z.string().nullable().optional(),
})

export type TransportationDetailsDto = z.infer<typeof transportationDetailsDtoSchema>

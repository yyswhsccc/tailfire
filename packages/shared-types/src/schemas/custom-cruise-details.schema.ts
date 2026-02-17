/**
 * Custom Cruise Details Schemas
 *
 * Zod schemas for Custom Cruise DTOs.
 * Mirrors existing CustomCruiseDetailsDto from components.types.ts.
 */

import { z } from 'zod'

// =============================================================================
// Cruise Enums
// =============================================================================

export const cruiseSourceSchema = z.enum(['traveltek', 'manual'])
export type CruiseSource = z.infer<typeof cruiseSourceSchema>

export const cabinCategorySchema = z.enum(['suite', 'balcony', 'oceanview', 'inside'])
export type CabinCategory = z.infer<typeof cabinCategorySchema>

// =============================================================================
// Cruise Port Call Schema
// =============================================================================

export const cruisePortCallSchema = z.object({
  day: z.number().int(),
  portName: z.string(),
  // portId can be a UUID string (from catalog) or integer (from FusionAPI)
  portId: z.union([z.string(), z.number()]).nullable().optional(),
  arriveDate: z.string(),
  departDate: z.string(),
  arriveTime: z.string(),
  departTime: z.string(),
  tender: z.boolean().optional(),
  description: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  // isSeaDay flag from catalog itinerary
  isSeaDay: z.boolean().optional(),
})

export type CruisePortCall = z.infer<typeof cruisePortCallSchema>

// =============================================================================
// Custom Cruise Details Schema
// =============================================================================

/**
 * Schema for custom cruise details.
 * Traveltek-aligned field structure for manual entry and future API ingestion.
 * All fields nullable/optional to match existing DTO permissiveness.
 */
export const customCruiseDetailsDtoSchema = z.object({
  // Traveltek Identity
  traveltekCruiseId: z.string().nullable().optional(),
  source: cruiseSourceSchema.nullable().optional(),

  // Cruise Line Information
  cruiseLineName: z.string().nullable().optional(),
  cruiseLineCode: z.string().nullable().optional(),
  cruiseLineId: z.string().uuid().nullable().optional(),
  shipName: z.string().nullable().optional(),
  shipCode: z.string().nullable().optional(),
  shipClass: z.string().nullable().optional(),
  shipImageUrl: z.string().nullable().optional(),
  cruiseShipId: z.string().uuid().nullable().optional(),

  // Voyage Details
  itineraryName: z.string().nullable().optional(),
  voyageCode: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  cruiseRegionId: z.string().uuid().nullable().optional(),
  nights: z.number().int().nonnegative().nullable().optional(),
  seaDays: z.number().int().nonnegative().nullable().optional(),

  // Departure Details
  departurePort: z.string().nullable().optional(),
  departurePortId: z.string().uuid().nullable().optional(),
  departureDate: z.string().nullable().optional(),
  departureTime: z.string().nullable().optional(),
  departureTimezone: z.string().nullable().optional(),

  // Arrival Details
  arrivalPort: z.string().nullable().optional(),
  arrivalPortId: z.string().uuid().nullable().optional(),
  arrivalDate: z.string().nullable().optional(),
  arrivalTime: z.string().nullable().optional(),
  arrivalTimezone: z.string().nullable().optional(),

  // Cabin Details (Normalized)
  cabinCategory: z.string().nullable().optional(), // Allow any string, not just enum values
  cabinCode: z.string().nullable().optional(),
  cabinNumber: z.string().nullable().optional(),
  cabinDeck: z.string().nullable().optional(),
  cabinLocation: z.string().nullable().optional(),
  cabinImageUrl: z.string().nullable().optional(),
  cabinDescription: z.string().nullable().optional(),

  // Booking Information
  bookingNumber: z.string().nullable().optional(),
  fareCode: z.string().nullable().optional(),
  bookingDeadline: z.string().nullable().optional(),

  // JSON Data (Traveltek structures)
  portCallsJson: z.array(cruisePortCallSchema).optional(),
  cabinPricingJson: z.record(z.unknown()).optional(),
  shipContentJson: z.record(z.unknown()).optional(),

  // Import-specific data
  diningPreferences: z.record(z.unknown()).nullable().optional(),
  selectedExtras: z.array(z.record(z.unknown())).nullable().optional(),
  selectedPromotions: z.record(z.unknown()).nullable().optional(),

  // Traveltek internal IDs for re-sync/refresh
  traveltekBookingId: z.number().int().nullable().optional(),
  traveltekPortfolioId: z.number().int().nullable().optional(),

  // Cruise-specific booking fields
  reservationNumber: z.string().nullable().optional(),
  stateroomCategoryCode: z.string().nullable().optional(),
  onboardCreditCents: z.number().int().nullable().optional(),
  onboardCreditCurrency: z.string().max(3).nullable().optional(),

  // Additional Details
  inclusions: z.array(z.string()).optional(),
  specialRequests: z.string().nullable().optional(),
})

export type CustomCruiseDetailsDto = z.infer<typeof customCruiseDetailsDtoSchema>

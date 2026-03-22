/**
 * Dining Form Validation Schema
 *
 * Uses Zod for schema validation with react-hook-form integration.
 * Handles date coercion, Invalid Date rejection, and nested object validation.
 */

import { z } from 'zod'
import type { CreateDiningActivityDto, PricingType } from '@tailfire/shared-types/api'

// ============================================================================
// Note: Date fields use string format (YYYY-MM-DD) for DatePickerEnhanced compatibility
// ============================================================================

// ============================================================================
// Dining Details Schema (nested object)
// ============================================================================

export const diningDetailsSchema = z.object({
  restaurantName: z.string().min(1, 'Restaurant name is required'),
  cuisineType: z.string().optional().default(''),
  mealType: z.enum(['breakfast', 'brunch', 'lunch', 'afternoon_tea', 'dinner', 'late_night']).default('dinner'),
  reservationDate: z.string().nullable().optional(),
  reservationTime: z.string().optional().default('19:00'),
  timezone: z.string().optional().default(''),
  partySize: z.coerce.number().int().min(1).max(100).nullable().optional(),
  address: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  website: z.string().optional().default(''),
  coordinates: z.any().nullable().optional(),
  priceRange: z.string().optional().default(''),
  dressCode: z.string().optional().default(''),
  dietaryRequirements: z.array(z.string()).optional().default([]),
  specialRequests: z.string().optional().default(''),
  menuUrl: z.string().optional().default(''),
})

// ============================================================================
// Main Dining Form Schema
// ============================================================================

export const diningFormSchema = z.object({
  // Core fields
  itineraryDayId: z.string().min(1, 'Day is required'),
  componentType: z.literal('dining').default('dining'),
  name: z.string().optional().default(''), // Auto-generated from restaurantName
  description: z.string().optional().default(''),
  proposalStatus: z.enum(['draft', 'proposing', 'approved', 'cancelled']).default('draft'),

  // Nested dining details
  diningDetails: diningDetailsSchema,

  // Pricing fields
  totalPriceCents: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative('Price cannot be negative'))
    .default(0),
  taxesAndFeesCents: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative('Taxes cannot be negative'))
    .default(0),
  currency: z.string().default('CAD'),
  pricingType: z.enum(['per_person', 'per_room', 'flat_rate', 'per_night']).default('per_person'),
  confirmationNumber: z.string().optional().default(''),

  // Commission fields
  commissionTotalCents: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative())
    .optional()
    .default(0),
  commissionSplitPercentage: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().min(0).max(100))
    .optional()
    .default(0),
  commissionExpectedDate: z.string().nullable().optional(),

  // Booking details
  termsAndConditions: z.string().optional().default(''),
  cancellationPolicy: z.string().optional().default(''),
  supplier: z.string().optional().default(''),
})

export type DiningFormData = z.infer<typeof diningFormSchema>
export type DiningDetailsData = z.infer<typeof diningDetailsSchema>

// ============================================================================
// Field Names (for error mapping and useWatch)
// ============================================================================

export const DINING_FORM_FIELDS = [
  'itineraryDayId',
  'componentType',
  'name',
  'description',
  'status',
  'diningDetails',
  'diningDetails.restaurantName',
  'diningDetails.cuisineType',
  'diningDetails.mealType',
  'diningDetails.reservationDate',
  'diningDetails.reservationTime',
  'diningDetails.timezone',
  'diningDetails.partySize',
  'diningDetails.address',
  'diningDetails.phone',
  'diningDetails.website',
  'diningDetails.priceRange',
  'diningDetails.dressCode',
  'diningDetails.dietaryRequirements',
  'diningDetails.specialRequests',
  'diningDetails.menuUrl',
  'totalPriceCents',
  'taxesAndFeesCents',
  'currency',
  'pricingType',
  'confirmationNumber',
  'commissionTotalCents',
  'commissionSplitPercentage',
  'commissionExpectedDate',
  'termsAndConditions',
  'cancellationPolicy',
  'supplier',
] as const

// ============================================================================
// Default Values Hydration
// ============================================================================

/**
 * Parse a date value to ISO string format (YYYY-MM-DD), returning null if invalid.
 * Uses explicit UTC to avoid timezone drift.
 */
function parseStringDate(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val // Already ISO format
  }
  // For date-only strings, append UTC time to avoid local timezone interpretation
  const str = typeof val === 'string' ? val : ''
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00Z` : str
  const d = val instanceof Date ? val : new Date(dateStr || String(val))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0] ?? null
}

/**
 * Creates default form values, handling server data hydration
 */
export function toDiningDefaults(
  serverData?: Partial<DiningFormData> | null,
  dayDate?: string | null,
  tripCurrency?: string,
  partySize?: number
): DiningFormData {
  const serverDetails = serverData?.diningDetails

  return {
    itineraryDayId: serverData?.itineraryDayId ?? '',
    componentType: 'dining',
    name: serverData?.name ?? '',
    description: serverData?.description ?? '',
    proposalStatus: serverData?.proposalStatus ?? 'draft',

    diningDetails: {
      restaurantName: serverDetails?.restaurantName ?? '',
      cuisineType: serverDetails?.cuisineType ?? '',
      mealType: serverDetails?.mealType ?? 'dinner',
      reservationDate: serverDetails?.reservationDate ?? dayDate ?? null,
      reservationTime: serverDetails?.reservationTime ?? '19:00',
      timezone: serverDetails?.timezone ?? '',
      partySize: serverDetails?.partySize ?? partySize ?? 2,
      address: serverDetails?.address ?? '',
      phone: serverDetails?.phone ?? '',
      website: serverDetails?.website ?? '',
      coordinates: serverDetails?.coordinates ?? null,
      priceRange: serverDetails?.priceRange ?? '',
      dressCode: serverDetails?.dressCode ?? '',
      dietaryRequirements: serverDetails?.dietaryRequirements ?? [],
      specialRequests: serverDetails?.specialRequests ?? '',
      menuUrl: serverDetails?.menuUrl ?? '',
    },

    totalPriceCents: serverData?.totalPriceCents ?? 0,
    taxesAndFeesCents: serverData?.taxesAndFeesCents ?? 0,
    currency: serverData?.currency ?? tripCurrency ?? 'CAD',
    pricingType: serverData?.pricingType ?? 'per_person',
    confirmationNumber: serverData?.confirmationNumber ?? '',

    commissionTotalCents: serverData?.commissionTotalCents ?? 0,
    commissionSplitPercentage: serverData?.commissionSplitPercentage ?? 0,
    commissionExpectedDate: serverData?.commissionExpectedDate
      ? parseStringDate(serverData.commissionExpectedDate)
      : null,

    termsAndConditions: serverData?.termsAndConditions ?? '',
    cancellationPolicy: serverData?.cancellationPolicy ?? '',
    supplier: serverData?.supplier ?? '',
  }
}

// ============================================================================
// Form Data to API Payload Mapper
// ============================================================================

/**
 * Maps form data to API payload with proper type conversions.
 */
export function toDiningApiPayload(data: DiningFormData): CreateDiningActivityDto {
  return {
    itineraryDayId: data.itineraryDayId,
    componentType: 'dining',
    name: data.diningDetails.restaurantName, // Auto-name from restaurant
    description: data.description,
    proposalStatus: data.proposalStatus,
    diningDetails: {
      restaurantName: data.diningDetails.restaurantName,
      cuisineType: data.diningDetails.cuisineType,
      mealType: data.diningDetails.mealType,
      reservationDate: data.diningDetails.reservationDate,
      reservationTime: data.diningDetails.reservationTime,
      timezone: data.diningDetails.timezone,
      partySize: data.diningDetails.partySize,
      address: data.diningDetails.address,
      phone: data.diningDetails.phone,
      website: data.diningDetails.website,
      coordinates: data.diningDetails.coordinates,
      priceRange: data.diningDetails.priceRange,
      dressCode: data.diningDetails.dressCode,
      dietaryRequirements: data.diningDetails.dietaryRequirements,
      specialRequests: data.diningDetails.specialRequests,
      menuUrl: data.diningDetails.menuUrl,
    },
    totalPriceCents: data.totalPriceCents,
    taxesAndFeesCents: data.taxesAndFeesCents,
    currency: data.currency,
    pricingType: data.pricingType as PricingType,
    confirmationNumber: data.confirmationNumber,
    commissionTotalCents: data.commissionTotalCents ?? 0,
    commissionSplitPercentage: data.commissionSplitPercentage ?? 0,
    commissionExpectedDate: data.commissionExpectedDate || null,
    // Booking details - send undefined if empty to avoid overwriting
    termsAndConditions: data.termsAndConditions || undefined,
    cancellationPolicy: data.cancellationPolicy || undefined,
    supplier: data.supplier || undefined,
  }
}

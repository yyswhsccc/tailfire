/**
 * Custom Cruise Form Validation Schema
 *
 * Uses Zod for schema validation with react-hook-form integration.
 * Handles cruise details, cabin info, voyage details, and pricing validation.
 */

import { z } from 'zod'
import type { CreateCustomCruiseActivityDto, PricingType } from '@tailfire/shared-types/api'

// ============================================================================
// Helper: Optional valid date string (ISO format)
// ============================================================================

const optionalDateString = z.string()
  .transform((val) => {
    if (!val) return null
    const d = new Date(val)
    return Number.isNaN(d.getTime()) ? null : val
  })
  .nullable()
  .optional()

const optionalTimeString = z.string()
  .nullable()
  .optional()

// ============================================================================
// Custom Cruise Details Schema (nested object)
// ============================================================================

export const customCruiseDetailsSchema = z.object({
  source: z.enum(['manual', 'traveltek']).default('manual'),

  // Traveltek Identity
  traveltekCruiseId: z.string().nullable().optional(),

  // Cruise Line Information
  cruiseLineName: z.string().nullable().optional(),
  cruiseLineCode: z.string().nullable().optional(),
  cruiseLineId: z.string().nullable().optional(),
  shipName: z.string().nullable().optional(),
  shipCode: z.string().nullable().optional(),
  cruiseShipId: z.string().nullable().optional(),
  shipClass: z.string().nullable().optional(),
  shipImageUrl: z.string().nullable().optional(),

  // Voyage Details
  itineraryName: z.string().nullable().optional(),
  voyageCode: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  cruiseRegionId: z.string().nullable().optional(),
  nights: z.coerce.number().nullable().optional(),
  seaDays: z.coerce.number().nullable().optional(),

  // Departure Details
  departurePort: z.string().nullable().optional(),
  departurePortId: z.string().nullable().optional(),
  departureDate: optionalDateString,
  departureTime: optionalTimeString,
  departureTimezone: z.string().nullable().optional(),

  // Arrival Details
  arrivalPort: z.string().nullable().optional(),
  arrivalPortId: z.string().nullable().optional(),
  arrivalDate: optionalDateString,
  arrivalTime: optionalTimeString,
  arrivalTimezone: z.string().nullable().optional(),

  // Cabin Details
  cabinCategory: z.string().nullable().optional(),
  cabinCode: z.string().nullable().optional(),
  cabinNumber: z.string().nullable().optional(),
  cabinDeck: z.string().nullable().optional(),
  cabinLocation: z.string().nullable().optional(),
  cabinImageUrl: z.string().nullable().optional(),
  cabinDescription: z.string().nullable().optional(),

  // Booking Information
  bookingNumber: z.string().nullable().optional(),
  fareCode: z.string().nullable().optional(),
  bookingDeadline: optionalDateString,

  // JSON Data (store as-is)
  portCallsJson: z.array(z.any()).default([]),
  cabinPricingJson: z.record(z.any()).default({}),
  shipContentJson: z.record(z.any()).default({}),

  // Import-specific data
  diningPreferences: z.record(z.any()).nullable().optional().default({}),
  selectedExtras: z.array(z.record(z.any())).nullable().optional().default([]),
  selectedPromotions: z.record(z.any()).nullable().optional().default({}),
  traveltekBookingId: z.coerce.number().nullable().optional(),
  traveltekPortfolioId: z.coerce.number().nullable().optional(),

  // Additional Details
  inclusions: z.array(z.string()).default([]),
  specialRequests: z.string().nullable().optional(),

  // Phase B: New cruise fields
  reservationNumber: z.string().nullable().optional(),
  stateroomCategoryCode: z.string().nullable().optional(),
  onboardCreditCents: z.coerce.number().nullable().optional(),
  onboardCreditCurrency: z.string().max(3).nullable().optional(),
})

// ============================================================================
// Main Custom Cruise Form Schema
// ============================================================================

export const customCruiseFormSchema = z.object({
  // Core fields
  itineraryDayId: z.string().min(1, 'Day is required'),
  componentType: z.literal('custom_cruise').default('custom_cruise'),
  name: z.string().default(''),
  description: z.string().default(''),
  proposalStatus: z.enum(['draft', 'proposing', 'approved', 'cancelled']).default('draft'),

  // Pricing fields (pricing data managed via activity_pricing table)
  totalPriceCents: z.coerce.number()
    .refine((v) => v === null || !Number.isNaN(v), { message: 'Invalid number' })
    .nullable()
    .optional(),
  taxesAndFeesCents: z.coerce.number()
    .refine((v) => v === null || !Number.isNaN(v), { message: 'Invalid number' })
    .nullable()
    .optional(),
  currency: z.string().default('USD'),
  pricingType: z.enum(['per_person', 'per_room', 'flat_rate', 'per_night', 'per_group', 'fixed', 'total']).default('per_person'),
  confirmationNumber: z.string().default(''),

  // Commission fields
  commissionTotalCents: z.coerce.number().nullable().optional(),
  commissionSplitPercentage: z.coerce.number()
    .refine((v) => v === null || !Number.isNaN(v) || (v >= 0 && v <= 100), { message: 'Percentage must be 0-100' })
    .nullable()
    .optional(),
  commissionExpectedDate: optionalDateString,

  // Booking details
  termsAndConditions: z.string().optional().default(''),
  cancellationPolicy: z.string().optional().default(''),
  supplier: z.string().optional().default(''),

  // Phase B: Agency pricing fields (activity_pricing level)
  netPriceCents: z.coerce.number().nullable().optional(),
  nonRefundableDeposit: z.boolean().nullable().optional(),

  // Phase B: Cancellation schedule (activity_pricing level)
  cancellationScheduleJson: z.array(z.object({
    daysRange: z.string(),
    penaltyPercent: z.coerce.number().min(0).max(100),
    penaltyAmountCents: z.coerce.number().nullable().optional(),
    effectiveDate: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })).nullable().optional().default(null),

  // Nested cruise details
  customCruiseDetails: customCruiseDetailsSchema.default({}),
})

export type CustomCruiseFormData = z.infer<typeof customCruiseFormSchema>
export type CustomCruiseDetailsData = z.infer<typeof customCruiseDetailsSchema>

// ============================================================================
// Field Names (for error mapping and useWatch)
// ============================================================================

export const CUSTOM_CRUISE_FORM_FIELDS = [
  'itineraryDayId',
  'componentType',
  'name',
  'description',
  'status',
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
  'customCruiseDetails',
] as const

// ============================================================================
// Default Values Hydration
// ============================================================================

/**
 * Creates default form values, handling server data hydration
 */
export function toCustomCruiseDefaults(
  serverData?: Partial<CustomCruiseFormData> | null,
  dayDate?: string | null,
  tripCurrency?: string | null
): CustomCruiseFormData {
  return {
    itineraryDayId: serverData?.itineraryDayId ?? '',
    componentType: 'custom_cruise',
    name: serverData?.name ?? '',
    description: serverData?.description ?? '',
    proposalStatus: serverData?.proposalStatus ?? 'draft',

    totalPriceCents: serverData?.totalPriceCents ?? null,
    taxesAndFeesCents: serverData?.taxesAndFeesCents ?? null,
    currency: serverData?.currency ?? tripCurrency ?? 'USD',
    pricingType: serverData?.pricingType ?? 'per_person',
    confirmationNumber: serverData?.confirmationNumber ?? '',

    commissionTotalCents: serverData?.commissionTotalCents ?? null,
    commissionSplitPercentage: serverData?.commissionSplitPercentage ?? null,
    commissionExpectedDate: serverData?.commissionExpectedDate ?? null,

    termsAndConditions: serverData?.termsAndConditions ?? '',
    cancellationPolicy: serverData?.cancellationPolicy ?? '',
    supplier: serverData?.supplier ?? '',

    netPriceCents: serverData?.netPriceCents ?? null,
    nonRefundableDeposit: serverData?.nonRefundableDeposit ?? null,
    cancellationScheduleJson: serverData?.cancellationScheduleJson ?? null,

    customCruiseDetails: {
      source: serverData?.customCruiseDetails?.source ?? 'manual',
      traveltekCruiseId: serverData?.customCruiseDetails?.traveltekCruiseId ?? null,
      cruiseLineName: serverData?.customCruiseDetails?.cruiseLineName ?? null,
      cruiseLineCode: serverData?.customCruiseDetails?.cruiseLineCode ?? null,
      cruiseLineId: serverData?.customCruiseDetails?.cruiseLineId ?? null,
      shipName: serverData?.customCruiseDetails?.shipName ?? null,
      shipCode: serverData?.customCruiseDetails?.shipCode ?? null,
      cruiseShipId: serverData?.customCruiseDetails?.cruiseShipId ?? null,
      shipClass: serverData?.customCruiseDetails?.shipClass ?? null,
      shipImageUrl: serverData?.customCruiseDetails?.shipImageUrl ?? null,
      itineraryName: serverData?.customCruiseDetails?.itineraryName ?? null,
      voyageCode: serverData?.customCruiseDetails?.voyageCode ?? null,
      region: serverData?.customCruiseDetails?.region ?? null,
      cruiseRegionId: serverData?.customCruiseDetails?.cruiseRegionId ?? null,
      nights: serverData?.customCruiseDetails?.nights ?? null,
      seaDays: serverData?.customCruiseDetails?.seaDays ?? null,
      departurePort: serverData?.customCruiseDetails?.departurePort ?? null,
      departurePortId: serverData?.customCruiseDetails?.departurePortId ?? null,
      departureDate: serverData?.customCruiseDetails?.departureDate ?? dayDate ?? null,
      departureTime: serverData?.customCruiseDetails?.departureTime ?? null,
      departureTimezone: serverData?.customCruiseDetails?.departureTimezone ?? null,
      arrivalPort: serverData?.customCruiseDetails?.arrivalPort ?? null,
      arrivalPortId: serverData?.customCruiseDetails?.arrivalPortId ?? null,
      arrivalDate: serverData?.customCruiseDetails?.arrivalDate ?? null,
      arrivalTime: serverData?.customCruiseDetails?.arrivalTime ?? null,
      arrivalTimezone: serverData?.customCruiseDetails?.arrivalTimezone ?? null,
      cabinCategory: serverData?.customCruiseDetails?.cabinCategory ?? null,
      cabinCode: serverData?.customCruiseDetails?.cabinCode ?? null,
      cabinNumber: serverData?.customCruiseDetails?.cabinNumber ?? null,
      cabinDeck: serverData?.customCruiseDetails?.cabinDeck ?? null,
      cabinLocation: serverData?.customCruiseDetails?.cabinLocation ?? null,
      cabinImageUrl: serverData?.customCruiseDetails?.cabinImageUrl ?? null,
      cabinDescription: serverData?.customCruiseDetails?.cabinDescription ?? null,
      bookingNumber: serverData?.customCruiseDetails?.bookingNumber ?? null,
      fareCode: serverData?.customCruiseDetails?.fareCode ?? null,
      bookingDeadline: serverData?.customCruiseDetails?.bookingDeadline ?? null,
      portCallsJson: serverData?.customCruiseDetails?.portCallsJson ?? [],
      cabinPricingJson: serverData?.customCruiseDetails?.cabinPricingJson ?? {},
      shipContentJson: serverData?.customCruiseDetails?.shipContentJson ?? {},
      diningPreferences: serverData?.customCruiseDetails?.diningPreferences ?? {},
      selectedExtras: serverData?.customCruiseDetails?.selectedExtras ?? [],
      selectedPromotions: serverData?.customCruiseDetails?.selectedPromotions ?? {},
      traveltekBookingId: serverData?.customCruiseDetails?.traveltekBookingId ?? null,
      traveltekPortfolioId: serverData?.customCruiseDetails?.traveltekPortfolioId ?? null,
      inclusions: serverData?.customCruiseDetails?.inclusions ?? [],
      specialRequests: serverData?.customCruiseDetails?.specialRequests ?? null,
      reservationNumber: serverData?.customCruiseDetails?.reservationNumber ?? null,
      stateroomCategoryCode: serverData?.customCruiseDetails?.stateroomCategoryCode ?? null,
      onboardCreditCents: serverData?.customCruiseDetails?.onboardCreditCents ?? null,
      onboardCreditCurrency: serverData?.customCruiseDetails?.onboardCreditCurrency ?? null,
    },
  }
}

// ============================================================================
// Form Data to API Payload Mapper
// ============================================================================

/**
 * Maps form data to API payload with proper type conversions.
 */
export function toCustomCruiseApiPayload(data: CustomCruiseFormData): CreateCustomCruiseActivityDto {
  // Derive startDatetime/endDatetime from cruise departure/arrival dates
  // These are required for spanning activity detection (multi-day cruises)
  const startDatetime = data.customCruiseDetails.departureDate || undefined
  const endDatetime = data.customCruiseDetails.arrivalDate || undefined

  return {
    itineraryDayId: data.itineraryDayId,
    componentType: 'custom_cruise',
    name: data.name || generateCruiseName(data),
    description: data.description || undefined,
    status: data.status,
    // Timing - critical for spanning activity detection
    startDatetime,
    endDatetime,
    totalPriceCents: data.totalPriceCents ?? undefined,
    taxesAndFeesCents: data.taxesAndFeesCents ?? undefined,
    currency: data.currency,
    pricingType: data.pricingType as PricingType,
    confirmationNumber: data.confirmationNumber || undefined,
    commissionTotalCents: data.commissionTotalCents ?? undefined,
    commissionSplitPercentage: data.commissionSplitPercentage ?? undefined,
    commissionExpectedDate: data.commissionExpectedDate || undefined,
    // Booking details - send undefined if empty to avoid overwriting
    termsAndConditions: data.termsAndConditions || undefined,
    cancellationPolicy: data.cancellationPolicy || undefined,
    supplier: data.supplier || undefined,
    // Agency pricing fields
    netPriceCents: data.netPriceCents ?? undefined,
    nonRefundableDeposit: data.nonRefundableDeposit ?? undefined,
    cancellationScheduleJson: data.cancellationScheduleJson?.length
      ? data.cancellationScheduleJson.map(item => ({
          daysRange: item.daysRange,
          penaltyPercent: item.penaltyPercent,
          penaltyAmountCents: item.penaltyAmountCents ?? undefined,
          effectiveDate: item.effectiveDate ?? undefined,
          description: item.description ?? undefined,
        }))
      : undefined,
    customCruiseDetails: {
      source: data.customCruiseDetails.source,
      traveltekCruiseId: data.customCruiseDetails.traveltekCruiseId || undefined,
      cruiseLineName: data.customCruiseDetails.cruiseLineName || undefined,
      cruiseLineCode: data.customCruiseDetails.cruiseLineCode || undefined,
      shipName: data.customCruiseDetails.shipName || undefined,
      shipCode: data.customCruiseDetails.shipCode || undefined,
      shipClass: data.customCruiseDetails.shipClass || undefined,
      shipImageUrl: data.customCruiseDetails.shipImageUrl || undefined,
      itineraryName: data.customCruiseDetails.itineraryName || undefined,
      voyageCode: data.customCruiseDetails.voyageCode || undefined,
      region: data.customCruiseDetails.region || undefined,
      nights: data.customCruiseDetails.nights ?? undefined,
      seaDays: data.customCruiseDetails.seaDays ?? undefined,
      departurePort: data.customCruiseDetails.departurePort || undefined,
      departureDate: data.customCruiseDetails.departureDate || undefined,
      departureTime: data.customCruiseDetails.departureTime || undefined,
      departureTimezone: data.customCruiseDetails.departureTimezone || undefined,
      arrivalPort: data.customCruiseDetails.arrivalPort || undefined,
      arrivalDate: data.customCruiseDetails.arrivalDate || undefined,
      arrivalTime: data.customCruiseDetails.arrivalTime || undefined,
      arrivalTimezone: data.customCruiseDetails.arrivalTimezone || undefined,
      cabinCategory: data.customCruiseDetails.cabinCategory || undefined,
      cabinCode: data.customCruiseDetails.cabinCode || undefined,
      cabinNumber: data.customCruiseDetails.cabinNumber || undefined,
      cabinDeck: data.customCruiseDetails.cabinDeck || undefined,
      cabinLocation: data.customCruiseDetails.cabinLocation || undefined,
      bookingNumber: data.customCruiseDetails.bookingNumber || undefined,
      fareCode: data.customCruiseDetails.fareCode || undefined,
      bookingDeadline: data.customCruiseDetails.bookingDeadline || undefined,
      portCallsJson: data.customCruiseDetails.portCallsJson,
      cabinPricingJson: data.customCruiseDetails.cabinPricingJson,
      shipContentJson: data.customCruiseDetails.shipContentJson,
      inclusions: data.customCruiseDetails.inclusions,
      specialRequests: data.customCruiseDetails.specialRequests || undefined,
      reservationNumber: data.customCruiseDetails.reservationNumber || undefined,
      stateroomCategoryCode: data.customCruiseDetails.stateroomCategoryCode || undefined,
      onboardCreditCents: data.customCruiseDetails.onboardCreditCents ?? undefined,
      onboardCreditCurrency: data.customCruiseDetails.onboardCreditCurrency || undefined,
    } as any,
  }
}

/**
 * Generate a cruise name from cruise details
 */
function generateCruiseName(data: CustomCruiseFormData): string {
  const parts: string[] = []

  if (data.customCruiseDetails.cruiseLineName) {
    parts.push(data.customCruiseDetails.cruiseLineName)
  }
  if (data.customCruiseDetails.shipName) {
    parts.push(data.customCruiseDetails.shipName)
  }
  if (data.customCruiseDetails.itineraryName) {
    parts.push(data.customCruiseDetails.itineraryName)
  } else if (data.customCruiseDetails.region) {
    parts.push(data.customCruiseDetails.region)
  }
  if (data.customCruiseDetails.nights) {
    parts.push(`${data.customCruiseDetails.nights}-Night`)
  }

  return parts.length > 0 ? parts.join(' ') : 'Cruise'
}

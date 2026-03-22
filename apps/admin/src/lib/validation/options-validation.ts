/**
 * Options Form Validation Schema
 *
 * Uses Zod for schema validation with react-hook-form integration.
 * Handles date coercion, Invalid Date rejection, and nested object validation.
 */

import { z } from 'zod'
import type { CreateOptionsActivityDto, OptionCategory, PricingType } from '@tailfire/shared-types/api'

// ============================================================================
// Options Details Schema (nested object)
// ============================================================================

export const optionsDetailsSchema = z.object({
  optionCategory: z.enum(['upgrade', 'add_on', 'tour', 'excursion', 'insurance', 'meal_plan', 'other']).nullable().optional(),
  isSelected: z.boolean().default(false),
  availabilityStartDate: z.string().nullable().optional(),
  availabilityEndDate: z.string().nullable().optional(),
  bookingDeadline: z.string().nullable().optional(),
  minParticipants: z.coerce.number().int().nonnegative().nullable().optional(),
  maxParticipants: z.coerce.number().int().nonnegative().nullable().optional(),
  spotsAvailable: z.coerce.number().int().nonnegative().nullable().optional(),
  durationMinutes: z.coerce.number().int().nonnegative().nullable().optional(),
  meetingPoint: z.string().optional().default(''),
  meetingTime: z.string().nullable().optional(),
  providerName: z.string().optional().default(''),
  providerPhone: z.string().optional().default(''),
  providerEmail: z.string().email().optional().or(z.literal('')).default(''),
  providerWebsite: z.string().optional().default(''),
  inclusions: z.array(z.string()).optional().default([]),
  exclusions: z.array(z.string()).optional().default([]),
  requirements: z.array(z.string()).optional().default([]),
  whatToBring: z.array(z.string()).optional().default([]),
  displayOrder: z.coerce.number().int().nullable().optional(),
  highlightText: z.string().max(100).optional().default(''),
  instructionsText: z.string().optional().default(''),
})

// ============================================================================
// Main Options Form Schema
// ============================================================================

export const optionsFormSchema = z.object({
  // Core fields
  itineraryDayId: z.string().min(1, 'Day is required'),
  componentType: z.literal('options').default('options'),
  name: z.string().min(1, 'Option name is required'),
  description: z.string().optional().default(''),
  proposalStatus: z.enum(['draft', 'proposing', 'approved', 'cancelled']).default('draft'),

  // Nested options details
  optionsDetails: optionsDetailsSchema,

  // Pricing fields (pricing data managed via activity_pricing table)
  pricingType: z.enum(['per_person', 'per_room', 'flat_rate', 'per_night']).default('per_person'),
  currency: z.string().length(3, 'Currency must be 3 characters').default('USD'),
  totalPriceCents: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative('Price cannot be negative'))
    .nullable()
    .optional(),
  taxesAndFeesCents: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative('Taxes cannot be negative'))
    .nullable()
    .optional(),
  confirmationNumber: z.string().optional().default(''),

  // Commission fields
  commissionTotalCents: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative())
    .nullable()
    .optional(),
  commissionSplitPercentage: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().min(0).max(100))
    .nullable()
    .optional(),
  commissionExpectedDate: z.string().nullable().optional(),

  // Booking details
  termsAndConditions: z.string().optional().default(''),
  cancellationPolicy: z.string().optional().default(''),
  supplier: z.string().optional().default(''),
})

export type OptionsFormData = z.infer<typeof optionsFormSchema>
export type OptionsDetailsData = z.infer<typeof optionsDetailsSchema>

// ============================================================================
// Field Names (for error mapping and useWatch)
// ============================================================================

export const OPTIONS_FORM_FIELDS = [
  'itineraryDayId',
  'componentType',
  'name',
  'description',
  'status',
  'optionsDetails',
  'optionsDetails.optionCategory',
  'optionsDetails.isSelected',
  'optionsDetails.availabilityStartDate',
  'optionsDetails.availabilityEndDate',
  'optionsDetails.bookingDeadline',
  'optionsDetails.minParticipants',
  'optionsDetails.maxParticipants',
  'optionsDetails.spotsAvailable',
  'optionsDetails.durationMinutes',
  'optionsDetails.meetingPoint',
  'optionsDetails.meetingTime',
  'optionsDetails.providerName',
  'optionsDetails.providerPhone',
  'optionsDetails.providerEmail',
  'optionsDetails.providerWebsite',
  'optionsDetails.inclusions',
  'optionsDetails.exclusions',
  'optionsDetails.requirements',
  'optionsDetails.whatToBring',
  'optionsDetails.displayOrder',
  'optionsDetails.highlightText',
  'optionsDetails.instructionsText',
  'pricingType',
  'currency',
  'totalPriceCents',
  'taxesAndFeesCents',
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
export function toOptionsDefaults(
  serverData?: Partial<OptionsFormData> | null,
  dayDate?: string | null,
  tripCurrency?: string
): OptionsFormData {
  const serverDetails = serverData?.optionsDetails

  return {
    itineraryDayId: serverData?.itineraryDayId ?? '',
    componentType: 'options',
    name: serverData?.name ?? '',
    description: serverData?.description ?? '',
    proposalStatus: serverData?.proposalStatus ?? 'draft',

    optionsDetails: {
      optionCategory: serverDetails?.optionCategory ?? null,
      isSelected: serverDetails?.isSelected ?? false,
      availabilityStartDate: serverDetails?.availabilityStartDate ?? dayDate ?? null,
      availabilityEndDate: serverDetails?.availabilityEndDate ?? null,
      bookingDeadline: serverDetails?.bookingDeadline ?? null,
      minParticipants: serverDetails?.minParticipants ?? null,
      maxParticipants: serverDetails?.maxParticipants ?? null,
      spotsAvailable: serverDetails?.spotsAvailable ?? null,
      durationMinutes: serverDetails?.durationMinutes ?? null,
      meetingPoint: serverDetails?.meetingPoint ?? '',
      meetingTime: serverDetails?.meetingTime ?? null,
      providerName: serverDetails?.providerName ?? '',
      providerPhone: serverDetails?.providerPhone ?? '',
      providerEmail: serverDetails?.providerEmail ?? '',
      providerWebsite: serverDetails?.providerWebsite ?? '',
      inclusions: serverDetails?.inclusions ?? [],
      exclusions: serverDetails?.exclusions ?? [],
      requirements: serverDetails?.requirements ?? [],
      whatToBring: serverDetails?.whatToBring ?? [],
      displayOrder: serverDetails?.displayOrder ?? null,
      highlightText: serverDetails?.highlightText ?? '',
      instructionsText: serverDetails?.instructionsText ?? '',
    },

    pricingType: serverData?.pricingType ?? 'per_person',
    currency: serverData?.currency ?? tripCurrency ?? 'USD',
    totalPriceCents: serverData?.totalPriceCents ?? null,
    taxesAndFeesCents: serverData?.taxesAndFeesCents ?? null,
    confirmationNumber: serverData?.confirmationNumber ?? '',

    commissionTotalCents: serverData?.commissionTotalCents ?? null,
    commissionSplitPercentage: serverData?.commissionSplitPercentage ?? null,
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
export function toOptionsApiPayload(data: OptionsFormData): CreateOptionsActivityDto {
  return {
    itineraryDayId: data.itineraryDayId,
    componentType: 'options',
    name: data.name,
    description: data.description,
    proposalStatus: data.proposalStatus,
    optionsDetails: {
      optionCategory: data.optionsDetails.optionCategory as OptionCategory | null,
      isSelected: data.optionsDetails.isSelected,
      availabilityStartDate: data.optionsDetails.availabilityStartDate,
      availabilityEndDate: data.optionsDetails.availabilityEndDate,
      bookingDeadline: data.optionsDetails.bookingDeadline,
      minParticipants: data.optionsDetails.minParticipants,
      maxParticipants: data.optionsDetails.maxParticipants,
      spotsAvailable: data.optionsDetails.spotsAvailable,
      durationMinutes: data.optionsDetails.durationMinutes,
      meetingPoint: data.optionsDetails.meetingPoint,
      meetingTime: data.optionsDetails.meetingTime,
      providerName: data.optionsDetails.providerName,
      providerPhone: data.optionsDetails.providerPhone,
      providerEmail: data.optionsDetails.providerEmail,
      providerWebsite: data.optionsDetails.providerWebsite,
      inclusions: data.optionsDetails.inclusions,
      exclusions: data.optionsDetails.exclusions,
      requirements: data.optionsDetails.requirements,
      whatToBring: data.optionsDetails.whatToBring,
      displayOrder: data.optionsDetails.displayOrder,
      highlightText: data.optionsDetails.highlightText,
      instructionsText: data.optionsDetails.instructionsText,
    },
    pricingType: data.pricingType as PricingType,
    currency: data.currency,
    totalPriceCents: data.totalPriceCents,
    taxesAndFeesCents: data.taxesAndFeesCents,
    confirmationNumber: data.confirmationNumber,
    commissionTotalCents: data.commissionTotalCents,
    commissionSplitPercentage: data.commissionSplitPercentage,
    commissionExpectedDate: data.commissionExpectedDate || null,
    // Booking details - send undefined if empty to avoid overwriting
    termsAndConditions: data.termsAndConditions || undefined,
    cancellationPolicy: data.cancellationPolicy || undefined,
    supplier: data.supplier || undefined,
  }
}

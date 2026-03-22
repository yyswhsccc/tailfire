/**
 * Lodging Form Validation Schema
 *
 * Uses Zod for schema validation with react-hook-form integration.
 * Handles date coercion, Invalid Date rejection, and cross-field validation.
 */

import { z } from 'zod'
import { addDays } from 'date-fns'
import type { CreateLodgingActivityDto, PricingType } from '@tailfire/shared-types/api'

// ============================================================================
// Helper: Validate date is not Invalid Date
// ============================================================================

const validDate = z.coerce.date().refine(
  (d) => !Number.isNaN(d.getTime()),
  { message: 'Invalid date' }
)

const optionalValidDate = z.coerce.date()
  .refine((d) => !Number.isNaN(d.getTime()), { message: 'Invalid date' })
  .nullable()
  .optional()

/**
 * Parse a YYYY-MM-DD string as LOCAL midnight (not UTC).
 * This prevents the off-by-one bug in western timezones.
 * Matches the logic in @/lib/date-utils parseISODate.
 */
function parseLocalDate(val: string | null | undefined): Date | null {
  if (!val || typeof val !== 'string') return null

  // Handle bare YYYY-MM-DD strings as LOCAL dates (not UTC)
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [yearStr, monthStr, dayStr] = val.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    const day = Number(dayStr)

    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
      return null
    }

    const date = new Date(year, month - 1, day) // Creates in local timezone

    // Guard against silent overflow (e.g., Feb 31 → Mar 2)
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null
    }

    return Number.isNaN(date.getTime()) ? null : date
  }

  // For other formats, try standard Date parsing
  const date = new Date(val)
  return Number.isNaN(date.getTime()) ? null : date
}

// ============================================================================
// Lodging Details Schema (nested object)
// ============================================================================

export const lodgingDetailsSchema = z.object({
  propertyName: z.string().min(1, 'Property name is required'),
  address: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  website: z.string().optional().default(''),
  checkInDate: validDate,
  checkInTime: z.string().optional().default('15:00'),
  checkOutDate: validDate,
  checkOutTime: z.string().optional().default('11:00'),
  timezone: z.string().optional().default(''),
  roomType: z.string().optional().default('standard'),
  roomCount: z.coerce.number().int().min(1).default(1),
  amenities: z.array(z.string()).optional().default([]),
  specialRequests: z.string().optional().default(''),
})

// ============================================================================
// Main Lodging Form Schema
// ============================================================================

export const lodgingFormSchema = z.object({
  // Core fields
  itineraryDayId: z.string().min(1, 'Day is required'),
  componentType: z.literal('lodging').default('lodging'),
  name: z.string().optional().default(''), // Auto-generated from propertyName
  description: z.string().optional().default(''),
  proposalStatus: z.enum(['draft', 'proposing', 'approved', 'cancelled']).default('draft'),

  // Nested lodging details
  lodgingDetails: lodgingDetailsSchema,

  // Pricing fields (basic - detailed validation in pricing lib)
  totalPriceCents: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative('Price cannot be negative'))
    .default(0),
  taxesAndFeesCents: z.coerce.number()
    .refine((v) => !Number.isNaN(v), { message: 'Invalid number' })
    .pipe(z.number().nonnegative('Taxes cannot be negative'))
    .default(0),
  currency: z.string().default('CAD'),
  pricingType: z.enum(['per_room', 'per_person', 'total']).default('per_room'),
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
  commissionExpectedDate: optionalValidDate,

  // Booking details
  termsAndConditions: z.string().optional().default(''),
  cancellationPolicy: z.string().optional().default(''),
  supplier: z.string().optional().default(''),
}).refine(
  (data) => data.lodgingDetails.checkOutDate > data.lodgingDetails.checkInDate,
  {
    message: 'Check-out date must be after check-in date',
    path: ['lodgingDetails', 'checkOutDate']
  }
)

export type LodgingFormData = z.infer<typeof lodgingFormSchema>
export type LodgingDetailsData = z.infer<typeof lodgingDetailsSchema>

// ============================================================================
// Field Names (for error mapping and useWatch)
// ============================================================================

export const LODGING_FORM_FIELDS = [
  'itineraryDayId',
  'componentType',
  'name',
  'description',
  'status',
  'lodgingDetails',
  'lodgingDetails.propertyName',
  'lodgingDetails.address',
  'lodgingDetails.phone',
  'lodgingDetails.website',
  'lodgingDetails.checkInDate',
  'lodgingDetails.checkInTime',
  'lodgingDetails.checkOutDate',
  'lodgingDetails.checkOutTime',
  'lodgingDetails.timezone',
  'lodgingDetails.roomType',
  'lodgingDetails.roomCount',
  'lodgingDetails.amenities',
  'lodgingDetails.specialRequests',
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
 * Parse a date value safely, returning fallback if invalid.
 * Uses parseLocalDate for string inputs to avoid off-by-one timezone bugs.
 */
function parseDate(val: unknown, fallback: Date): Date {
  if (!val) return fallback
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? fallback : val
  }
  // Use parseLocalDate for strings to handle YYYY-MM-DD correctly
  const parsed = parseLocalDate(String(val))
  return parsed ?? fallback
}

/**
 * Creates default form values, handling server data hydration
 * Ensures checkOutDate defaults to day after checkInDate to pass validation
 *
 * @param serverData - Existing data to hydrate (for edit mode)
 * @param dayDate - Date of the day this activity is assigned to (from drop target)
 * @param tripStartDate - Trip start date as fallback when no dayDate (for new activities)
 */
export function toLodgingDefaults(
  serverData?: Partial<LodgingFormData> | null,
  dayDate?: string | null,
  tripStartDate?: string | null
): LodgingFormData {
  // Priority: dayDate (dropped on day) > tripStartDate > today
  // Use parseLocalDate to avoid off-by-one timezone bugs with YYYY-MM-DD strings
  const fallbackDate = dayDate || tripStartDate
  const parsedDate = fallbackDate ? parseLocalDate(fallbackDate) : null
  const validBaseDate = parsedDate ?? new Date()

  // Handle nested lodgingDetails from server
  const serverDetails = serverData?.lodgingDetails

  // Parse dates with fallbacks
  const checkInDate = parseDate(serverDetails?.checkInDate, validBaseDate)
  const checkOutDate = parseDate(
    serverDetails?.checkOutDate,
    addDays(checkInDate, 1) // Default to day after check-in
  )

  // Ensure checkout is after checkin (fix if server data is invalid)
  const validCheckOutDate = checkOutDate > checkInDate
    ? checkOutDate
    : addDays(checkInDate, 1)

  return {
    itineraryDayId: serverData?.itineraryDayId ?? '',
    componentType: 'lodging',
    name: serverData?.name ?? '',
    description: serverData?.description ?? '',
    proposalStatus: serverData?.proposalStatus ?? 'draft',

    lodgingDetails: {
      propertyName: serverDetails?.propertyName ?? '',
      address: serverDetails?.address ?? '',
      phone: serverDetails?.phone ?? '',
      website: serverDetails?.website ?? '',
      checkInDate,
      checkInTime: serverDetails?.checkInTime ?? '15:00',
      checkOutDate: validCheckOutDate,
      checkOutTime: serverDetails?.checkOutTime ?? '11:00',
      timezone: serverDetails?.timezone ?? '',
      roomType: serverDetails?.roomType ?? 'standard',
      roomCount: serverDetails?.roomCount ?? 1,
      amenities: serverDetails?.amenities ?? [],
      specialRequests: serverDetails?.specialRequests ?? '',
    },

    totalPriceCents: serverData?.totalPriceCents ?? 0,
    taxesAndFeesCents: serverData?.taxesAndFeesCents ?? 0,
    currency: serverData?.currency ?? 'CAD',
    pricingType: serverData?.pricingType ?? 'per_room',
    confirmationNumber: serverData?.confirmationNumber ?? '',

    commissionTotalCents: serverData?.commissionTotalCents ?? 0,
    commissionSplitPercentage: serverData?.commissionSplitPercentage ?? 0,
    commissionExpectedDate: serverData?.commissionExpectedDate
      ? parseDate(serverData.commissionExpectedDate, new Date())
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
 * Convert Date to ISO string for API (YYYY-MM-DD)
 */
function formatDateForApi(date: Date | null | undefined): string | null {
  if (!date) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Normalize time string to HH:MM:SS format.
 * Handles both HH:MM and HH:MM:SS inputs.
 */
function normalizeTime(value?: string | null): string | null {
  if (!value) return null
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null
  const hh = match[1]!.padStart(2, '0')
  const mm = match[2]!
  const ss = match[3] ?? '00'
  return `${hh}:${mm}:${ss}`
}

/**
 * Combines date and optional time into ISO datetime string.
 * Uses 12:00:00 noon as default time if not provided.
 */
function combineDateAndTime(date: Date | null, time: string | null): string | null {
  if (!date) return null
  const timePart = normalizeTime(time) ?? '12:00:00'
  return `${formatDateForApi(date)}T${timePart}`
}

/**
 * Maps form data to API payload with proper type conversions.
 * Converts Date objects to ISO strings as expected by the API.
 */
export function toApiPayload(data: LodgingFormData): CreateLodgingActivityDto {
  return {
    itineraryDayId: data.itineraryDayId,
    componentType: 'lodging',
    name: data.lodgingDetails.propertyName, // Auto-name from property
    description: data.description,
    status: data.status,
    // Compute startDatetime/endDatetime for spanning activity display
    startDatetime: combineDateAndTime(
      data.lodgingDetails.checkInDate,
      data.lodgingDetails.checkInTime
    ),
    endDatetime: combineDateAndTime(
      data.lodgingDetails.checkOutDate,
      data.lodgingDetails.checkOutTime
    ),
    lodgingDetails: {
      propertyName: data.lodgingDetails.propertyName,
      address: data.lodgingDetails.address,
      phone: data.lodgingDetails.phone,
      website: data.lodgingDetails.website,
      checkInDate: formatDateForApi(data.lodgingDetails.checkInDate),
      checkInTime: data.lodgingDetails.checkInTime,
      checkOutDate: formatDateForApi(data.lodgingDetails.checkOutDate),
      checkOutTime: data.lodgingDetails.checkOutTime,
      timezone: data.lodgingDetails.timezone,
      roomType: data.lodgingDetails.roomType,
      roomCount: data.lodgingDetails.roomCount,
      amenities: data.lodgingDetails.amenities,
      specialRequests: data.lodgingDetails.specialRequests,
    },
    totalPriceCents: data.totalPriceCents,
    taxesAndFeesCents: data.taxesAndFeesCents,
    currency: data.currency,
    pricingType: data.pricingType as PricingType,
    confirmationNumber: data.confirmationNumber,
    commissionTotalCents: data.commissionTotalCents ?? 0,
    commissionSplitPercentage: data.commissionSplitPercentage ?? 0,
    commissionExpectedDate: data.commissionExpectedDate
      ? formatDateForApi(data.commissionExpectedDate)
      : null,
    // Booking details - send undefined if empty to avoid overwriting
    termsAndConditions: data.termsAndConditions || undefined,
    cancellationPolicy: data.cancellationPolicy || undefined,
    supplier: data.supplier || undefined,
  }
}

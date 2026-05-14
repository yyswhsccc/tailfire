/**
 * Tour Form Validation Schema
 *
 * Uses Zod for schema validation with react-hook-form integration.
 * Tours use the generic activity API with activityType: 'tour'.
 */

import { z } from 'zod'
import { optionalHttpsUrl } from './utils'
import type { CreateActivityDto, PricingType } from '@tailfire/shared-types/api'

// ============================================================================
// Tour Subtypes
// ============================================================================

export const TOUR_SUBTYPES = [
  { value: 'walking', label: 'Walking Tour' },
  { value: 'bus', label: 'Bus Tour' },
  { value: 'boat', label: 'Boat Tour' },
  { value: 'bike', label: 'Bike Tour' },
  { value: 'food', label: 'Food Tour' },
  { value: 'wine', label: 'Wine Tour' },
  { value: 'museum', label: 'Museum Tour' },
  { value: 'city', label: 'City Tour' },
  { value: 'adventure', label: 'Adventure Tour' },
  { value: 'cultural', label: 'Cultural Tour' },
  { value: 'historical', label: 'Historical Tour' },
  { value: 'nature', label: 'Nature Tour' },
  { value: 'private', label: 'Private Tour' },
  { value: 'group', label: 'Group Tour' },
  { value: 'other', label: 'Other' },
] as const

export type TourSubtype = (typeof TOUR_SUBTYPES)[number]['value']

// ============================================================================
// Tour Details Schema (nested object)
// ============================================================================

export const tourDetailsSchema = z.object({
  tourName: z.string().min(1, 'Tour name is required'),
  tourSubtype: z.string().optional().default(''),
  location: z.string().optional().default(''),
  address: z.string().optional().default(''),
  tourDate: z.string().nullable().optional(),
  startTime: z.string().optional().default('09:00'),
  endTime: z.string().optional().default(''),
  timezone: z.string().optional().default(''),
  isOvernight: z.boolean().optional().default(false),
  durationMinutes: z.coerce.number().int().min(0).nullable().optional(),
  meetingPoint: z.string().optional().default(''),
  providerName: z.string().optional().default(''),
  providerPhone: z.string().optional().default(''),
  providerEmail: z.string().optional().default(''),
  providerWebsite: z.string().optional().default(''),
  inclusions: z.array(z.string()).optional().default([]),
  exclusions: z.array(z.string()).optional().default([]),
  whatToBring: z.array(z.string()).optional().default([]),
  specialRequests: z.string().optional().default(''),
})

// ============================================================================
// Main Tour Form Schema
// ============================================================================

export const tourFormSchema = z.object({
  // Core fields
  itineraryDayId: z.string().min(1, 'Day is required'),
  componentType: z.literal('tour').default('tour'),
  name: z.string().optional().default(''), // Auto-generated from tourName
  description: z.string().optional().default(''),
  proposalStatus: z.enum(['draft', 'proposing', 'approved', 'cancelled']).default('draft'),

  // Nested tour details
  tourDetails: tourDetailsSchema,

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
  // #302 — optional external "Book this activity" CTA URL rendered in the
  // client portal proposal preview
  referralUrl: optionalHttpsUrl,

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

export type TourFormData = z.infer<typeof tourFormSchema>
export type TourDetailsData = z.infer<typeof tourDetailsSchema>

// ============================================================================
// Field Names (for error mapping and useWatch)
// ============================================================================

export const TOUR_FORM_FIELDS = [
  'itineraryDayId',
  'componentType',
  'name',
  'description',
  'status',
  'tourDetails',
  'tourDetails.tourName',
  'tourDetails.tourSubtype',
  'tourDetails.location',
  'tourDetails.address',
  'tourDetails.tourDate',
  'tourDetails.startTime',
  'tourDetails.endTime',
  'tourDetails.timezone',
  'tourDetails.isOvernight',
  'tourDetails.durationMinutes',
  'tourDetails.meetingPoint',
  'tourDetails.providerName',
  'tourDetails.providerPhone',
  'tourDetails.providerEmail',
  'tourDetails.providerWebsite',
  'tourDetails.inclusions',
  'tourDetails.exclusions',
  'tourDetails.whatToBring',
  'tourDetails.specialRequests',
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
 */
function parseStringDate(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val
  }
  const str = typeof val === 'string' ? val : ''
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(str) ? `${str}T00:00:00Z` : str
  const d = val instanceof Date ? val : new Date(dateStr || String(val))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0] ?? null
}

/**
 * Creates default form values, handling server data hydration
 */
export function toTourDefaults(
  serverData?: Partial<TourFormData> | null,
  dayDate?: string | null,
  tripCurrency?: string
): TourFormData {
  const serverDetails = serverData?.tourDetails

  return {
    itineraryDayId: serverData?.itineraryDayId ?? '',
    componentType: 'tour',
    name: serverData?.name ?? '',
    description: serverData?.description ?? '',
    proposalStatus: serverData?.proposalStatus ?? 'draft',

    tourDetails: {
      tourName: serverDetails?.tourName ?? '',
      tourSubtype: serverDetails?.tourSubtype ?? '',
      location: serverDetails?.location ?? '',
      address: serverDetails?.address ?? '',
      tourDate: serverDetails?.tourDate ?? dayDate ?? null,
      startTime: serverDetails?.startTime ?? '09:00',
      endTime: serverDetails?.endTime ?? '',
      timezone: serverDetails?.timezone ?? '',
      isOvernight: serverDetails?.isOvernight ?? false,
      durationMinutes: serverDetails?.durationMinutes ?? null,
      meetingPoint: serverDetails?.meetingPoint ?? '',
      providerName: serverDetails?.providerName ?? '',
      providerPhone: serverDetails?.providerPhone ?? '',
      providerEmail: serverDetails?.providerEmail ?? '',
      providerWebsite: serverDetails?.providerWebsite ?? '',
      inclusions: serverDetails?.inclusions ?? [],
      exclusions: serverDetails?.exclusions ?? [],
      whatToBring: serverDetails?.whatToBring ?? [],
      specialRequests: serverDetails?.specialRequests ?? '',
    },

    totalPriceCents: serverData?.totalPriceCents ?? 0,
    taxesAndFeesCents: serverData?.taxesAndFeesCents ?? 0,
    currency: serverData?.currency ?? tripCurrency ?? 'CAD',
    pricingType: serverData?.pricingType ?? 'per_person',
    confirmationNumber: serverData?.confirmationNumber ?? '',
    referralUrl: serverData?.referralUrl ?? '',

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
 * Compute ISO datetime from date and time strings
 */
function computeDatetime(date: string | null | undefined, time: string | null | undefined, _timezone?: string): string | null {
  if (!date) return null
  const timeStr = time || '00:00'
  // Return ISO string - timezone handling happens server-side
  return `${date}T${timeStr}:00`
}

/**
 * Maps form data to API payload for creating/updating activities.
 * Uses the generic activity API with activityType: 'tour'.
 */
export function toTourApiPayload(data: TourFormData): CreateActivityDto & {
  totalPriceCents?: number
  taxesAndFeesCents?: number
  commissionTotalCents?: number
  commissionSplitPercentage?: number
  commissionExpectedDate?: string | null
  termsAndConditions?: string
  cancellationPolicy?: string
  supplier?: string
  bookingDate?: string | null
} {
  const { tourDetails } = data

  // Build notes field with tour-specific metadata
  const metadata: string[] = []
  if (tourDetails.tourSubtype) {
    metadata.push(`Tour Type: ${tourDetails.tourSubtype}`)
  }
  if (tourDetails.isOvernight) {
    metadata.push('Overnight: Yes')
  }
  if (tourDetails.durationMinutes) {
    const hours = Math.floor(tourDetails.durationMinutes / 60)
    const mins = tourDetails.durationMinutes % 60
    metadata.push(`Duration: ${hours > 0 ? `${hours}h ` : ''}${mins > 0 ? `${mins}m` : ''}`.trim())
  }
  if (tourDetails.meetingPoint) {
    metadata.push(`Meeting Point: ${tourDetails.meetingPoint}`)
  }
  if (tourDetails.providerName) {
    metadata.push(`Provider: ${tourDetails.providerName}`)
  }
  if (tourDetails.providerPhone) {
    metadata.push(`Phone: ${tourDetails.providerPhone}`)
  }
  if (tourDetails.providerEmail) {
    metadata.push(`Email: ${tourDetails.providerEmail}`)
  }
  if (tourDetails.providerWebsite) {
    metadata.push(`Website: ${tourDetails.providerWebsite}`)
  }
  if (tourDetails.inclusions?.length) {
    metadata.push(`Inclusions: ${tourDetails.inclusions.join(', ')}`)
  }
  if (tourDetails.exclusions?.length) {
    metadata.push(`Exclusions: ${tourDetails.exclusions.join(', ')}`)
  }
  if (tourDetails.whatToBring?.length) {
    metadata.push(`What to Bring: ${tourDetails.whatToBring.join(', ')}`)
  }
  if (tourDetails.specialRequests) {
    metadata.push(`Special Requests: ${tourDetails.specialRequests}`)
  }

  const notesContent = metadata.join('\n')

  return {
    itineraryDayId: data.itineraryDayId,
    activityType: 'tour',
    name: tourDetails.tourName,
    description: data.description,
    proposalStatus: data.proposalStatus,
    location: tourDetails.location || null,
    address: tourDetails.address || null,
    startDatetime: computeDatetime(tourDetails.tourDate, tourDetails.startTime, tourDetails.timezone),
    endDatetime: tourDetails.endTime
      ? computeDatetime(tourDetails.tourDate, tourDetails.endTime, tourDetails.timezone)
      : null,
    timezone: tourDetails.timezone || null,
    notes: notesContent || null,
    confirmationNumber: data.confirmationNumber || null,
    referralUrl: data.referralUrl || null,
    pricingType: data.pricingType as PricingType,
    currency: data.currency,
    // Extended fields for pricing
    totalPriceCents: data.totalPriceCents,
    taxesCents: data.taxesAndFeesCents,
    commissionTotalCents: data.commissionTotalCents ?? 0,
    commissionSplitPercentage: data.commissionSplitPercentage ?? 0,
    termsAndConditions: data.termsAndConditions || undefined,
    cancellationPolicy: data.cancellationPolicy || undefined,
    supplier: data.supplier || undefined,
    bookingDate: (data as any).bookingDate || null,
  }
}

/**
 * Parse notes field back to tour details (for edit mode)
 */
export function parseTourNotesToDetails(notes: string | null): Partial<TourDetailsData> {
  if (!notes) return {}

  const details: Partial<TourDetailsData> = {}
  const lines = notes.split('\n')

  for (const line of lines) {
    if (line.startsWith('Tour Type: ')) {
      details.tourSubtype = line.replace('Tour Type: ', '')
    } else if (line === 'Overnight: Yes') {
      details.isOvernight = true
    } else if (line.startsWith('Duration: ')) {
      const match = line.match(/Duration: (?:(\d+)h )?(?:(\d+)m)?/)
      if (match) {
        const hours = parseInt(match[1] || '0', 10)
        const mins = parseInt(match[2] || '0', 10)
        details.durationMinutes = hours * 60 + mins
      }
    } else if (line.startsWith('Meeting Point: ')) {
      details.meetingPoint = line.replace('Meeting Point: ', '')
    } else if (line.startsWith('Provider: ')) {
      details.providerName = line.replace('Provider: ', '')
    } else if (line.startsWith('Phone: ')) {
      details.providerPhone = line.replace('Phone: ', '')
    } else if (line.startsWith('Email: ')) {
      details.providerEmail = line.replace('Email: ', '')
    } else if (line.startsWith('Website: ')) {
      details.providerWebsite = line.replace('Website: ', '')
    } else if (line.startsWith('Inclusions: ')) {
      details.inclusions = line.replace('Inclusions: ', '').split(', ')
    } else if (line.startsWith('Exclusions: ')) {
      details.exclusions = line.replace('Exclusions: ', '').split(', ')
    } else if (line.startsWith('What to Bring: ')) {
      details.whatToBring = line.replace('What to Bring: ', '').split(', ')
    } else if (line.startsWith('Special Requests: ')) {
      details.specialRequests = line.replace('Special Requests: ', '')
    }
  }

  return details
}
